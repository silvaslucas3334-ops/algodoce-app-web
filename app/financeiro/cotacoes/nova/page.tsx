'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import SelecionarItemCotacaoModal, { ItemCotacaoForm } from '@/components/SelecionarItemCotacaoModal'
import { criarCotacao } from '@/lib/financeiro-cotacoes'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { FinanceiroParte, FinanceiroMateriaPrima, UnidadeFinanceiro } from '@/lib/types'
import { UNIDADE_LABEL } from '@/lib/constants'

export default function NovaCotacaoPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const [materias, setMaterias] = useState<FinanceiroMateriaPrima[]>([])
  const [fornecedores, setFornecedores] = useState<FinanceiroParte[]>([])

  const [titulo, setTitulo] = useState('')
  const [unidade, setUnidade] = useState<UnidadeFinanceiro>('loja1')
  const [itens, setItens] = useState<ItemCotacaoForm[]>([])
  const [modalAberto, setModalAberto] = useState(false)
  const [fornecedoresSelecionados, setFornecedoresSelecionados] = useState<Set<string>>(new Set())

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

  function alternarFornecedor(id: string) {
    setFornecedoresSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  const podeSalvar = titulo.trim() && itens.length > 0 && fornecedoresSelecionados.size > 0

  async function salvar() {
    if (!podeSalvar || !usuario) {
      setErro('Preencha um título, adicione ao menos um item e convide ao menos um fornecedor.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const id = await criarCotacao(
        titulo.trim(),
        unidade,
        itens.map((i) => ({
          materia_prima_id: i.materia_prima_id,
          quantidade: i.quantidade,
          unidade_cotacao: i.unidade_cotacao,
          observacao: i.observacao,
        })),
        Array.from(fornecedoresSelecionados),
        usuario.id
      )
      router.push(`/financeiro/cotacoes/${id}`)
    } catch (err: any) {
      console.error('Erro ao criar cotação:', err)
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
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
            <h1 className="text-xl font-bold text-gray-800">Nova Cotação</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

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
            ) : (
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
            )}
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Fornecedores convidados</h2>
            {fornecedores.length === 0 ? (
              <p className="text-xs text-amber-600">Nenhum fornecedor cadastrado — peça ao admin para cadastrar antes de cotar.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {fornecedores.map((f) => {
                  const ativo = fornecedoresSelecionados.has(f.id)
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => alternarFornecedor(f.id)}
                      className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm text-left transition-all ${
                        ativo ? 'border-pink-600 bg-pink-50 text-pink-800 font-semibold' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded border-2 flex-shrink-0 ${ativo ? 'border-pink-600 bg-pink-600' : 'border-gray-300'}`} />
                      {f.nome}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

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
        />
      )}
    </ProtectedRoute>
  )
}
