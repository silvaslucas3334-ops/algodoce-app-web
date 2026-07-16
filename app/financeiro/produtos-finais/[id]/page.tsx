'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import SelecionarInsumoReceitaModal, { ItemReceitaForm } from '@/components/SelecionarInsumoReceitaModal'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader, Plus, Trash2 } from 'lucide-react'
import { FinanceiroProdutoFinal, FinanceiroMateriaPrima, FinanceiroPrePreparo } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'
import {
  buscarCustosAtuaisMateriasPrimas,
  calcularCustoPrePreparo,
  calcularCustoProdutoFinal,
  salvarItensProdutoFinal,
} from '@/lib/financeiro-cmv'

export default function DetalheProdutoFinalPage() {
  const router = useRouter()
  const params = useParams()
  const produtoFinalId = params.id as string

  const [produtoFinal, setProdutoFinal] = useState<FinanceiroProdutoFinal | null>(null)
  const [materias, setMaterias] = useState<FinanceiroMateriaPrima[]>([])
  const [prePreparosAtivos, setPrePreparosAtivos] = useState<FinanceiroPrePreparo[]>([])
  const [prePreparosCache, setPrePreparosCache] = useState<Map<string, FinanceiroPrePreparo>>(new Map())
  const [itens, setItens] = useState<ItemReceitaForm[]>([])
  const [custosMP, setCustosMP] = useState<Map<string, number>>(new Map())
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
  }, [])

  async function carregar() {
    setLoading(true)
    const { data: pf } = await supabase
      .from('financeiro_produtos_finais')
      .select(
        '*, itens:financeiro_produto_final_itens(*, materia_prima:financeiro_materias_primas(nome, unidade_medida), pre_preparo:financeiro_pre_preparos(nome, unidade_medida, rendimento_quantidade))'
      )
      .eq('id', produtoFinalId)
      .single()
    setProdutoFinal(pf)
    setItens(
      (pf?.itens || []).map((i: any) => ({
        materia_prima_id: i.materia_prima_id,
        pre_preparo_id: i.pre_preparo_id,
        nome: i.materia_prima?.nome || i.pre_preparo?.nome || 'Item',
        unidade_medida: i.materia_prima?.unidade_medida || i.pre_preparo?.unidade_medida || '',
        quantidade: i.quantidade,
      }))
    )

    // Pré-preparos referenciados precisam da própria receita completa
    // pra calcular o custo por unidade deles.
    const idsPrePreparo = Array.from(new Set((pf?.itens || []).map((i: any) => i.pre_preparo_id).filter(Boolean)))
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
      ])
    )
    const mapaCustos = idsMateriaPrima.length > 0 ? await buscarCustosAtuaisMateriasPrimas(idsMateriaPrima) : new Map()
    setCustosMP(mapaCustos)
    setPrePreparosCache(new Map((prePreparosCompletos || []).map((pp: any) => [pp.id, pp])))
    setLoading(false)
  }

  function removerItem(indice: number) {
    setItens((prev) => prev.filter((_, i) => i !== indice))
  }

  function custoDaLinha(item: ItemReceitaForm): number | null {
    if (item.materia_prima_id) {
      const custo = custosMP.get(item.materia_prima_id)
      return custo != null ? item.quantidade * custo : null
    }
    if (item.pre_preparo_id) {
      const pp = prePreparosCache.get(item.pre_preparo_id) || prePreparosAtivos.find((p) => p.id === item.pre_preparo_id)
      if (!pp) return null
      const custoPP = calcularCustoPrePreparo(pp, custosMP)
      return custoPP.custoPorUnidade != null ? item.quantidade * custoPP.custoPorUnidade : null
    }
    return null
  }

  const custoTotalConhecido = itens.reduce((soma, item) => soma + (custoDaLinha(item) ?? 0), 0)
  const itensSemCusto = itens.filter((i) => custoDaLinha(i) == null)
  const custoCompleto = itensSemCusto.length === 0
  const rendimentoPorcoes = produtoFinal?.rendimento_porcoes || 1

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
          updated_at: new Date().toISOString(),
        })
        .eq('id', produtoFinalId)
      if (error) throw error

      await salvarItensProdutoFinal(
        produtoFinalId,
        itens.map((i) => ({ materia_prima_id: i.materia_prima_id, pre_preparo_id: i.pre_preparo_id, quantidade: i.quantidade }))
      )
      await carregar()
    } catch (err: any) {
      console.error('Erro ao salvar produto final:', err)
      const msg = err?.code === '23505' ? 'Nome ou código de PDV já usado em outro produto final.' : 'Erro ao salvar: ' + (err?.message || 'desconhecido')
      setErro(msg)
    } finally {
      setSalvando(false)
    }
  }

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['admin']}>
        <div className="flex items-center justify-center min-h-screen gap-2 text-gray-400">
          <Loader size={20} className="animate-spin" /> Carregando...
        </div>
      </ProtectedRoute>
    )
  }

  if (!produtoFinal) {
    return (
      <ProtectedRoute allowedRoles={['admin']}>
        <div className="flex items-center justify-center min-h-screen text-gray-400">Não encontrado</div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-bold text-gray-800">{produtoFinal.nome}</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

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
                  return (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                      <div>
                        <p className="font-medium text-gray-800">
                          {item.nome}
                          {item.pre_preparo_id && <span className="ml-1.5 text-[10px] font-semibold text-purple-700 bg-purple-100 rounded-full px-2 py-0.5">Pré-preparo</span>}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.quantidade} {item.unidade_medida}
                          {custoLinha != null ? ` · ${formatBRL(custoLinha)}` : ' · custo desconhecido'}
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
                  <span className="font-semibold text-gray-700">Custo total {custoCompleto ? '' : '(conhecido, parcial)'}</span>
                  <span className="font-bold text-gray-900">{formatBRL(custoTotalConhecido)}</span>
                </div>
                {custoCompleto && rendimentoPorcoes > 1 && (
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>Custo por porção ({rendimentoPorcoes})</span>
                    <span>{formatBRL(custoTotalConhecido / rendimentoPorcoes)}</span>
                  </div>
                )}
                {!custoCompleto && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
                    Custo incompleto — sem custo conhecido para: {itensSemCusto.map((i) => i.nome).join(', ')}.
                  </p>
                )}
              </div>
            )}
          </div>

          <button onClick={salvar} disabled={salvando} className="w-full bg-pink-700 text-white rounded-lg py-3 font-medium disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {modalAberto && (
        <SelecionarInsumoReceitaModal
          materias={materias}
          prePreparos={prePreparosAtivos}
          onAdd={(item) => setItens((prev) => [...prev, item])}
          onClose={() => setModalAberto(false)}
        />
      )}
    </ProtectedRoute>
  )
}
