'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import SelecionarInsumoReceitaModal, { ItemReceitaForm } from '@/components/SelecionarInsumoReceitaModal'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { FinanceiroMateriaPrima } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'
import { criarPrePreparo, salvarItensPrePreparo, buscarCustosAtuaisMateriasPrimas } from '@/lib/financeiro-cmv'

export default function NovoPrePreparoPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const [materias, setMaterias] = useState<FinanceiroMateriaPrima[]>([])

  const [nome, setNome] = useState('')
  const [unidadeMedida, setUnidadeMedida] = useState('g')
  const [rendimentoQuantidade, setRendimentoQuantidade] = useState('')
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
  }, [])

  useEffect(() => {
    const ids = itens.map((i) => i.materia_prima_id).filter((id): id is string => !!id)
    if (ids.length === 0) {
      setCustosMP(new Map())
      return
    }
    buscarCustosAtuaisMateriasPrimas(ids).then(setCustosMP)
  }, [itens])

  function removerItem(indice: number) {
    setItens((prev) => prev.filter((_, i) => i !== indice))
  }

  const rendimentoNum = Number(rendimentoQuantidade)
  const podeSalvar = nome.trim() && unidadeMedida.trim() && rendimentoNum > 0 && itens.length > 0

  const custoTotalConhecido = itens.reduce((soma, item) => {
    const custo = item.materia_prima_id ? custosMP.get(item.materia_prima_id) : undefined
    return custo != null ? soma + item.quantidade * custo : soma
  }, 0)
  const itensSemCusto = itens.filter((i) => i.materia_prima_id && custosMP.get(i.materia_prima_id) == null)

  async function salvar() {
    if (!podeSalvar || !usuario) {
      setErro('Preencha nome, unidade, rendimento e adicione pelo menos um item.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const id = await criarPrePreparo(
        {
          nome: nome.trim(),
          unidade_medida: unidadeMedida.trim(),
          rendimento_quantidade: rendimentoNum,
          descricao: descricao.trim() || null,
        },
        usuario.id
      )
      await salvarItensPrePreparo(
        id,
        itens.map((i) => ({ materia_prima_id: i.materia_prima_id!, quantidade: i.quantidade }))
      )
      router.push('/financeiro/pre-preparos')
    } catch (err: any) {
      console.error('Erro ao salvar pré-preparo:', err)
      const msg = err?.code === '23505' ? 'Já existe um pré-preparo com esse nome.' : 'Erro ao salvar: ' + (err?.message || 'desconhecido')
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
            <h1 className="text-xl font-bold text-gray-800">Novo Pré-Preparado</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Dados do pré-preparado</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nome</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                placeholder="Ex: Massa Retangular, Recheio de Chocolate..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Unidade</label>
                <input
                  type="text"
                  value={unidadeMedida}
                  onChange={(e) => setUnidadeMedida(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="g, ml, un..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rende quanto</label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={rendimentoQuantidade}
                  onChange={(e) => setRendimentoQuantidade(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="Ex: 3600"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Ex: a receita usa os itens abaixo e rende 3600 g de massa — o custo por grama é calculado dividindo o total pelo rendimento.
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
                Nenhum item ainda — clique em "Adicionar item" para escolher matérias-primas.
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
                <div className="flex justify-between items-center px-3 pt-2 border-t border-gray-200 text-sm">
                  <span className="font-semibold text-gray-700">Custo total conhecido</span>
                  <span className="font-bold text-gray-900">{formatBRL(custoTotalConhecido)}</span>
                </div>
                {itensSemCusto.length > 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    {itensSemCusto.length === 1 ? 'Este item ainda não tem' : `Estes ${itensSemCusto.length} itens ainda não têm`} nenhuma compra
                    registrada — o custo total fica incompleto até a primeira compra ser lançada.
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
          onAdd={(item) => setItens((prev) => [...prev, item])}
          onClose={() => setModalAberto(false)}
        />
      )}
    </ProtectedRoute>
  )
}
