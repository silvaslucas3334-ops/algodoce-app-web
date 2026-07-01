'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Edit2, Trash2, X } from 'lucide-react'

export default function CategoriasTab() {
  const [categorias, setCategorias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mostraFormulario, setMostraFormulario] = useState(false)
  const [categoriaEditando, setCategoriaEditando] = useState<any>(null)
  const [form, setForm] = useState({ nome: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [produtosComCategoria, setProdutosComCategoria] = useState<Record<string, number>>({})

  useEffect(() => {
    carregarCategorias()
    const channel = supabase
      .channel('categorias-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categorias' }, carregarCategorias)
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [])

  async function carregarCategorias() {
    setLoading(true)
    const { data } = await supabase.from('categorias').select('*').order('nome')
    setCategorias(data || [])

    // Contar quantos produtos tem em cada categoria
    if (data) {
      const contagem: Record<string, number> = {}
      for (const cat of data) {
        const { count } = await supabase
          .from('produtos')
          .select('id', { count: 'exact', head: true })
          .eq('categoria_id', cat.id)
        contagem[cat.id] = count || 0
      }
      setProdutosComCategoria(contagem)
    }

    setLoading(false)
  }

  async function salvarCategoria(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')

    if (!form.nome.trim()) {
      setErro('Nome da categoria é obrigatório')
      setSalvando(false)
      return
    }

    try {
      if (categoriaEditando) {
        // Atualizar
        const { error } = await supabase
          .from('categorias')
          .update({ nome: form.nome.trim() })
          .eq('id', categoriaEditando.id)

        if (error) {
          setErro(error.message)
          setSalvando(false)
          return
        }
      } else {
        // Criar novo
        const { error } = await supabase.from('categorias').insert({
          nome: form.nome.trim(),
        })

        if (error) {
          setErro(error.message)
          setSalvando(false)
          return
        }
      }

      setForm({ nome: '' })
      setCategoriaEditando(null)
      setMostraFormulario(false)
      carregarCategorias()
    } catch (err) {
      setErro('Erro ao salvar categoria')
      console.error(err)
    }

    setSalvando(false)
  }

  async function deletarCategoria(id: string, nome: string) {
    const temProdutos = produtosComCategoria[id] > 0

    if (temProdutos) {
      setErro(`Não é possível deletar "${nome}" pois há ${produtosComCategoria[id]} produto(s) nesta categoria. Mude os produtos para outra categoria primeiro.`)
      return
    }

    if (!confirm(`Tem certeza que deseja deletar a categoria "${nome}"?`)) return

    setSalvando(true)
    const { error } = await supabase.from('categorias').delete().eq('id', id)

    if (error) {
      setErro(error.message)
    } else {
      carregarCategorias()
    }
    setSalvando(false)
  }

  function abrirEdicao(categoria: any) {
    setCategoriaEditando(categoria)
    setForm({ nome: categoria.nome })
    setMostraFormulario(true)
  }

  function cancelarEdicao() {
    setCategoriaEditando(null)
    setMostraFormulario(false)
    setForm({ nome: '' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Categorias</h2>
        <button
          onClick={() => setMostraFormulario(!mostraFormulario)}
          className="bg-pink-700 text-white rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-pink-800"
        >
          <Plus size={18} /> Nova Categoria
        </button>
      </div>

      {mostraFormulario && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              {categoriaEditando ? 'Editar Categoria' : 'Cadastrar Nova Categoria'}
            </h3>
            <button
              onClick={cancelarEdicao}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={24} />
            </button>
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">
              {erro}
            </div>
          )}

          <form onSubmit={salvarCategoria} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Categoria</label>
              <input
                type="text"
                required
                value={form.nome}
                onChange={e => setForm({ nome: e.target.value })}
                placeholder="Ex: Bolos, Tortas, Insumos..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={salvando}
                className="flex-1 bg-green-600 text-white rounded-lg py-2 font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                type="button"
                onClick={cancelarEdicao}
                disabled={salvando}
                className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 font-semibold hover:bg-gray-200 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : categorias.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Nenhuma categoria cadastrada</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categorias.map((cat: any) => (
            <div key={cat.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800">{cat.nome}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {produtosComCategoria[cat.id] || 0} produto(s)
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => abrirEdicao(cat)}
                  className="flex-1 bg-blue-50 text-blue-600 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1 hover:bg-blue-100"
                >
                  <Edit2 size={14} /> Editar
                </button>
                <button
                  onClick={() => deletarCategoria(cat.id, cat.nome)}
                  disabled={salvando}
                  className="flex-1 bg-red-50 text-red-600 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1 hover:bg-red-100 disabled:opacity-50"
                >
                  <Trash2 size={14} /> Deletar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {erro && !mostraFormulario && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {erro}
        </div>
      )}
    </div>
  )
}
