'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Check, Search } from 'lucide-react'

interface ItemCarrinho {
  produto_id: string
  nome: string
  quantidade: number
  observacao?: string
}

type Step = 1 | 2 | 3

export default function NovaOrdemInternaPage() {
  const router = useRouter()
  const { usuario } = useAuth()
  const [step, setStep] = useState<Step>(1)
  const [insumos, setInsumos] = useState<any[]>([])
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [solicitado_por, setSolicitadoPor] = useState('')
  const [data_entrega, setDataEntrega] = useState('')
  const [insumoSel, setInsumoSel] = useState('')
  const [qtdSel, setQtdSel] = useState(1)
  const [observacaoSel, setObservacaoSel] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoriasExpandidas, setCategoriasExpandidas] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const hoje = new Date().toISOString().split('T')[0]
    setDataEntrega(hoje)

    if (usuario?.nome) {
      setSolicitadoPor(usuario.nome)
    }

    supabase.from('produtos').select('id, nome, tipo, categoria_id, categoria:categorias(nome), unidade_medida').eq('ativo', true).eq('tipo', 'Insumo').order('categoria(nome), nome')
      .then(({ data }) => {
        setInsumos(data || [])
        const cats = data?.reduce((acc: any, p: any) => ({ ...acc, [p.categoria?.nome || 'Outros']: true }), {}) || {}
        setCategoriasExpandidas(cats)
      })
  }, [usuario?.nome])

  const insumosPorCategoria = insumos.reduce((acc: any, p: any) => {
    const cat = p.categoria?.nome || 'Outros'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {} as Record<string, any[]>)

  const categorias = Object.keys(insumosPorCategoria).sort()

  const insumosFiltrados = insumos.filter(p =>
    p.nome.toLowerCase().includes(searchTerm.toLowerCase())
  )

  function toggleCategoria(cat: string) {
    setCategoriasExpandidas(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  function adicionarItem() {
    if (!insumoSel) return
    const insumo = insumos.find(p => p.id === insumoSel)
    if (!insumo) return
    setCarrinho(prev => {
      const existe = prev.find(i => i.produto_id === insumoSel)
      if (existe) return prev.map((i: any) => i.produto_id === insumoSel ? { ...i, quantidade: i.quantidade + qtdSel, observacao: observacaoSel } : i)
      return [...prev, { produto_id: insumoSel, nome: insumo.nome, quantidade: qtdSel, observacao: observacaoSel }]
    })
    setInsumoSel('')
    setQtdSel(1)
    setObservacaoSel('')
  }

  function removerItem(produto_id: string) {
    setCarrinho(prev => prev.filter(i => i.produto_id !== produto_id))
  }

  function podeAvançar(): boolean {
    if (step === 1) return !!data_entrega && !!solicitado_por
    if (step === 2) return carrinho.length > 0
    return true
  }

  async function enviarOrdem() {
    if (carrinho.length === 0) return
    setSalvando(true)

    const hoje = new Date().toISOString().split('T')[0]

    await supabase.from('ordens_producao').insert(
      carrinho.map((item: any) => ({
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        loja_destino: 'cozinha',
        solicitado_por,
        observacao: item.observacao || null,
        data_solicitacao: hoje,
        data_entrega,
        tipo_ordem: 'interna',
        status: 'pendente',
        updated_at: new Date().toISOString(),
      }))
    )
    router.push('/producao')
  }

  const totalItens = carrinho.reduce((sum, item) => sum + item.quantidade, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="p-4 max-w-7xl mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500"><ArrowLeft size={22} /></button>
          <h1 className="text-xl font-bold text-gray-800">Nova Ordem Interna</h1>
        </div>
      </div>

      {/* Steps */}
      <div className="bg-white border-b border-gray-200 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex gap-4">
            {[
              { num: 1, icon: '📦', label: 'Informações' },
              { num: 2, icon: '🛒', label: 'Insumos' },
              { num: 3, icon: '✅', label: 'Revisão' }
            ].map((s: any) => (
              <button
                key={s.num}
                onClick={() => setStep(s.num)}
                disabled={s.num > 1 && !podeAvançar()}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                  step === s.num
                    ? 'bg-blue-700 text-white'
                    : s.num < step
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500 cursor-not-allowed'
                }`}
              >
                {s.num < step && <Check size={16} />}
                <span>{s.icon} {s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Side - Main Content */}
          <div className="lg:col-span-2">
            {/* STEP 1: Informações */}
            {step === 1 && (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
                <h2 className="text-lg font-bold text-gray-800 mb-6">Informações da Ordem</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Data de Entrega</label>
                  <input
                    type="date"
                    value={data_entrega}
                    onChange={e => setDataEntrega(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Solicitado Por</label>
                  <div className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-700 font-medium">
                    {solicitado_por}
                  </div>
                </div>

                <button
                  onClick={() => setStep(2)}
                  disabled={!podeAvançar()}
                  className="w-full bg-blue-700 text-white rounded-lg py-3 font-medium disabled:opacity-50"
                >
                  Prosseguir para Insumos →
                </button>
              </div>
            )}

            {/* STEP 2: Adicionar Insumos */}
            {step === 2 && (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold text-gray-800 mb-6">Adicionar Insumos</h2>

                {!insumoSel && (
                  <>
                    {/* Search */}
                    <div className="mb-4 relative">
                      <Search size={18} className="absolute left-3 top-3 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Buscar insumo..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
                      />
                    </div>

                    {/* Insumo List */}
                    <div className="space-y-2 max-h-80 overflow-y-auto mb-6 pb-4 border-b border-gray-200">
                      {searchTerm ? (
                        insumosFiltrados.map((p: any) => (
                          <button
                            key={p.id}
                            onClick={() => setInsumoSel(p.id)}
                            className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200"
                          >
                            <div className="font-medium">{p.nome}</div>
                            <div className="text-xs text-gray-500">{p.categoria?.nome || 'Outros'}</div>
                          </button>
                        ))
                      ) : (
                        categorias.map((cat: any) => (
                          <div key={cat}>
                            <button
                              type="button"
                              onClick={() => toggleCategoria(cat)}
                              className="w-full text-left px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold text-gray-700"
                            >
                              📁 {cat}
                            </button>
                            {categoriasExpandidas[cat] && (
                              <div className="ml-2 mt-1 space-y-1">
                                {insumosPorCategoria[cat].map((p: any) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setInsumoSel(p.id)}
                                    className="w-full text-left px-3 py-2 rounded text-sm transition-all text-gray-600 hover:bg-gray-50"
                                  >
                                    {p.nome}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}

                {/* Quantidade e Observação */}
                {insumoSel && (
                  <div className="space-y-4 mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="font-semibold text-gray-800">
                      {insumos.find(p => p.id === insumoSel)?.nome}
                    </h3>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Quantidade</label>
                      <input
                        type="number"
                        min={1}
                        value={qtdSel}
                        onChange={e => setQtdSel(Number(e.target.value))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-3 text-lg font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Observação</label>
                      <textarea
                        value={observacaoSel}
                        onChange={e => setObservacaoSel(e.target.value)}
                        placeholder="Ex: Ingrediente especial, forma diferente, etc."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm h-20 resize-none"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setInsumoSel('')
                          setQtdSel(1)
                          setObservacaoSel('')
                        }}
                        className="flex-1 bg-gray-200 text-gray-700 rounded-lg py-3 text-sm font-medium"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={adicionarItem}
                        className="flex-1 bg-blue-700 text-white rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-2"
                      >
                        <Plus size={18} /> Adicionar
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 bg-gray-200 text-gray-700 rounded-lg py-3 font-medium"
                  >
                    ← Voltar
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!podeAvançar()}
                    className="flex-1 bg-blue-700 text-white rounded-lg py-3 font-medium disabled:opacity-50"
                  >
                    Revisar →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Revisão */}
            {step === 3 && (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold text-gray-800 mb-6">Revisão</h2>

                <div className="space-y-4 mb-6 pb-6 border-b border-gray-200">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Data de Entrega</p>
                      <p className="font-semibold text-gray-800">{new Date(data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Solicitado Por</p>
                      <p className="font-semibold text-gray-800">{solicitado_por}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Tipo</p>
                      <p className="font-semibold text-gray-800">Ordem Interna</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Total de Itens</p>
                      <p className="font-semibold text-gray-800">{totalItens}</p>
                    </div>
                  </div>
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Insumos</h3>
                <div className="space-y-3 mb-6">
                  {carrinho.map((item: any) => (
                    <div key={item.produto_id} className="bg-gray-50 p-4 rounded-lg text-sm">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium text-gray-800">{item.nome}</p>
                          <p className="text-gray-500">Quantidade: <span className="font-semibold text-gray-800">{item.quantidade}</span></p>
                        </div>
                        <button
                          onClick={() => removerItem(item.produto_id)}
                          className="text-red-600 hover:text-red-700 text-xs font-medium"
                        >
                          Remover
                        </button>
                      </div>
                      {item.observacao && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <p className="text-xs text-gray-500 font-medium">Observação:</p>
                          <p className="text-gray-700">{item.observacao}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 bg-gray-200 text-gray-700 rounded-lg py-3 font-medium"
                  >
                    ← Voltar
                  </button>
                  <button
                    onClick={enviarOrdem}
                    disabled={salvando}
                    className="flex-1 bg-green-600 text-white rounded-lg py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Check size={18} /> {salvando ? 'Enviando...' : 'Criar Ordem'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Side - Carrinho */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 sticky top-24">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                🛒 Carrinho ({totalItens})
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {carrinho.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">Carrinho vazio</p>
                ) : (
                  carrinho.map((item: any) => (
                    <div key={item.produto_id} className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <p className="text-sm font-medium text-gray-800">{item.nome}</p>
                      <p className="text-xs text-gray-600 mt-1">Qtd: {item.quantidade}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
