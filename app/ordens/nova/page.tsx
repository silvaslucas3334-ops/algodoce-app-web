'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function NovaOrdemPage() {
  const router = useRouter()
  const [produtos, setProdutos] = useState<any[]>([])
  const [form, setForm] = useState({
    produto_id: '',
    quantidade: 1,
    loja_destino: 'loja1',
    solicitado_por: '',
    observacao: '',
  })
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    supabase.from('produtos').select('id, nome, tipo').eq('ativo', true).order('nome').then(({ data }) => setProdutos(data || []))
  }, [])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.produto_id || !form.solicitado_por) return
    setSalvando(true)
    await supabase.from('ordens_producao').insert({
      ...form,
      status: 'pendente',
      updated_at: new Date().toISOString(),
    })
    router.push('/ordens')
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 pt-4 mb-6">
        <button onClick={() => router.back()} className="text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">Nova Ordem de Produção</h1>
      </div>

      <form onSubmit={salvar} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Produto</label>
          <select
            required
            value={form.produto_id}
            onChange={e => setForm(f => ({ ...f, produto_id: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
          >
            <option value="">Selecione um produto...</option>
            {produtos.map(p => (
              <option key={p.id} value={p.id}>{p.nome} ({p.tipo})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
          <input
            type="number"
            min={1}
            required
            value={form.quantidade}
            onChange={e => setForm(f => ({ ...f, quantidade: Number(e.target.value) }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Destino</label>
          <select
            value={form.loja_destino}
            onChange={e => setForm(f => ({ ...f, loja_destino: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
          >
            <option value="loja1">Loja 1</option>
            <option value="loja2">Loja 2</option>
            <option value="cozinha">Estoque Cozinha</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Solicitado por</label>
          <input
            type="text"
            required
            placeholder="Seu nome"
            value={form.solicitado_por}
            onChange={e => setForm(f => ({ ...f, solicitado_por: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observação (opcional)</label>
          <textarea
            rows={3}
            placeholder="Ex: urgente, tamanho específico..."
            value={form.observacao}
            onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={salvando}
          className="w-full bg-pink-700 text-white rounded-xl py-3 font-semibold disabled:opacity-60"
        >
          {salvando ? 'Salvando...' : 'Enviar Ordem'}
        </button>
      </form>
    </div>
  )
}
