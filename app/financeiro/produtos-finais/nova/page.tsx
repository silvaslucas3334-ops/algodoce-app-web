'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import SelecionarInsumoReceitaModal, { ItemReceitaForm } from '@/components/SelecionarInsumoReceitaModal'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { FinanceiroMateriaPrima, FinanceiroPrePreparo } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'
import {
  criarProdutoFinal,
  salvarItensProdutoFinal,
  buscarCustosAtuaisMateriasPrimas,
  calcularCustoPrePreparo,
} from '@/lib/financeiro-cmv'

export default function NovoProdutoFinalPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const [materias, setMaterias] = useState<FinanceiroMateriaPrima[]>([])
  const [prePreparos, setPrePreparos] = useState<FinanceiroPrePreparo[]>([])

  const [nome, setNome] = useState('')
  const [codigoPdvLoja1, setCodigoPdvLoja1] = useState('')
  const [codigoPdvLoja2, setCodigoPdvLoja2] = useState('')
  const [rendimentoPorcoes, setRendimentoPorcoes] = useState('1')
  const [descricao, setDescricao] = useState('')

  const [itens, setItens] = useState<ItemReceitaForm[]>([])
  const [modalAberto, setModalAberto] = useState(false)
  const [custosMP, setCustosMP] = useState<Map<string, number>>(new Map())

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

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
      .then(({ data }) => setPrePreparos(data || []))
  }, [])

  useEffect(() => {
    const idsDireto = itens.map((i) => i.materia_prima_id).filter((id): id is string => !!id)
    const idsViaPrePreparo = itens
      .filter((i) => i.pre_preparo_id)
      .flatMap((i) => prePreparos.find((p) => p.id === i.pre_preparo_id)?.itens?.map((ii) => ii.materia_prima_id) || [])
    const ids = Array.from(new Set([...idsDireto, ...idsViaPrePreparo]))
    if (ids.length === 0) {
      setCustosMP(new Map())
      return
    }
    buscarCustosAtuaisMateriasPrimas(ids).then(setCustosMP)
  }, [itens, prePreparos])

  function removerItem(indice: number) {
    setItens((prev) => prev.filter((_, i) => i !== indice))
  }

  const rendimentoNum = Number(rendimentoPorcoes)
  const podeSalvar = nome.trim() && rendimentoNum > 0 && itens.length > 0

  function custoDaLinha(item: ItemReceitaForm): number | null {
    if (item.materia_prima_id) {
      const custo = custosMP.get(item.materia_prima_id)
      return custo != null ? item.quantidade * custo : null
    }
    if (item.pre_preparo_id) {
      const pp = prePreparos.find((p) => p.id === item.pre_preparo_id)
      if (!pp) return null
      const custoPP = calcularCustoPrePreparo(pp, custosMP)
      return custoPP.custoPorUnidade != null ? item.quantidade * custoPP.custoPorUnidade : null
    }
    return null
  }

  const custoTotalConhecido = itens.reduce((soma, item) => soma + (custoDaLinha(item) ?? 0), 0)
  const itensSemCusto = itens.filter((i) => custoDaLinha(i) == null)

  async function salvar() {
    if (!podeSalvar || !usuario) {
      setErro('Preencha nome, rendimento em porções e adicione pelo menos um item.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const id = await criarProdutoFinal(
        {
          nome: nome.trim(),
          codigo_pdv_loja1: codigoPdvLoja1.trim() || null,
          codigo_pdv_loja2: codigoPdvLoja2.trim() || null,
          rendimento_porcoes: rendimentoNum,
          descricao: descricao.trim() || null,
        },
        usuario.id
      )
      await salvarItensProdutoFinal(
        id,
        itens.map((i) => ({ materia_prima_id: i.materia_prima_id, pre_preparo_id: i.pre_preparo_id, quantidade: i.quantidade }))
      )
      router.push('/financeiro/produtos-finais')
    } catch (err: any) {
      console.error('Erro ao salvar produto final:', err)
      const msg = err?.code === '23505' ? 'Já existe um produto final com esse nome (ou código de PDV já usado).' : 'Erro ao salvar: ' + (err?.message || 'desconhecido')
      setErro(msg)
      setSalvando(false)
    }
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-bold text-gray-800">Novo Produto Final</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Dados do produto</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nome</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                placeholder="Ex: Bolo de Cenoura Grande"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Rende quantas porções</label>
              <input
                type="number"
                min={1}
                value={rendimentoPorcoes}
                onChange={(e) => setRendimentoPorcoes(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">1 = vendido inteiro. Ex: bolo fatiado em 12 pedaços → 12 (o custo total é dividido automaticamente).</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Código PDV — Paraisópolis</label>
                <input
                  type="text"
                  value={codigoPdvLoja1}
                  onChange={(e) => setCodigoPdvLoja1(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="Opcional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Código PDV — Itajubá</label>
                <input
                  type="text"
                  value={codigoPdvLoja2}
                  onChange={(e) => setCodigoPdvLoja2(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="Opcional"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 -mt-2">
              Código do cadastro de produtos do PDV de cada loja — cada uma numera o próprio catálogo de forma independente.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Descrição (opcional)</label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm h-20 resize-none"
              />
            </div>
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
                Nenhum item ainda — combine pré-preparados e/ou matérias-primas.
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
                <div className="flex justify-between items-center px-3 pt-2 border-t border-gray-200 text-sm">
                  <span className="font-semibold text-gray-700">Custo total conhecido</span>
                  <span className="font-bold text-gray-900">{formatBRL(custoTotalConhecido)}</span>
                </div>
                {rendimentoNum > 1 && itensSemCusto.length === 0 && (
                  <div className="flex justify-between items-center px-3 text-sm text-gray-600">
                    <span>Custo por porção ({rendimentoNum})</span>
                    <span>{formatBRL(custoTotalConhecido / rendimentoNum)}</span>
                  </div>
                )}
                {itensSemCusto.length > 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    {itensSemCusto.length === 1 ? 'Este item' : `Estes ${itensSemCusto.length} itens`} ainda não têm custo conhecido
                    (sem compra registrada, direta ou via pré-preparo) — o custo total fica incompleto.
                  </p>
                )}
              </div>
            )}
          </div>

          <button onClick={salvar} disabled={salvando || !podeSalvar} className="w-full bg-green-600 text-white rounded-lg py-3 font-semibold disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {modalAberto && (
        <SelecionarInsumoReceitaModal
          materias={materias}
          prePreparos={prePreparos}
          onAdd={(item) => setItens((prev) => [...prev, item])}
          onClose={() => setModalAberto(false)}
        />
      )}
    </ProtectedRoute>
  )
}
