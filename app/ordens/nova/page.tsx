'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, ShoppingCart, ChevronDown, ChevronUp } from 'lucide-react'

interface ItemCarrinho {
  produto_id: string
  nome: string
  quantidade: number
}

export default function NovaOrdemPage() {
  const router = useRouter()
  const { usuario } = useAuth()
  const [produtos, setProdutos] = useState<any[]>([])
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [loja_destino, setLojaDestino] = useState(usuario?.loja_id || 'loja1')
  const [solicitado_por, setSolicitadoPor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [data_entrega, setDataEntrega] = useState('')
  const [produtoSel, setProdutoSel] = useState('')
  const [qtdSel, setQtdSel] = useState(1)
  const [salvando, setSalvando] = useState(false)
  const [categoriasExpandidas, setCategoriasExpandidas] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const hoje = new Date().toISOString().split('T')[0]
    setDataEntrega(hoje)

    // Preencher solicitado_por com nome do usuário
    if (usuario?.nome) {
      setSolicitadoPor(usuario.nome)
    }

    supabase.from('produtos').select('id, nome, tipo, categoria').eq('ativo', true).order('categoria, nome')
      .then(({ data }) => {
        setProdutos(data || [])
        const cats = data?.reduce((acc, p: any) => ({ ...acc, [p.categoria]: true }), {}) || {}
        setCategoriasExpandidas(cats)
      })
  }, [usuario?.nome])

  const produtosPorCategoria = produtos.reduce((acc, p) => {
    const cat = p.categoria || 'Outros'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {} as Record<string, any[]>)

  const categorias = Object.keys(produtosPorCategoria).sort()

  function toggleCategoria(cat: string) {
    setCategoriasExpandidas(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  function adicionarItem() {
    if (!produtoSel) return
    const produto = produtos.find(p => p.id === produtoSel)
    if (!produto) return
    setCarrinho(prev => {
      const existe = prev.find(i => i.produto_id === produtoSel)
      if (existe) return prev.map(i => i.produto_id === produtoSel ? { ...i, quantidade: i.quantidade + qtdSel } : i)
      return [...prev, { produto_id: produtoSel, nome: produto.nome, quantidade: qtdSel }]
    })
    setProdutoSel('')
    setQtdSel(1)
  }

  function removerItem(produto_id: string) {
    setCarrinho(prev => prev.filter(i => i.produto_id !== produto_id))
  }

  async function enviarOrdem(e: React.FormEvent) {
    e.preventDefault()
    if (carrinho.length === 0 || !solicitado_por || !data_entrega) return
    setSalvando(true)

    const hoje = new Date().toISOString().split('T')[0]

    await supabase.from('ordens_producao').insert(
      carrinho.map(item => ({
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        loja_destino,
        solicitado_por,
        observacao: observacao || null,
        data_solicitacao: hoje,
        data_entrega,
        status: 'pendente',
        updated_at: new Date().toISOString(),
      }))
    )
    router.push('/ordens')
  }

  const hoje = new Date().toISOString().split('T')[0]

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 pt-4 mb-6">
        <button onClick={() => router.back()} className="text-gray-500"><ArrowLeft size={22} /></button>
        <h1 className="text-xl font-bold text-gray-800">Nova Ordem de Produção</h1>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
        <h2 className="font-semibold text-gray-700 mb-3">Adicionar produto</h2>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {categorias.map(cat => (
            <div key={cat}>
              <button
                type="button"
                onClick={() => toggleCategoria(cat)}
                className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 text-sm font-medium text-gray-700"
              >
                <span>{cat}</span>
                {categoriasExpandidas[cat] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {categoriasExpandidas[cat] && (
                <div className="ml-2 mt-1 space-y-1 border-l-2 border-gray-200 pl-2">
                  {produtosPorCategoria[cat].map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProdutoSel(p.id)}
                      className={`w-full text-left text-sm px-2 py-1.5 rounded ${produtoSel === p.id ? 'bg-pink-100 text-pink-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                      {p.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-3">
          <input
            type="number" min={1} value={qtdSel}
            onChange={e => setQtdSel(Number(e.target.value))}
            className="w-24 border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
          />
          <button
            type="button"
            onClick={adicionarItem}
            disabled={!produtoSel}
            className="flex-1 bg-pink-700 text-white rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-40"
          >
            <Plus size={16} /> Adicionar
          </button>
        </div>
      </div>

      {carrinho.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4">
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <ShoppingCart size={18} className="text-pink-700" />
            <h2 className="font-semibold text-gray-700">Carrinho ({carrinho.length} {carrinho.length === 1 ? 'item' : 'itens'})</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {carrinho.map(item => (
              <div key={item.produto_id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{item.nome}</p>
                  <p className="text-xs text-gray-400">{item.quantidade} unidade{item.quantidade > 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => removerItem(item.produto_id)} className="text-gray-300 hover:text-red-400 p-1">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={enviarOrdem} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Destino</label>
          <select
            value={loja_destino}
            onChange={e => setLojaDestino(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
          >
            {Object.entries(LOCAL_LABEL).filter(([k]) => k !== 'cozinha').map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data de entrega</label>
          <input
            type="date"
            required
            min={hoje}
            value={data_entrega}
            onChange={e => setDataEntrega(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Solicitado por</label>
          <p className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-700 font-medium">
            {solicitado_por}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observação (opcional)</label>
          <textarea
            rows={2} placeholder="Ex: urgente, prazo especial..."
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={salvando || carrinho.length === 0 || !solicitado_por || !data_entrega}
          className="w-full bg-pink-700 text-white rounded-xl py-3 font-semibold disabled:opacity-40"
        >
          {salvando ? 'Enviando...' : `Enviar ${carrinho.length} ordem${carrinho.length !== 1 ? 's' : ''} para cozinha`}
        </button>
      </form>
    </div>
  )
}
