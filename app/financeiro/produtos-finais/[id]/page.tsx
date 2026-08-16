'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import NotFoundState from '@/components/NotFoundState'
import SelecionarInsumoReceitaModal, { ItemReceitaForm } from '@/components/SelecionarInsumoReceitaModal'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Loader, Plus, Trash2, CheckCircle } from 'lucide-react'
import { FinanceiroProdutoFinal, FinanceiroMateriaPrima, FinanceiroPrePreparo, FinanceiroConfigPrecificacao } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'
import { STATUS_FICHA_TECNICA_LABEL, STATUS_FICHA_TECNICA_COLOR } from '@/lib/constants'
import {
  buscarCustosAtuaisMateriasPrimas,
  calcularCustoPrePreparo,
  calcularCustoProdutoFinal,
  salvarItensProdutoFinal,
  CustoAtualMateriaPrima,
} from '@/lib/financeiro-cmv'
import { buscarConfigPrecificacao, calcularIndiceMarkup, calcularPrecoSugerido, calcularMargemContribuicao } from '@/lib/financeiro-precificacao'
import CustoAtualBadges from '@/components/CustoAtualBadge'

export default function DetalheProdutoFinalPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useParams()
  const produtoFinalId = params.id as string

  const [produtoFinal, setProdutoFinal] = useState<FinanceiroProdutoFinal | null>(null)
  const [materias, setMaterias] = useState<FinanceiroMateriaPrima[]>([])
  const [prePreparosAtivos, setPrePreparosAtivos] = useState<FinanceiroPrePreparo[]>([])
  const [prePreparosCache, setPrePreparosCache] = useState<Map<string, FinanceiroPrePreparo>>(new Map())
  // Produtos elegíveis pra virar item de combo (permite_hierarquizacao=true,
  // ativos, e que não são eles mesmos um combo) — pro seletor. O próprio
  // produto sendo editado nunca aparece aqui (não pode se conter).
  const [produtosFinaisElegiveis, setProdutosFinaisElegiveis] = useState<FinanceiroProdutoFinal[]>([])
  // Cache só dos componentes REALMENTE usados neste produto (pode incluir
  // um combo inativo/legado) — espelha prePreparosCache, usado no cálculo
  // de custo, separado da lista de opções do seletor.
  const [produtosFinaisComponentesCache, setProdutosFinaisComponentesCache] = useState<Map<string, FinanceiroProdutoFinal>>(new Map())
  const [itens, setItens] = useState<ItemReceitaForm[]>([])
  const [custosMP, setCustosMP] = useState<Map<string, CustoAtualMateriaPrima>>(new Map())
  const [configPrecificacao, setConfigPrecificacao] = useState<FinanceiroConfigPrecificacao | null>(null)
  const [modalAberto, setModalAberto] = useState(false)

  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    carregar()
  }, [produtoFinalId])

  useEffect(() => {
    supabase
      .from('financeiro_materias_primas')
      .select('*')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setMaterias(data || []))
    supabase
      .from('financeiro_pre_preparos')
      .select('*, itens:financeiro_pre_preparo_itens(*, materia_prima:financeiro_materias_primas(nome))')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setPrePreparosAtivos(data || []))
    supabase
      .from('financeiro_produtos_finais')
      .select('*, itens:financeiro_produto_final_itens!produto_final_id(*, materia_prima:financeiro_materias_primas(nome), pre_preparo:financeiro_pre_preparos(nome))')
      .eq('permite_hierarquizacao', true)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) =>
        setProdutosFinaisElegiveis(
          (data || []).filter((p: any) => p.id !== produtoFinalId && !(p.itens || []).some((i: any) => i.produto_final_componente_id))
        )
      )
  }, [produtoFinalId])

  async function carregar() {
    setLoading(true)
    const { data: pf } = await supabase
      .from('financeiro_produtos_finais')
      .select(
        '*, itens:financeiro_produto_final_itens!produto_final_id(*, materia_prima:financeiro_materias_primas(nome, unidade_medida), pre_preparo:financeiro_pre_preparos(nome, unidade_medida, rendimento_quantidade), produto_final_componente:financeiro_produtos_finais!produto_final_componente_id(nome))'
      )
      .eq('id', produtoFinalId)
      .single()
    setProdutoFinal(pf)
    setItens(
      (pf?.itens || []).map((i: any) => ({
        materia_prima_id: i.materia_prima_id,
        pre_preparo_id: i.pre_preparo_id,
        produto_final_componente_id: i.produto_final_componente_id,
        nome: i.materia_prima?.nome || i.pre_preparo?.nome || i.produto_final_componente?.nome || 'Item',
        unidade_medida: i.materia_prima?.unidade_medida || i.pre_preparo?.unidade_medida || (i.produto_final_componente_id ? 'un' : ''),
        quantidade: i.quantidade,
      }))
    )

    // Componentes de combo referenciados precisam da própria receita
    // completa pra calcular o custo por porção deles (mesma ideia de
    // pré-preparo, um nível abaixo).
    const idsComponentes = Array.from(new Set((pf?.itens || []).map((i: any) => i.produto_final_componente_id).filter(Boolean)))
    const { data: componentesCompletos } = idsComponentes.length
      ? await supabase
          .from('financeiro_produtos_finais')
          .select('*, itens:financeiro_produto_final_itens!produto_final_id(*, materia_prima:financeiro_materias_primas(nome), pre_preparo:financeiro_pre_preparos(nome))')
          .in('id', idsComponentes)
      : { data: [] }
    setProdutosFinaisComponentesCache(new Map((componentesCompletos || []).map((c: any) => [c.id, c])))

    // Pré-preparos referenciados precisam da própria receita completa pra
    // calcular o custo por unidade deles — direto no produto, ou via um
    // componente de combo.
    const idsPrePreparo = Array.from(
      new Set([
        ...(pf?.itens || []).map((i: any) => i.pre_preparo_id).filter(Boolean),
        ...(componentesCompletos || []).flatMap((c: any) => (c.itens || []).map((i: any) => i.pre_preparo_id).filter(Boolean)),
      ])
    )
    const { data: prePreparosCompletos } = idsPrePreparo.length
      ? await supabase
          .from('financeiro_pre_preparos')
          .select('*, itens:financeiro_pre_preparo_itens(*, materia_prima:financeiro_materias_primas(nome))')
          .in('id', idsPrePreparo)
      : { data: [] }

    const idsMateriaPrima = Array.from(
      new Set([
        ...(pf?.itens || []).map((i: any) => i.materia_prima_id).filter(Boolean),
        ...(prePreparosCompletos || []).flatMap((pp: any) => (pp.itens || []).map((i: any) => i.materia_prima_id)),
        ...(componentesCompletos || []).flatMap((c: any) => (c.itens || []).map((i: any) => i.materia_prima_id).filter(Boolean)),
      ])
    )
    const mapaCustos = idsMateriaPrima.length > 0 ? await buscarCustosAtuaisMateriasPrimas(idsMateriaPrima) : new Map()
    setCustosMP(mapaCustos)
    setPrePreparosCache(new Map((prePreparosCompletos || []).map((pp: any) => [pp.id, pp])))

    // Card de Precificação é um extra — se a migration ainda não rodou
    // (tabela não existe), o resto da tela continua funcionando normalmente.
    try {
      setConfigPrecificacao(await buscarConfigPrecificacao())
    } catch (err) {
      console.error('Config de precificação indisponível (migration pendente?):', err)
    }
    setLoading(false)
  }

  function removerItem(indice: number) {
    setItens((prev) => prev.filter((_, i) => i !== indice))
  }

  function custoDaLinha(item: ItemReceitaForm): number | null {
    if (item.materia_prima_id) {
      const entry = custosMP.get(item.materia_prima_id)
      return entry != null ? item.quantidade * entry.custo : null
    }
    if (item.pre_preparo_id) {
      const pp = prePreparosCache.get(item.pre_preparo_id) || prePreparosAtivos.find((p) => p.id === item.pre_preparo_id)
      if (!pp) return null
      const custoPP = calcularCustoPrePreparo(pp, custosMP)
      return custoPP.custoPorUnidade != null ? item.quantidade * custoPP.custoPorUnidade : null
    }
    if (item.produto_final_componente_id) {
      const pfComponente =
        produtosFinaisComponentesCache.get(item.produto_final_componente_id) ||
        produtosFinaisElegiveis.find((p) => p.id === item.produto_final_componente_id)
      if (!pfComponente) return null
      const custosPPDoCombo = new Map(
        (pfComponente.itens || [])
          .filter((i) => i.pre_preparo_id)
          .map((i) => prePreparosCache.get(i.pre_preparo_id!) || prePreparosAtivos.find((p) => p.id === i.pre_preparo_id))
          .filter((pp): pp is FinanceiroPrePreparo => !!pp)
          .map((pp) => [pp.id, calcularCustoPrePreparo(pp, custosMP)] as const)
      )
      const custoPF = calcularCustoProdutoFinal(pfComponente, custosMP, custosPPDoCombo)
      return custoPF.custoPorPorcao != null ? item.quantidade * custoPF.custoPorPorcao : null
    }
    return null
  }

  const custoTotalConhecido = itens.reduce((soma, item) => soma + (custoDaLinha(item) ?? 0), 0)
  const itensSemCusto = itens.filter((i) => custoDaLinha(i) == null)
  const custoCompleto = itensSemCusto.length === 0
  const rendimentoPorcoes = produtoFinal?.rendimento_porcoes || 1
  const podeEditar = usuario?.role === 'admin' || (usuario?.role === 'cozinha' && produtoFinal?.status === 'pendente_revisao')
  // Decisão de preço é diferente de editar receita — sempre admin, mesmo
  // com a ficha técnica já aprovada.
  const podeEditarPreco = usuario?.role === 'admin'

  const custoPorPorcao = custoCompleto && itens.length > 0 ? custoTotalConhecido / rendimentoPorcoes : null
  const dvPct = configPrecificacao
    ? configPrecificacao.taxa_cartao_pct + configPrecificacao.comissao_marketplace_pct + configPrecificacao.imposto_venda_pct
    : null
  const mlPct = produtoFinal?.margem_lucro_desejada_pct ?? configPrecificacao?.margem_lucro_padrao_pct ?? null
  const indiceMarkup =
    configPrecificacao && dvPct != null && mlPct != null ? calcularIndiceMarkup(configPrecificacao.custos_fixos_pct, dvPct, mlPct) : null
  const precoSugerido = indiceMarkup != null && custoPorPorcao != null ? calcularPrecoSugerido(custoPorPorcao, indiceMarkup) : null
  const margemPraticada =
    produtoFinal?.preco_venda != null && custoPorPorcao != null && dvPct != null
      ? calcularMargemContribuicao(produtoFinal.preco_venda, custoPorPorcao, dvPct)
      : null

  async function aprovar() {
    if (!produtoFinal) return
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('financeiro_produtos_finais')
        .update({ status: 'aprovado', updated_at: new Date().toISOString() })
        .eq('id', produtoFinalId)
      if (error) throw error
      await carregar()
    } catch (err: any) {
      setErro('Erro ao aprovar: ' + (err?.message || 'desconhecido'))
    } finally {
      setSalvando(false)
    }
  }

  async function salvar() {
    if (!produtoFinal) return
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('financeiro_produtos_finais')
        .update({
          nome: produtoFinal.nome,
          codigo_pdv_loja1: produtoFinal.codigo_pdv_loja1 || null,
          codigo_pdv_loja2: produtoFinal.codigo_pdv_loja2 || null,
          rendimento_porcoes: produtoFinal.rendimento_porcoes,
          descricao: produtoFinal.descricao || null,
          ativo: produtoFinal.ativo,
          preco_venda: produtoFinal.preco_venda ?? null,
          margem_lucro_desejada_pct: produtoFinal.margem_lucro_desejada_pct ?? null,
          permite_hierarquizacao: produtoFinal.permite_hierarquizacao,
          updated_at: new Date().toISOString(),
        })
        .eq('id', produtoFinalId)
      if (error) throw error
    } catch (err: any) {
      console.error('Erro ao salvar produto final:', err)
      const msg = err?.code === '23505' ? 'Nome ou código de PDV já usado em outro produto final.' : 'Erro ao salvar: ' + (err?.message || 'desconhecido')
      setErro(msg)
      setSalvando(false)
      return
    }
    try {
      await salvarItensProdutoFinal(
        produtoFinalId,
        itens.map((i) => ({
          materia_prima_id: i.materia_prima_id,
          pre_preparo_id: i.pre_preparo_id,
          produto_final_componente_id: i.produto_final_componente_id,
          quantidade: i.quantidade,
        }))
      )
      await carregar()
    } catch (err: any) {
      console.error('Erro ao salvar itens do produto final:', err)
      const msg =
        err?.code === '23505'
          ? 'Algum insumo foi adicionado mais de uma vez nessa receita — remova a duplicata e tente de novo.'
          : 'Erro ao salvar os itens: ' + (err?.message || 'desconhecido')
      setErro(msg)
    } finally {
      setSalvando(false)
    }
  }

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['admin', 'cozinha']}>
        <div className="flex items-center justify-center min-h-screen gap-2 text-gray-400">
          <Loader size={20} className="animate-spin" /> Carregando...
        </div>
      </ProtectedRoute>
    )
  }

  if (!produtoFinal) {
    return (
      <ProtectedRoute allowedRoles={['admin', 'cozinha']}>
        <NotFoundState backHref="/financeiro/produtos-finais" />
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute allowedRoles={['admin', 'cozinha']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader
          title={produtoFinal.nome}
          onBack={() => router.back()}
          actions={
            produtoFinal.status === 'pendente_revisao' ? (
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_FICHA_TECNICA_COLOR.pendente_revisao}`}>
                  {STATUS_FICHA_TECNICA_LABEL.pendente_revisao}
                </span>
                {usuario?.role === 'admin' && (
                  <button
                    onClick={aprovar}
                    disabled={salvando}
                    className="bg-green-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1 hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle size={14} /> Aprovar
                  </button>
                )}
              </div>
            ) : undefined
          }
        />

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}
          {!podeEditar && (
            <div className="bg-gray-100 border border-gray-200 rounded-lg p-3 text-sm text-gray-600">
              Já foi aprovado — só um admin pode editar a partir daqui.
            </div>
          )}

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Cadastro</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nome</label>
              <input
                type="text"
                value={produtoFinal.nome}
                onChange={(e) => setProdutoFinal({ ...produtoFinal, nome: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Rende quantas porções</label>
              <input
                type="number"
                min={1}
                value={produtoFinal.rendimento_porcoes}
                onChange={(e) => setProdutoFinal({ ...produtoFinal, rendimento_porcoes: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Código PDV — Paraisópolis</label>
                <input
                  type="text"
                  value={produtoFinal.codigo_pdv_loja1 || ''}
                  onChange={(e) => setProdutoFinal({ ...produtoFinal, codigo_pdv_loja1: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="Opcional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Código PDV — Itajubá</label>
                <input
                  type="text"
                  value={produtoFinal.codigo_pdv_loja2 || ''}
                  onChange={(e) => setProdutoFinal({ ...produtoFinal, codigo_pdv_loja2: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Descrição</label>
              <textarea
                value={produtoFinal.descricao || ''}
                onChange={(e) => setProdutoFinal({ ...produtoFinal, descricao: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm h-20 resize-none"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={produtoFinal.ativo}
                onChange={(e) => setProdutoFinal({ ...produtoFinal, ativo: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              Ativo
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <input
                type="checkbox"
                checked={produtoFinal.permite_hierarquizacao}
                onChange={(e) => setProdutoFinal({ ...produtoFinal, permite_hierarquizacao: e.target.checked })}
                className="mt-0.5"
              />
              <span className="text-sm text-gray-700">
                Permite Hierarquização
                <span className="block text-xs text-gray-400 mt-0.5">
                  Outros produtos finais poderão usar este aqui como item, tipo um combo (ex: 1x Brownie + 1x Refrigerante).
                  {(itens || []).some((i) => i.produto_final_componente_id) && (
                    <span className="block text-amber-600 mt-0.5">
                      Este produto já é um combo (contém outro produto final) — não pode virar componente de outro combo.
                    </span>
                  )}
                </span>
              </span>
            </label>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Itens da receita</h2>
              <button
                onClick={() => setModalAberto(true)}
                className="bg-pink-700 text-white rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-pink-800"
              >
                <Plus size={16} /> Adicionar item
              </button>
            </div>

            {itens.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center text-sm text-gray-400">
                Nenhum item ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {itens.map((item, i) => {
                  const custoLinha = custoDaLinha(item)
                  const entry = item.materia_prima_id ? custosMP.get(item.materia_prima_id) : undefined
                  return (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                      <div>
                        <p className="font-medium text-gray-800">
                          {item.nome}
                          {item.pre_preparo_id && <span className="ml-1.5 text-[10px] font-semibold text-purple-700 bg-purple-100 rounded-full px-2 py-0.5">Pré-preparo</span>}
                          {item.produto_final_componente_id && <span className="ml-1.5 text-[10px] font-semibold text-pink-700 bg-pink-100 rounded-full px-2 py-0.5">Combo</span>}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          {item.quantidade} {item.unidade_medida}
                          {custoLinha != null ? ` · ${formatBRL(custoLinha)}` : ' · custo desconhecido'}
                          {entry && <CustoAtualBadges custo={entry} />}
                        </p>
                      </div>
                      <button onClick={() => removerItem(i)} className="text-red-600 hover:text-red-700">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {itens.length > 0 && (
              <div className="pt-2 border-t border-gray-200 space-y-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-gray-700">
                    Custo por porção ({rendimentoPorcoes}){custoCompleto ? '' : ' (parcial)'}
                  </span>
                  <span className="font-bold text-gray-900">{formatBRL(custoTotalConhecido / rendimentoPorcoes)}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span>Custo total {custoCompleto ? '' : '(conhecido, parcial)'}</span>
                  <span>{formatBRL(custoTotalConhecido)}</span>
                </div>
                {!custoCompleto && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
                    Custo incompleto — sem custo conhecido para: {itensSemCusto.map((i) => i.nome).join(', ')}.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Precificação</h2>

            {!configPrecificacao ? (
              <p className="text-xs text-gray-400">
                Configuração de precificação ainda não disponível.{' '}
                {usuario?.role === 'admin' && (
                  <button onClick={() => router.push('/financeiro/produtos-finais/configuracao-precificacao')} className="text-pink-700 underline">
                    Configurar
                  </button>
                )}
              </p>
            ) : custoPorPorcao == null ? (
              <p className="text-xs text-gray-400">Precisa de custo completo (todos os itens) pra calcular preço e margem.</p>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Margem de lucro desejada (%) <span className="text-gray-400 font-normal">— opcional</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    max={100}
                    disabled={!podeEditarPreco}
                    value={produtoFinal.margem_lucro_desejada_pct ?? ''}
                    onChange={(e) =>
                      setProdutoFinal({
                        ...produtoFinal,
                        margem_lucro_desejada_pct: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    placeholder={`Padrão: ${configPrecificacao.margem_lucro_padrao_pct}%`}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>

                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                  {indiceMarkup == null ? (
                    <p className="text-xs text-red-600">
                      As % configuradas (custos fixos + despesas variáveis + margem) somam 100% ou mais — nenhum preço é
                      possível assim. Ajuste a margem ou a configuração global.
                    </p>
                  ) : (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Índice de markup</span>
                        <span className="font-medium text-gray-800">{indiceMarkup.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-700">Preço sugerido</span>
                        <span className="font-bold text-gray-900">{formatBRL(precoSugerido!)}</span>
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preço de venda praticado (R$) <span className="text-gray-400 font-normal">— opcional</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    disabled={!podeEditarPreco}
                    value={produtoFinal.preco_venda ?? ''}
                    onChange={(e) =>
                      setProdutoFinal({ ...produtoFinal, preco_venda: e.target.value === '' ? null : Number(e.target.value) })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>

                {margemPraticada && (
                  <div
                    className={`rounded-lg p-3 border ${
                      margemPraticada.percentual >= 30
                        ? 'bg-green-50 border-green-200'
                        : margemPraticada.percentual >= 15
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-semibold text-gray-700">Margem de contribuição</span>
                      <span className="font-bold text-gray-900">
                        {formatBRL(margemPraticada.valorRS)} ({margemPraticada.percentual.toFixed(1)}%)
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      O que sobra do preço praticado depois do custo e das despesas variáveis — antes de cobrir custos fixos e
                      gerar lucro.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {podeEditar && (
            <button onClick={salvar} disabled={salvando} className="w-full bg-pink-700 text-white rounded-lg py-3 font-medium disabled:opacity-50">
              {salvando ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          )}
        </div>
      </div>

      {modalAberto && (
        <SelecionarInsumoReceitaModal
          materias={materias}
          prePreparos={prePreparosAtivos}
          produtosFinaisElegiveis={produtosFinaisElegiveis}
          idsJaAdicionados={itens.map((i) => i.materia_prima_id || i.pre_preparo_id || i.produto_final_componente_id).filter((id): id is string => !!id)}
          onAdd={(item) => setItens((prev) => [...prev, item])}
          onClose={() => setModalAberto(false)}
        />
      )}
    </ProtectedRoute>
  )
}
