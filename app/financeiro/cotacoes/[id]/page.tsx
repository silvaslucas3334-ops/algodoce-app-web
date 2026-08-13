'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import NotFoundState from '@/components/NotFoundState'
import ResponderCotacaoModal from '@/components/ResponderCotacaoModal'
import SelecionarItemCotacaoModal, { ItemCotacaoForm } from '@/components/SelecionarItemCotacaoModal'
import {
  fecharCotacao,
  adicionarItemCotacao,
  atualizarQuantidadeItemCotacao,
  removerItemCotacao,
  marcarItemComprado,
  estimarPrecosCotacao,
  responderCotacaoFornecedor,
  ItemParaEstimar,
} from '@/lib/financeiro-cotacoes'
import { useRouter, useParams } from 'next/navigation'
import { Loader, FileText, CheckCircle, AlertCircle, Plus, Trash2 } from 'lucide-react'
import { FinanceiroCotacao, FinanceiroCotacaoItem, FinanceiroCotacaoFornecedor, FinanceiroCotacaoPreco, FinanceiroMateriaPrima } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'
import { UNIDADE_LABEL } from '@/lib/constants'

type FornecedorComPrecos = FinanceiroCotacaoFornecedor & { precos: FinanceiroCotacaoPreco[] }

export default function DetalheCotacaoPage() {
  const router = useRouter()
  const params = useParams()
  const cotacaoId = params.id as string

  const [cotacao, setCotacao] = useState<FinanceiroCotacao | null>(null)
  const [itens, setItens] = useState<FinanceiroCotacaoItem[]>([])
  const [fornecedores, setFornecedores] = useState<FornecedorComPrecos[]>([])
  const [loading, setLoading] = useState(true)
  const [modalResponder, setModalResponder] = useState<FornecedorComPrecos | null>(null)
  const [fechando, setFechando] = useState(false)
  const [fornecedorEscolhido, setFornecedorEscolhido] = useState('')
  const [erro, setErro] = useState('')
  const [materias, setMaterias] = useState<FinanceiroMateriaPrima[]>([])
  const [modalAdicionarItem, setModalAdicionarItem] = useState(false)

  useEffect(() => {
    carregar()
  }, [cotacaoId])

  useEffect(() => {
    supabase
      .from('financeiro_materias_primas')
      .select('*, conta:financeiro_contas(codigo, nome)')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setMaterias(data || []))
  }, [])

  async function carregar() {
    setLoading(true)
    const [{ data: cot }, { data: itensData }, { data: fornecedoresData }] = await Promise.all([
      supabase
        .from('financeiro_cotacoes')
        .select('*, fornecedor_vencedor:financeiro_partes!fornecedor_vencedor_id(nome)')
        .eq('id', cotacaoId)
        .single(),
      supabase
        .from('financeiro_cotacao_itens')
        .select('*, materia_prima:financeiro_materias_primas(nome, unidade_medida, fator_conversao, unidade_fornecedor, fator_unidade_fornecedor)')
        .eq('cotacao_id', cotacaoId),
      supabase
        .from('financeiro_cotacao_fornecedores')
        .select('*, parte:financeiro_partes!parte_id(nome), precos:financeiro_cotacao_precos(*)')
        .eq('cotacao_id', cotacaoId),
    ])
    setCotacao(cot)
    setItens(itensData || [])
    setFornecedores(fornecedoresData || [])
    setLoading(false)
  }

  const respondidos = fornecedores.filter((f) => f.status === 'respondido')

  // "cx" de um fornecedor pode ter uma quantidade bem diferente de "cx" de
  // outro (ex: caixa de 300 un x caixa de 100 un) — comparar valor_unitario
  // bruto entre eles seria comparar coisas diferentes. Normaliza pelo fator
  // de conversão dessa resposta (se o fornecedor informou um diferente do
  // cadastro) ou pelo padrão da matéria-prima, caindo pro valor bruto só
  // quando não há nenhum fator disponível (comportamento de sempre).
  function fatorEfetivo(item: FinanceiroCotacaoItem, preco: FinanceiroCotacaoPreco): number | null {
    return preco.fator_conversao_fornecedor ?? item.materia_prima?.fator_conversao ?? null
  }

  function precoNormalizado(item: FinanceiroCotacaoItem, preco: FinanceiroCotacaoPreco): number | null {
    if (preco.valor_unitario == null) return null
    const fator = fatorEfetivo(item, preco)
    return fator ? preco.valor_unitario / fator : preco.valor_unitario
  }

  // Menor preço normalizado por item, entre os fornecedores que cotaram (disponivel=true).
  function menorUnitarioDoItem(item: FinanceiroCotacaoItem): number | null {
    const valores = respondidos
      .map((f) => f.precos.find((p) => p.cotacao_item_id === item.id))
      .filter((p): p is FinanceiroCotacaoPreco => !!p && p.disponivel)
      .map((p) => precoNormalizado(item, p))
      .filter((v): v is number => v != null)
    return valores.length > 0 ? Math.min(...valores) : null
  }

  function totalDoFornecedor(f: FornecedorComPrecos) {
    const itensCotados = f.precos.filter((p) => p.disponivel && p.valor_total != null)
    const total = itensCotados.reduce((acc, p) => acc + (p.valor_total || 0), 0)
    return { total, itensCotados: itensCotados.length, totalItens: itens.length }
  }

  const menorTotal =
    respondidos.length > 0
      ? Math.min(
          ...respondidos
            .filter((f) => totalDoFornecedor(f).itensCotados === itens.length)
            .map((f) => totalDoFornecedor(f).total)
        )
      : null

  async function confirmarFechamento() {
    if (!fornecedorEscolhido) return
    setFechando(true)
    setErro('')
    try {
      await fecharCotacao(cotacaoId, fornecedorEscolhido)
      router.push(`/financeiro/compras/nova?cotacaoId=${cotacaoId}`)
    } catch (err: any) {
      setErro('Erro ao fechar cotação: ' + (err?.message || 'desconhecido'))
      setFechando(false)
    }
  }

  async function confirmarFechamentoEstimativa(fornecedorParteId: string) {
    setFechando(true)
    setErro('')
    try {
      await fecharCotacao(cotacaoId, fornecedorParteId)
      router.push(`/financeiro/compras/nova?cotacaoId=${cotacaoId}`)
    } catch (err: any) {
      setErro('Erro ao fechar cotação: ' + (err?.message || 'desconhecido'))
      setFechando(false)
    }
  }

  async function adicionarItem(item: ItemCotacaoForm) {
    setErro('')
    try {
      const novoItem = await adicionarItemCotacao(cotacaoId, {
        materia_prima_id: item.materia_prima_id,
        quantidade: item.quantidade,
        unidade_cotacao: item.unidade_cotacao,
        observacao: item.observacao,
      })
      setItens((prev) => [...prev, novoItem])
      if (cotacao?.tipo === 'estimativa' && fornecedores[0]) {
        const estimativas = await estimarPrecosCotacao(
          [{ materia_prima_id: item.materia_prima_id, quantidade: item.quantidade, fator_conversao: novoItem.materia_prima?.fator_conversao ?? 1 }],
          fornecedores[0].parte_id
        )
        const est = estimativas.get(item.materia_prima_id) ?? { valor_unitario: null, valor_total: null }
        await responderCotacaoFornecedor(fornecedores[0].id, [
          {
            cotacao_item_id: novoItem.id,
            valor_unitario: est.valor_unitario,
            valor_total: est.valor_total,
            disponivel: est.valor_unitario != null,
            fator_conversao_fornecedor: null,
          },
        ])
        await carregar()
      }
    } catch (err: any) {
      setErro('Erro ao adicionar item: ' + (err?.message || 'desconhecido'))
    }
  }

  async function alterarQuantidade(item: FinanceiroCotacaoItem, novaQuantidade: number) {
    if (!novaQuantidade || novaQuantidade <= 0 || novaQuantidade === item.quantidade) return
    const anterior = item.quantidade
    setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantidade: novaQuantidade } : i)))
    try {
      await atualizarQuantidadeItemCotacao(item.id, novaQuantidade)
    } catch (err: any) {
      setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantidade: anterior } : i)))
      setErro('Erro ao atualizar quantidade: ' + (err?.message || 'desconhecido'))
    }
  }

  async function excluirItem(itemId: string) {
    if (!window.confirm('Remover este item da cotação?')) return
    setErro('')
    try {
      await removerItemCotacao(itemId)
      setItens((prev) => prev.filter((i) => i.id !== itemId))
    } catch (err: any) {
      setErro('Erro ao remover item: ' + (err?.message || 'desconhecido'))
    }
  }

  async function alternarComprado(item: FinanceiroCotacaoItem) {
    setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, comprado: !i.comprado } : i)))
    try {
      await marcarItemComprado(item.id, !item.comprado)
    } catch (err: any) {
      setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, comprado: item.comprado } : i)))
      setErro('Erro ao marcar item: ' + (err?.message || 'desconhecido'))
    }
  }

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
        <div className="flex items-center justify-center min-h-screen gap-2 text-gray-400">
          <Loader size={20} className="animate-spin" /> Carregando...
        </div>
      </ProtectedRoute>
    )
  }

  if (!cotacao) {
    return (
      <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
        <NotFoundState title="Cotação não encontrada" backHref="/financeiro/cotacoes" />
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader
          title={cotacao.titulo}
          subtitle={
            <>
              {UNIDADE_LABEL[cotacao.unidade]}
              {cotacao.data_entrega_planejada &&
                ` · Entrega planejada: ${new Date(cotacao.data_entrega_planejada + 'T00:00:00').toLocaleDateString('pt-BR')}`}
              {cotacao.status === 'fechada' && cotacao.fornecedor_vencedor?.nome && ` · Fechada com ${cotacao.fornecedor_vencedor.nome}`}
            </>
          }
          backHref="/financeiro/cotacoes"
          maxWidth="max-w-4xl"
        />

        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          {cotacao.tipo === 'fornecedores' && (
          <>
          {/* Itens */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800">Itens ({itens.length})</h2>
              {cotacao.status === 'aberta' && (
                <button
                  onClick={() => setModalAdicionarItem(true)}
                  className="bg-pink-700 text-white rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-pink-800"
                >
                  <Plus size={16} /> Adicionar item
                </button>
              )}
            </div>
            <div className="space-y-1">
              {itens.map((item) => (
                <div key={item.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0 text-sm text-gray-700">
                    {item.materia_prima?.nome}
                    {item.observacao && <span className="text-gray-400"> · {item.observacao}</span>}
                  </div>
                  {cotacao.status === 'aberta' ? (
                    <input
                      key={`${item.id}-${item.quantidade}`}
                      type="number"
                      step="any"
                      min={0}
                      defaultValue={item.quantidade}
                      onBlur={(e) => alterarQuantidade(item, Number(e.target.value))}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right"
                    />
                  ) : (
                    <span className="text-sm text-gray-600">{item.quantidade}</span>
                  )}
                  <span className="text-xs text-gray-500 w-10">{item.unidade_cotacao}</span>
                  {cotacao.status === 'aberta' && (
                    <button onClick={() => excluirItem(item.id)} className="text-red-600 hover:text-red-700 flex-shrink-0">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Fornecedores convidados */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-800 mb-3">Fornecedores convidados</h2>
            <div className="space-y-2">
              {fornecedores.map((f) => (
                <div key={f.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{f.parte?.nome}</p>
                    <p className="text-xs text-gray-500">
                      {f.status === 'respondido' ? `Respondeu · ${totalDoFornecedor(f).itensCotados}/${itens.length} itens cotados` : 'Aguardando resposta'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.push(`/financeiro/cotacoes/${cotacaoId}/pdf/${f.id}`)}
                      className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-100 flex items-center gap-1"
                    >
                      <FileText size={14} /> PDF
                    </button>
                    <button
                      onClick={() => setModalResponder(f)}
                      className="px-3 py-1.5 bg-pink-700 text-white rounded-lg text-xs font-semibold hover:bg-pink-800"
                    >
                      {f.status === 'respondido' ? 'Editar preços' : 'Responder'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Comparação */}
          {respondidos.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="font-semibold text-gray-800 mb-3">Comparação</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-2 pr-3">Item</th>
                      {respondidos.map((f) => (
                        <th key={f.id} className="py-2 pr-3 whitespace-nowrap">{f.parte?.nome}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => {
                      const menor = menorUnitarioDoItem(item)
                      const unidadeMedida = item.materia_prima?.unidade_medida
                      return (
                        <tr key={item.id} className="border-b border-gray-100">
                          <td className="py-2 pr-3 text-gray-700">
                            {item.materia_prima?.nome}
                            <span className="block text-[10px] text-gray-400">{item.quantidade} {item.unidade_cotacao}</span>
                          </td>
                          {respondidos.map((f) => {
                            const p = f.precos.find((x) => x.cotacao_item_id === item.id)
                            if (!p) return <td key={f.id} className="py-2 pr-3 text-gray-300">—</td>
                            if (!p.disponivel) return <td key={f.id} className="py-2 pr-3 text-gray-400 text-xs">Sem item</td>
                            const normalizado = precoNormalizado(item, p)
                            const menorAqui = menor != null && normalizado === menor
                            // Só vale a pena mostrar normalizado quando difere de verdade
                            // do bruto (há um fator de conversão de fato aplicado) — senão
                            // é o mesmo número duas vezes, sem valor pra comparação.
                            const temNormalizacao = normalizado != null && unidadeMedida && normalizado !== p.valor_unitario
                            return (
                              <td key={f.id} className={`py-2 pr-3 ${menorAqui ? 'text-green-700 font-semibold' : 'text-gray-600'}`}>
                                {temNormalizacao ? (
                                  <>
                                    {formatBRL(normalizado!)}/{unidadeMedida}
                                    <span className="block text-[10px] font-normal text-gray-400">
                                      {formatBRL(p.valor_unitario || 0)}/{item.unidade_cotacao}
                                    </span>
                                  </>
                                ) : (
                                  formatBRL(p.valor_unitario || 0)
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-gray-300">
                      <td className="py-2 pr-3 font-semibold text-gray-800">Total</td>
                      {respondidos.map((f) => {
                        const { total, itensCotados, totalItens } = totalDoFornecedor(f)
                        const completo = itensCotados === totalItens
                        const menorAqui = completo && menorTotal != null && total === menorTotal
                        return (
                          <td key={f.id} className={`py-2 pr-3 ${menorAqui ? 'text-green-700 font-bold' : 'text-gray-800 font-semibold'}`}>
                            {formatBRL(total)}
                            {!completo && (
                              <span className="block text-[10px] font-normal text-amber-600 flex items-center gap-1">
                                <AlertCircle size={10} /> {itensCotados}/{totalItens} itens
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Fechar cotação */}
          {cotacao.status === 'aberta' && respondidos.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-3">
              <h2 className="font-semibold text-gray-800">Fechar cotação</h2>
              <p className="text-xs text-gray-500">Escolha o fornecedor vencedor entre os que responderam.</p>
              <div className="grid grid-cols-2 gap-2">
                {respondidos.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFornecedorEscolhido(f.parte_id)}
                    className={`px-3 py-2 rounded-lg border-2 text-sm text-left ${
                      fornecedorEscolhido === f.parte_id ? 'border-pink-600 bg-pink-50 text-pink-800 font-semibold' : 'border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    {f.parte?.nome} — {formatBRL(totalDoFornecedor(f).total)}
                  </button>
                ))}
              </div>
              <button
                onClick={confirmarFechamento}
                disabled={!fornecedorEscolhido || fechando}
                className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle size={16} /> {fechando ? 'Fechando...' : 'Fechar cotação e lançar nota'}
              </button>
            </div>
          )}
          </>
          )}

          {cotacao.tipo === 'estimativa' && (() => {
            const fornecedor = fornecedores[0]
            const precoPorItem = (item: FinanceiroCotacaoItem) => {
              const p = fornecedor?.precos.find((x) => x.cotacao_item_id === item.id)
              return p?.valor_unitario != null ? p.valor_unitario * item.quantidade : null
            }
            const totalEstimado = itens.reduce((acc, i) => acc + (precoPorItem(i) ?? 0), 0)
            const comprados = itens.filter((i) => i.comprado).length
            return (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-800">Lista de compras ({itens.length})</h2>
                  {cotacao.status === 'aberta' && (
                    <button
                      onClick={() => setModalAdicionarItem(true)}
                      className="bg-pink-700 text-white rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-pink-800"
                    >
                      <Plus size={16} /> Adicionar item
                    </button>
                  )}
                </div>
                {fornecedor && <p className="text-xs text-gray-500 mb-3">Fornecedor: {fornecedor.parte?.nome}</p>}
                <div className="space-y-1">
                  {itens.map((item) => {
                    const preco = precoPorItem(item)
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 ${item.comprado ? 'opacity-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={item.comprado}
                          onChange={() => alternarComprado(item)}
                          className="w-4 h-4 rounded flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm text-gray-700 truncate ${item.comprado ? 'line-through' : ''}`}>{item.materia_prima?.nome}</p>
                          {item.observacao && <p className="text-xs text-gray-400 truncate">{item.observacao}</p>}
                        </div>
                        {cotacao.status === 'aberta' ? (
                          <input
                            key={`${item.id}-${item.quantidade}`}
                            type="number"
                            step="any"
                            min={0}
                            defaultValue={item.quantidade}
                            onBlur={(e) => alterarQuantidade(item, Number(e.target.value))}
                            className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right"
                          />
                        ) : (
                          <span className="text-sm text-gray-600">{item.quantidade}</span>
                        )}
                        <span className="text-xs text-gray-500 w-8">{item.unidade_cotacao}</span>
                        <span className="text-sm font-medium text-gray-800 w-24 text-right">
                          {preco != null ? formatBRL(preco) : <span className="text-xs text-gray-300">sem estimativa</span>}
                        </span>
                        {cotacao.status === 'aberta' && (
                          <button onClick={() => excluirItem(item.id)} className="text-red-600 hover:text-red-700 flex-shrink-0">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t-2 border-gray-200">
                  <p className="text-sm text-gray-600">{comprados} de {itens.length} comprados</p>
                  <p className="text-lg font-bold text-gray-800">{formatBRL(totalEstimado)}</p>
                </div>
                {cotacao.status === 'aberta' && fornecedor && (
                  <button
                    onClick={() => confirmarFechamentoEstimativa(fornecedor.parte_id)}
                    disabled={fechando}
                    className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
                  >
                    <CheckCircle size={16} /> {fechando ? 'Fechando...' : 'Fechar e lançar nota'}
                  </button>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {modalResponder && (
        <ResponderCotacaoModal
          cotacaoFornecedor={modalResponder}
          itens={itens}
          precosExistentes={modalResponder.precos}
          onClose={() => setModalResponder(null)}
          onResolvido={carregar}
        />
      )}

      {modalAdicionarItem && (
        <SelecionarItemCotacaoModal
          materias={materias}
          onAdd={(item) => {
            adicionarItem(item)
            setModalAdicionarItem(false)
          }}
          onClose={() => setModalAdicionarItem(false)}
          onMateriaPrimaCriada={(nova) => setMaterias((prev) => [...prev, nova].sort((a, b) => a.nome.localeCompare(b.nome)))}
        />
      )}
    </ProtectedRoute>
  )
}
