'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import SelecionarInsumoReceitaModal, { ItemReceitaForm } from '@/components/SelecionarInsumoReceitaModal'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader, Plus, Trash2 } from 'lucide-react'
import { FinanceiroPrePreparo, FinanceiroMateriaPrima } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'
import { buscarCustosAtuaisMateriasPrimas, calcularCustoPrePreparo, salvarItensPrePreparo } from '@/lib/financeiro-cmv'

export default function DetalhePrePreparoPage() {
  const router = useRouter()
  const params = useParams()
  const prePreparoId = params.id as string

  const [prePreparo, setPrePreparo] = useState<FinanceiroPrePreparo | null>(null)
  const [materias, setMaterias] = useState<FinanceiroMateriaPrima[]>([])
  const [itens, setItens] = useState<ItemReceitaForm[]>([])
  const [custosMP, setCustosMP] = useState<Map<string, number>>(new Map())
  const [unidadeTravada, setUnidadeTravada] = useState(false)
  const [modalAberto, setModalAberto] = useState(false)

  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    carregar()
  }, [prePreparoId])

  useEffect(() => {
    supabase
      .from('financeiro_materias_primas')
      .select('*')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setMaterias(data || []))
  }, [])

  async function carregar() {
    setLoading(true)
    const [{ data: pp }, { count: usoEmProdutoFinal }] = await Promise.all([
      supabase
        .from('financeiro_pre_preparos')
        .select('*, itens:financeiro_pre_preparo_itens(*, materia_prima:financeiro_materias_primas(nome, unidade_medida))')
        .eq('id', prePreparoId)
        .single(),
      supabase
        .from('financeiro_produto_final_itens')
        .select('id', { count: 'exact', head: true })
        .eq('pre_preparo_id', prePreparoId),
    ])
    setPrePreparo(pp)
    setUnidadeTravada((usoEmProdutoFinal || 0) > 0)
    setItens(
      (pp?.itens || []).map((i: any) => ({
        materia_prima_id: i.materia_prima_id,
        pre_preparo_id: null,
        nome: i.materia_prima?.nome || 'Matéria-prima',
        unidade_medida: i.materia_prima?.unidade_medida || '',
        quantidade: i.quantidade,
      }))
    )
    const ids = (pp?.itens || []).map((i: any) => i.materia_prima_id)
    if (ids.length > 0) setCustosMP(await buscarCustosAtuaisMateriasPrimas(ids))
    setLoading(false)
  }

  function removerItem(indice: number) {
    setItens((prev) => prev.filter((_, i) => i !== indice))
  }

  const rendimentoNum = prePreparo?.rendimento_quantidade || 0
  const custoCalculado = prePreparo ? calcularCustoPrePreparo({ ...prePreparo, itens: itens.map((i) => ({ id: '', pre_preparo_id: prePreparoId, materia_prima_id: i.materia_prima_id!, quantidade: i.quantidade, created_at: '' })) }, custosMP) : null

  async function salvar() {
    if (!prePreparo) return
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('financeiro_pre_preparos')
        .update({
          nome: prePreparo.nome,
          unidade_medida: prePreparo.unidade_medida,
          rendimento_quantidade: prePreparo.rendimento_quantidade,
          descricao: prePreparo.descricao || null,
          ativo: prePreparo.ativo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', prePreparoId)
      if (error) throw error

      await salvarItensPrePreparo(
        prePreparoId,
        itens.map((i) => ({ materia_prima_id: i.materia_prima_id!, quantidade: i.quantidade }))
      )
      await carregar()
    } catch (err: any) {
      console.error('Erro ao salvar pré-preparo:', err)
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
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

  if (!prePreparo) {
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
            <h1 className="text-xl font-bold text-gray-800">{prePreparo.codigo} · {prePreparo.nome}</h1>
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
                value={prePreparo.nome}
                onChange={(e) => setPrePreparo({ ...prePreparo, nome: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Unidade</label>
                {unidadeTravada ? (
                  <div className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-500">
                    {prePreparo.unidade_medida}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={prePreparo.unidade_medida}
                    onChange={(e) => setPrePreparo({ ...prePreparo, unidade_medida: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                  />
                )}
                {unidadeTravada && (
                  <p className="text-xs text-amber-600 mt-1">Trocar agora reinterpretaria as quantidades já usadas em produtos finais — bloqueado.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rende quanto</label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={prePreparo.rendimento_quantidade}
                  onChange={(e) => setPrePreparo({ ...prePreparo, rendimento_quantidade: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Descrição</label>
              <textarea
                value={prePreparo.descricao || ''}
                onChange={(e) => setPrePreparo({ ...prePreparo, descricao: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm h-20 resize-none"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={prePreparo.ativo}
                onChange={(e) => setPrePreparo({ ...prePreparo, ativo: e.target.checked })}
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
                  const custo = item.materia_prima_id ? custosMP.get(item.materia_prima_id) : undefined
                  return (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                      <div>
                        <p className="font-medium text-gray-800">{item.nome}</p>
                        <p className="text-xs text-gray-500">
                          {item.quantidade} {item.unidade_medida}
                          {custo != null ? ` · ${formatBRL(item.quantidade * custo)}` : ' · custo desconhecido'}
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

            {custoCalculado && (
              <div className="pt-2 border-t border-gray-200 space-y-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-gray-700">Custo total {custoCalculado.completo ? '' : '(conhecido, parcial)'}</span>
                  <span className="font-bold text-gray-900">{formatBRL(custoCalculado.custoConhecidoParcial)}</span>
                </div>
                {custoCalculado.completo && rendimentoNum > 0 && (
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>Custo por {prePreparo.unidade_medida}</span>
                    <span>{formatBRL(custoCalculado.custoConhecidoParcial / rendimentoNum)}</span>
                  </div>
                )}
                {!custoCalculado.completo && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
                    Custo incompleto — sem compra registrada ainda para: {custoCalculado.itensSemCusto.map((i) => i.nome).join(', ')}.
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
          onAdd={(item) => setItens((prev) => [...prev, item])}
          onClose={() => setModalAberto(false)}
        />
      )}
    </ProtectedRoute>
  )
}
