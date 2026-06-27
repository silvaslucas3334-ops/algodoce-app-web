'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, AlertCircle, Edit2, Trash2, X } from 'lucide-react'

export default function ProdutosTab() {
  const [produtos, setProdutos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mostraFormulario, setMostraFormulario] = useState(false)
  const [produtoEditando, setProdutoEditando] = useState<any>(null)
  const [erro, setErro] = useState('')
  const [estoquePendente, setEstoquePendente] = useState<Record<string, number>>({})
  const [form, setForm] = useState({
    nome: '',
    tipo: 'Produzido',
    unidade_medida: 'Unidade',
    validade_dias: 7,
    congelado: false,
    fatias_porcoes: null as number | null,
    categoria: 'Outros',
  })
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    carregarProdutos()
  }, [])

  async function carregarProdutos() {
    setLoading(true)
    const { data } = await supabase.from('produtos').select('*').order('nome')
    setProdutos(data || [])

    // Verificar estoque pendente para cada produto
    if (data) {
      const estoque: Record<string, number> = {}
      for (const p of data) {
        const { count } = await supabase
          .from('lotes_producao')
          .select('id', { count: 'exact', head: true })
          .eq('produto_id', p.id)
          .eq('status', 'enviado')
        estoque[p.id] = count || 0
      }
      setEstoquePendente(estoque)
    }

    setLoading(false)
  }

  async function salvarProduto(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')

    try {
      if (produtoEditando) {
        // Atualizar
        const { error } = await supabase
          .from('produtos')
          .update(form)
          .eq('id', produtoEditando.id)

        if (error) {
          setErro(error.message)
          setSalvando(false)
          return
        }
      } else {
        // Criar novo
        const { error } = await supabase.from('produtos').insert({
          ...form,
          ativo: true,
        })

        if (error) {
          setErro(error.message)
          setSalvando(false)
          return
        }
      }

      setForm({
        nome: '',
        tipo: 'Produzido',
        unidade_medida: 'Unidades',
        validade_dias: 7,
        congelado: false,
        fatias_porcoes: null,
        categoria: 'Outros',
      })
      setProdutoEditando(null)
      setMostraFormulario(false)
      carregarProdutos()
    } catch (err) {
      setErro('Erro ao salvar produto')
      console.error(err)
    }
    setSalvando(false)
  }

  async function deletarProduto(id: string) {
    const temEstoquePendente = estoquePendente[id] > 0
    if (temEstoquePendente) {
      setErro('Não é possível deletar produtos com estoque pendente de confirmação')
      return
    }

    if (!confirm('Tem certeza que deseja deletar este produto?')) return

    setSalvando(true)
    const { error } = await supabase.from('produtos').delete().eq('id', id)

    if (error) {
      setErro(error.message)
    } else {
      carregarProdutos()
    }
    setSalvando(false)
  }

  function abrirEdicao(produto: any) {
    setProdutoEditando(produto)
    setForm({
      nome: produto.nome,
      tipo: produto.tipo,
      unidade_medida: produto.unidade_medida,
      validade_dias: produto.validade_dias,
      congelado: produto.congelado,
      fatias_porcoes: produto.fatias_porcoes,
      categoria: produto.categoria,
    })
    setMostraFormulario(true)
  }

  function cancelarEdicao() {
    setProdutoEditando(null)
    setMostraFormulario(false)
    setForm({
      nome: '',
      tipo: 'Produzido',
      unidade_medida: 'Unidade',
      validade_dias: 7,
      congelado: false,
      fatias_porcoes: null,
      categoria: 'Outros',
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Produtos</h2>
        <button
          onClick={() => setMostraFormulario(!mostraFormulario)}
          className="bg-pink-700 text-white rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-pink-800"
        >
          <Plus size={18} /> Novo Produto
        </button>
      </div>

      {mostraFormulario && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              {produtoEditando ? 'Editar Produto' : 'Cadastrar Novo Produto'}
            </h3>
            <button
              onClick={cancelarEdicao}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={24} />
            </button>
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{erro}</p>
            </div>
          )}

          <form onSubmit={salvarProduto} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Produto</label>
              <input
                type="text"
                required
                value={form.nome}
                onChange={e => setForm({ ...form, nome: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <select
                value={form.categoria}
                onChange={e => setForm({ ...form, categoria: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="Bolos">Bolos</option>
                <option value="Tortas">Tortas</option>
                <option value="Insumos">Insumos</option>
                <option value="Pães">Pães</option>
                <option value="Mini Tortinhas">Mini Tortinhas</option>
                <option value="Copinhos">Copinhos</option>
                <option value="Outros">Outros</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select
                value={form.tipo}
                onChange={e => setForm({ ...form, tipo: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="Produzido">Produzido</option>
                <option value="Insumo">Insumo</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unidade de Medida</label>
              <select
                value={form.unidade_medida}
                onChange={e => setForm({ ...form, unidade_medida: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="Unidade">Unidade</option>
                <option value="Gramas">Gramas</option>
                <option value="Fatias">Fatias</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Validade (dias)</label>
              <input
                type="number"
                min={1}
                value={form.validade_dias}
                onChange={e => setForm({ ...form, validade_dias: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fatias/Porções</label>
              <input
                type="number"
                min={0}
                value={form.fatias_porcoes || ''}
                onChange={e => setForm({ ...form, fatias_porcoes: e.target.value ? Number(e.target.value) : null })}
                placeholder="Opcional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="congelado"
                checked={form.congelado}
                onChange={e => setForm({ ...form, congelado: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="congelado" className="text-sm font-medium text-gray-700">
                Produto Congelado ❄️
              </label>
            </div>

            <div className="md:col-span-2 flex gap-3">
              <button
                type="submit"
                disabled={salvando}
                className="flex-1 bg-pink-700 text-white rounded-lg py-2 font-semibold disabled:opacity-60"
              >
                {salvando ? 'Salvando...' : 'Salvar Produto'}
              </button>
              <button
                type="button"
                onClick={() => setMostraFormulario(false)}
                className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 font-semibold"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : produtos.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Nenhum produto cadastrado</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Categoria</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Un. Medida</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Validade</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {produtos.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-800 cursor-pointer" onClick={() => abrirEdicao(p)}>
                    {p.nome}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{p.categoria}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{p.tipo}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{p.unidade_medida}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{p.validade_dias} dias</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${p.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right flex gap-2 justify-end">
                    <button
                      onClick={() => abrirEdicao(p)}
                      className="text-blue-600 hover:text-blue-800 p-1"
                      title="Editar"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => deletarProduto(p.id)}
                      disabled={estoquePendente[p.id] > 0}
                      className={`p-1 ${estoquePendente[p.id] > 0 ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:text-red-800'}`}
                      title={estoquePendente[p.id] > 0 ? 'Não pode deletar com estoque pendente' : 'Deletar'}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
