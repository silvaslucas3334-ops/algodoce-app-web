'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Check, Search, ShoppingCart } from 'lucide-react'

interface ItemCarrinho {
  produto_id: string
  nome: string
  quantidade: number
  observacao?: string
}

type Step = 1 | 2 | 3

export default function NovaOrdemPage() {
  const router = useRouter()
  const { usuario } = useAuth()
  const [step, setStep] = useState<Step>(1)
  const [produtos, setProdutos] = useState<any[]>([])
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [loja_destino, setLojaDestino] = useState(usuario?.loja_id || 'loja1')
  const [solicitado_por, setSolicitadoPor] = useState('')
  const [data_entrega, setDataEntrega] = useState('')
  const [produtoSel, setProdutoSel] = useState('')
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

    supabase.from('produtos').select('id, nome, tipo, categoria_id, categoria:categorias(nome)').eq('ativo', true).order('categoria(nome), nome')
      .then(({ data }) => {
        setProdutos(data || [])
        const cats = data?.reduce((acc: any, p: any) => ({ ...acc, [p.categoria?.nome || 'Outros']: true }), {}) || {}
        setCategoriasExpandidas(cats)
      })
  }, [usuario?.nome])

  const produtosPorCategoria = produtos.reduce((acc: any, p: any) => {
    const cat = p.categoria?.nome || 'Outros'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {} as Record<string, any[]>)

  const categorias = Object.keys(produtosPorCategoria).sort()

  const produtosFiltrados = produtos.filter(p =>
    p.nome.toLowerCase().includes(searchTerm.toLowerCase())
  )

  function toggleCategoria(cat: string) {
    setCategoriasExpandidas(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  function adicionarItem() {
    if (!produtoSel) return
    const produto = produtos.find(p => p.id === produtoSel)
    if (!produto) return
    setCarrinho(prev => {
      const existe = prev.find(i => i.produto_id === produtoSel)
      if (existe) return prev.map((i: any) => i.produto_id === produtoSel ? { ...i, quantidade: i.quantidade + qtdSel, observacao: observacaoSel } : i)
      return [...prev, { produto_id: produtoSel, nome: produto.nome, quantidade: qtdSel, observacao: observacaoSel }]
    })
    setProdutoSel('')
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
        loja_destino,
        solicitado_por,
        observacao: item.observacao || null,
        data_solicitacao: hoje,
        data_entrega,
        status: 'pendente',
        updated_at: new Date().toISOString(),
      }))
    )
    router.push('/ordens')
  }

  const totalItens = carrinho.reduce((sum, item) => sum + item.quantidade, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="p-4 max-w-7xl mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500"><ArrowLeft size={22} /></button>
          <h1 className="text-xl font-bold text-gray-800">Nova Ordem de Produção</h1>
        </div>
      </div>

      {/* Steps */}
      <div className="bg-white border-b border-gray-200 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex gap-4">
            {[1, 2, 3].map((s: any) => (
              <button
                key={s}
                onClick={() => setStep(s)}
                disabled={s > 1 && !podeAvançar()}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  step === s
                    ? 'bg-pink-700 text-white'
                    : s < step
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500 cursor-not-allowed'
                }`}
              >
                {s < step && <Check size={16} className="inline mr-1" />}
                Step {s}
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
            {/* STEP 1: Informações da Entrega */}
            {step === 1 && (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
                <h2 className="text-lg font-bold text-gray-800 mb-6">Informações da Entrega</h2>

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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Loja Destino</label>
                  <select
                    value={loja_destino}
                    onChange={e => setLojaDestino(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
                  >
                    <option value="loja1">{LOCAL_LABEL['loja1']}</option>
                    <option value="loja2">{LOCAL_LABEL['loja2']}</option>
                  </select>
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
                  className="w-full bg-pink-700 text-white rounded-lg py-3 font-medium disabled:opacity-50"
                >
                  Prosseguir para Produtos →
                </button>
              </div>
            )}

            {/* STEP 2: Adicionar Produtos */}
            {step === 2 && (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold text-gray-800 mb-6">Adicionar Produtos</h2>

                {/* Search */}
                <div className="mb-4 relative">
                  <Search size={18} className="absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar produto..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
                  />
                </div>

                {/* Product List */}
                <div className="space-y-2 max-h-80 overflow-y-auto mb-6 pb-4 border-b border-gray-200">
                  {searchTerm ? (
                    produtosFiltrados.map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => setProdutoSel(p.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${
                          produtoSel === p.id
                            ? 'bg-pink-100 text-pink-700 font-medium border-2 border-pink-300'
                            : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                        }`}
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
                            {produtosPorCategoria[cat].map((p: any) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => setProdutoSel(p.id)}
                                className={`w-full text-left px-3 py-2 rounded text-sm transition-all ${
                                  produtoSel === p.id
                                    ? 'bg-pink-100 text-pink-700 font-medium'
                                    : 'text-gray-600 hover:bg-gray-50'
                                }`}
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

                {/* Quantidade e Observação */}
                {produtoSel && (
                  <div className="space-y-4 mb-6 p-4 bg-pink-50 rounded-lg border border-pink-200">
                    <h3 className="font-semibold text-gray-800">
                      {produtos.find(p => p.id === produtoSel)?.nome}
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
                      <label className="block text-sm font-medium text-gray-700 mb-2">Observação (por produto)</label>
                      <textarea
                        value={observacaoSel}
                        onChange={e => setObservacaoSel(e.target.value)}
                        placeholder="Ex: Ingrediente especial, forma diferente, etc."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm h-20 resize-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={adicionarItem}
                      className="w-full bg-pink-700 text-white rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <Plus size={18} /> Adicionar ao Carrinho
                    </button>
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
                    className="flex-1 bg-pink-700 text-white rounded-lg py-3 font-medium disabled:opacity-50"
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
                      <p className="text-gray-500">Loja Destino</p>
                      <p className="font-semibold text-gray-800">{LOCAL_LABEL[loja_destino]}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Solicitado Por</p>
                      <p className="font-semibold text-gray-800">{solicitado_por}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Total de Itens</p>
                      <p className="font-semibold text-gray-800">{totalItens}</p>
                    </div>
                  </div>
                </div>

                <h3 className="font-semibold text-gray-800 mb-3">Produtos</h3>
                <div className="space-y-3 mb-6">
                  {carrinho.map((item: any) => (
                    <div key={item.produto_id} className="bg-gray-50 p-4 rounded-lg text-sm">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium text-gray-800">{item.nome}</p>
                          <p className="text-gray-500">Quantidade: <span className="font-semibold text-gray-800">{item.quantidade}</span></p>
                        </div>
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
                    <Check size={18} /> {salvando ? 'Enviando...' : 'Confirmar Ordem'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Side - Carrinho */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 sticky top-24">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ShoppingCart size={20} />
                Resumo da Ordem
              </h3>

              <div className="space-y-3 mb-4 pb-4 border-b border-gray-200 max-h-64 overflow-y-auto">
                {carrinho.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">Nenhum item adicionado</p>
                ) : (
                  carrinho.map((item: any) => (
                    <div key={item.produto_id} className="flex justify-between items-start text-sm">
                      <div className="flex-1">
                        <p className="font-medium text-gray-800">{item.nome}</p>
                        <p className="text-gray-500">Qtd: {item.quantidade}</p>
                      </div>
                      <button
                        onClick={() => removerItem(item.produto_id)}
                        className="text-red-600 hover:text-red-700 ml-2"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between font-semibold text-gray-800">
                  <span>Total de Itens:</span>
                  <span className="text-lg text-pink-700">{totalItens}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {carrinho.length} produto(s) adicionado(s)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
