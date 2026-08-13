'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import SelecionarItemCotacaoModal, { ItemCotacaoForm } from '@/components/SelecionarItemCotacaoModal'
import SelecionarFornecedorLista from '@/components/SelecionarFornecedorLista'
import NovaParteRapidaModal from '@/components/NovaParteRapidaModal'
import {
  criarCotacao,
  criarCotacaoEstimativa,
  estimarPrecosCotacao,
  PrecoEstimado,
  ItemParaEstimar,
} from '@/lib/financeiro-cotacoes'
import { buscarQuantidadeCompradaUltimosDias } from '@/lib/financeiro-compras-relatorio'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, AlertCircle, ChevronDown } from 'lucide-react'
import { FinanceiroParte, FinanceiroMateriaPrima, UnidadeFinanceiro, TipoCotacao } from '@/lib/types'
import { UNIDADE_LABEL } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'
import { formatarQuantidade } from '@/lib/financeiro-utils'

export default function NovaCotacaoPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const [materias, setMaterias] = useState<FinanceiroMateriaPrima[]>([])
  const [fornecedores, setFornecedores] = useState<FinanceiroParte[]>([])

  const [titulo, setTitulo] = useState('')
  const [unidade, setUnidade] = useState<UnidadeFinanceiro>('loja1')
  const [dataEntregaPlanejada, setDataEntregaPlanejada] = useState('')
  const [itens, setItens] = useState<ItemCotacaoForm[]>([])
  const [modalAberto, setModalAberto] = useState(false)
  const [modalNovoFornecedor, setModalNovoFornecedor] = useState(false)
  const [fornecedoresSelecionados, setFornecedoresSelecionados] = useState<Set<string>>(new Set())

  const [tipo, setTipo] = useState<TipoCotacao>('fornecedores')
  const [fornecedorEstimativaId, setFornecedorEstimativaId] = useState('')
  const [estimativas, setEstimativas] = useState<Map<string, PrecoEstimado>>(new Map())
  const [calculandoEstimativa, setCalculandoEstimativa] = useState(false)
  // Preço que o usuário editou à mão pra um item, por materia_prima_id —
  // tem prioridade sobre a estimativa automática (mesmo princípio de
  // "manual sempre vence" do custo_manual_por_unidade_compra).
  const [precosEditados, setPrecosEditados] = useState<Map<string, number>>(new Map())
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [ultimaSemana, setUltimaSemana] = useState<Map<string, number | 'carregando'>>(new Map())

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase
      .from('financeiro_materias_primas')
      .select('*, conta:financeiro_contas(codigo, nome)')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setMaterias(data || []))
    supabase
      .from('financeiro_partes')
      .select('*')
      .eq('papel_fornecedor', true)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setFornecedores(data || []))
  }, [])

  function removerItem(indice: number) {
    setItens((prev) => prev.filter((_, i) => i !== indice))
  }

  function alterarQuantidadeItem(indice: number, novaQuantidade: number) {
    if (!novaQuantidade || novaQuantidade <= 0) return
    setItens((prev) => prev.map((it, i) => (i === indice ? { ...it, quantidade: novaQuantidade } : it)))
  }

  // Preço efetivo de um item: o que o usuário editou à mão, senão a
  // estimativa automática (histórico com o fornecedor escolhido).
  function valorUnitarioEfetivo(item: ItemCotacaoForm): number | null {
    return precosEditados.get(item.materia_prima_id) ?? estimativas.get(item.materia_prima_id)?.valor_unitario ?? null
  }

  function alterarPrecoEditado(materiaPrimaId: string, valor: number) {
    setPrecosEditados((prev) => {
      const novo = new Map(prev)
      if (valor > 0) novo.set(materiaPrimaId, valor)
      else novo.delete(materiaPrimaId)
      return novo
    })
  }

  // Mesmo padrão do painel "última semana" da tela de detalhe: busca sob
  // demanda na primeira expansão de cada matéria-prima, cacheado no Map.
  function alternarExpandido(materiaPrimaId: string) {
    setExpandidos((prev) => {
      const novo = new Set(prev)
      if (novo.has(materiaPrimaId)) novo.delete(materiaPrimaId)
      else novo.add(materiaPrimaId)
      return novo
    })
    if (!ultimaSemana.has(materiaPrimaId)) {
      setUltimaSemana((prev) => new Map(prev).set(materiaPrimaId, 'carregando'))
      buscarQuantidadeCompradaUltimosDias(materiaPrimaId, 7).then((qtd) => {
        setUltimaSemana((prev) => new Map(prev).set(materiaPrimaId, qtd))
      })
    }
  }

  function alternarFornecedor(id: string) {
    setFornecedoresSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  // Estimativa ao vivo enquanto a lista é montada — "ter noção de quanto
  // vai gastar" já antes de salvar, não só depois.
  useEffect(() => {
    if (tipo !== 'estimativa' || !fornecedorEstimativaId || itens.length === 0) {
      setEstimativas(new Map())
      return
    }
    let cancelado = false
    const paraEstimar: ItemParaEstimar[] = itens.map((i) => ({
      materia_prima_id: i.materia_prima_id,
      quantidade: i.quantidade,
      fator_conversao: materias.find((m) => m.id === i.materia_prima_id)?.fator_conversao ?? 1,
    }))
    setCalculandoEstimativa(true)
    estimarPrecosCotacao(paraEstimar, fornecedorEstimativaId).then((mapa) => {
      if (!cancelado) {
        setEstimativas(mapa)
        setCalculandoEstimativa(false)
      }
    })
    return () => {
      cancelado = true
    }
  }, [tipo, fornecedorEstimativaId, itens, materias])

  const totalEstimado = itens.reduce((acc, i) => {
    const vu = valorUnitarioEfetivo(i)
    return acc + (vu != null ? vu * i.quantidade : 0)
  }, 0)
  const itensSemEstimativa = itens.filter((i) => valorUnitarioEfetivo(i) == null).length

  const podeSalvar =
    titulo.trim() && itens.length > 0 && (tipo === 'fornecedores' ? fornecedoresSelecionados.size > 0 : !!fornecedorEstimativaId)

  async function salvar() {
    if (!podeSalvar || !usuario) {
      setErro(
        tipo === 'fornecedores'
          ? 'Preencha um título, adicione ao menos um item e convide ao menos um fornecedor.'
          : 'Preencha um título, adicione ao menos um item e escolha o fornecedor.'
      )
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const itensPayload = itens.map((i) => ({
        materia_prima_id: i.materia_prima_id,
        quantidade: i.quantidade,
        unidade_cotacao: i.unidade_cotacao,
        observacao: i.observacao,
      }))
      const id =
        tipo === 'fornecedores'
          ? await criarCotacao(titulo.trim(), unidade, itensPayload, Array.from(fornecedoresSelecionados), usuario.id, dataEntregaPlanejada || undefined)
          : await criarCotacaoEstimativa(
              titulo.trim(),
              unidade,
              itensPayload,
              fornecedorEstimativaId,
              usuario.id,
              dataEntregaPlanejada || undefined,
              precosEditados
            )
      router.push(`/financeiro/cotacoes/${id}`)
    } catch (err: any) {
      console.error('Erro ao criar cotação:', err)
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
    }
  }

  return (
    <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader title="Nova Cotação" onBack={() => router.back()} />

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-3">
            <h2 className="font-semibold text-gray-800">Tipo de cotação</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTipo('fornecedores')}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold border-2 ${
                  tipo === 'fornecedores' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                Cotação com fornecedores
              </button>
              <button
                type="button"
                onClick={() => setTipo('estimativa')}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold border-2 ${
                  tipo === 'estimativa' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                Lista de compras (estimativa)
              </button>
            </div>
            {tipo === 'estimativa' && (
              <p className="text-xs text-gray-400">
                Lista simples pra compra à vista (ex: supermercado) — preço estimado a partir do histórico com o fornecedor escolhido, sem pedido formal.
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Dados da cotação</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Título</label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Embalagens Julho/2026"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Unidade</label>
              <div className="flex gap-2">
                {(['loja1', 'loja2', 'rateio'] as UnidadeFinanceiro[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnidade(u)}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold border-2 ${
                      unidade === u ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    {UNIDADE_LABEL[u]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {tipo === 'estimativa' ? 'Data planejada da compra (opcional)' : 'Data de entrega planejada (opcional)'}
              </label>
              <input
                type="date"
                value={dataEntregaPlanejada}
                onChange={(e) => setDataEntregaPlanejada(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                {tipo === 'estimativa'
                  ? 'Pra lembrar quando pretende ir — não aparece em PDF.'
                  : 'Prazo pedido ao fornecedor — sai impresso no PDF da cotação.'}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">{tipo === 'fornecedores' ? 'Fornecedores convidados' : 'Fornecedor'}</h2>
            </div>
            {tipo === 'fornecedores' ? (
              <SelecionarFornecedorLista
                fornecedores={fornecedores}
                selecionados={Array.from(fornecedoresSelecionados)}
                multiplo
                onAdicionar={(id) => alternarFornecedor(id)}
                onRemover={(id) => alternarFornecedor(id)}
                onCadastrarNovo={() => setModalNovoFornecedor(true)}
              />
            ) : (
              <SelecionarFornecedorLista
                fornecedores={fornecedores}
                selecionados={fornecedorEstimativaId ? [fornecedorEstimativaId] : []}
                multiplo={false}
                onAdicionar={(id) => setFornecedorEstimativaId(id)}
                onRemover={() => setFornecedorEstimativaId('')}
                onCadastrarNovo={() => setModalNovoFornecedor(true)}
              />
            )}
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Itens a cotar</h2>
              <button
                onClick={() => setModalAberto(true)}
                className="bg-pink-700 text-white rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-pink-800"
              >
                <Plus size={16} /> Adicionar item
              </button>
            </div>

            {itens.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center text-sm text-gray-400">
                Nenhum item ainda — clique em "Adicionar item" para pesquisar no cadastro de matérias-primas.
              </div>
            ) : tipo === 'fornecedores' ? (
              <div className="space-y-2">
                {itens.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                    <div>
                      <p className="font-medium text-gray-800">{item.materia_prima_nome}</p>
                      <p className="text-xs text-gray-500">
                        {item.quantidade} {item.unidade_cotacao}
                        {item.observacao ? ` · ${item.observacao}` : ''}
                      </p>
                    </div>
                    <button onClick={() => removerItem(i)} className="text-red-600 hover:text-red-700">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {itens.map((item, i) => {
                  const materia = materias.find((m) => m.id === item.materia_prima_id)
                  const vu = valorUnitarioEfetivo(item)
                  const fatorConversao = materia?.fator_conversao ?? 1
                  const unidadeMedida = materia?.unidade_medida ?? ''
                  const quantidadeConvertida = item.quantidade * fatorConversao
                  const precoPorUnidadeMedida = vu != null && fatorConversao ? vu / fatorConversao : null
                  const total = vu != null ? vu * item.quantidade : null
                  const expandido = expandidos.has(item.materia_prima_id)
                  const semanaValor = ultimaSemana.get(item.materia_prima_id)
                  return (
                    <div key={i} className="py-2 border-b border-gray-50 last:border-0 bg-gray-50 rounded-lg px-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => alternarExpandido(item.materia_prima_id)}
                          className="flex-1 min-w-0 flex items-center gap-1 text-left"
                        >
                          <ChevronDown size={14} className={`flex-shrink-0 text-gray-400 transition-transform ${expandido ? 'rotate-180' : ''}`} />
                          <span className="min-w-0">
                            <p className="font-medium text-gray-800 truncate">{item.materia_prima_nome}</p>
                            {item.observacao && <p className="text-xs text-gray-400 truncate">{item.observacao}</p>}
                          </span>
                        </button>
                        <input
                          key={`${i}-qtd-${item.quantidade}`}
                          type="number"
                          step="any"
                          min={0}
                          defaultValue={item.quantidade}
                          onBlur={(e) => alterarQuantidadeItem(i, Number(e.target.value))}
                          className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right"
                        />
                        <span className="text-xs text-gray-500 w-8">{item.unidade_cotacao}</span>
                        <button onClick={() => removerItem(i)} className="text-red-600 hover:text-red-700 flex-shrink-0">
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 pl-5 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <span>R$</span>
                          <input
                            key={`${item.materia_prima_id}-preco-${vu ?? ''}`}
                            type="number"
                            step="any"
                            min={0}
                            defaultValue={vu ?? ''}
                            placeholder="—"
                            onBlur={(e) => alterarPrecoEditado(item.materia_prima_id, Number(e.target.value))}
                            className="w-16 border border-gray-300 rounded-lg px-1.5 py-1 text-right"
                          />
                          <span>/{item.unidade_cotacao}</span>
                        </div>
                        {unidadeMedida && fatorConversao !== 1 && (
                          <span>
                            = {formatarQuantidade(quantidadeConvertida, unidadeMedida)}
                            {precoPorUnidadeMedida != null && ` · ${formatBRL(precoPorUnidadeMedida)}/${unidadeMedida}`}
                          </span>
                        )}
                        <span className="ml-auto font-medium text-gray-800">
                          {total != null ? formatBRL(total) : <span className="text-amber-600">sem estimativa</span>}
                        </span>
                      </div>

                      {expandido && (
                        <div className="mt-1.5 pl-5 text-xs text-gray-500">
                          Comprado nos últimos 7 dias:{' '}
                          {semanaValor === 'carregando' || semanaValor == null ? (
                            'Calculando...'
                          ) : (
                            <span className="font-medium text-gray-700">{formatarQuantidade(semanaValor, unidadeMedida || item.unidade_cotacao)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {tipo === 'estimativa' && itens.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-2">
              <h2 className="font-semibold text-gray-800">Total estimado</h2>
              {!fornecedorEstimativaId ? (
                <p className="text-xs text-gray-400">Escolha um fornecedor para calcular a estimativa.</p>
              ) : calculandoEstimativa ? (
                <p className="text-sm text-gray-400">Calculando...</p>
              ) : (
                <>
                  <p className="text-2xl font-bold text-gray-800">{formatBRL(totalEstimado)}</p>
                  {itensSemEstimativa > 0 && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle size={12} /> {itensSemEstimativa} de {itens.length} sem histórico de preço — estimativa parcial.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <button
            onClick={salvar}
            disabled={salvando || !podeSalvar}
            className="w-full bg-green-600 text-white rounded-lg py-3 font-semibold disabled:opacity-50"
          >
            {salvando ? 'Criando...' : 'Criar Cotação'}
          </button>
        </div>
      </div>

      {modalAberto && (
        <SelecionarItemCotacaoModal
          materias={materias}
          onAdd={(item) => setItens((prev) => [...prev, item])}
          onClose={() => setModalAberto(false)}
          onMateriaPrimaCriada={(nova) => setMaterias((prev) => [...prev, nova].sort((a, b) => a.nome.localeCompare(b.nome)))}
        />
      )}

      {modalNovoFornecedor && (
        <NovaParteRapidaModal
          papelPadrao="fornecedor"
          onClose={() => setModalNovoFornecedor(false)}
          onCreated={(novo) => {
            setFornecedores((prev) => [...prev, novo].sort((a, b) => a.nome.localeCompare(b.nome)))
            if (tipo === 'fornecedores') setFornecedoresSelecionados((prev) => new Set(prev).add(novo.id))
            else setFornecedorEstimativaId(novo.id)
          }}
        />
      )}
    </ProtectedRoute>
  )
}
