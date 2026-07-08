'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import EmptyState from '@/components/EmptyState'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Search } from 'lucide-react'
import { FinanceiroParte } from '@/lib/types'

type Filtro = 'todos' | 'fornecedor' | 'beneficiario'

export default function PartesPage() {
  const router = useRouter()
  const [partes, setPartes] = useState<FinanceiroParte[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('financeiro_partes')
      .select('*')
      .order('nome')
    if (error) console.error('Erro ao carregar partes:', error)
    setPartes(data || [])
    setLoading(false)
  }

  const filtradas = partes.filter((p) => {
    if (filtro === 'fornecedor' && !p.papel_fornecedor) return false
    if (filtro === 'beneficiario' && !p.papel_beneficiario) return false
    const termo = busca.trim().toLowerCase()
    if (!termo) return true
    return p.nome.toLowerCase().includes(termo) || (p.documento || '').includes(termo)
  })

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/financeiro')} className="text-gray-500 hover:text-gray-700">
                <ArrowLeft size={22} />
              </button>
              <h1 className="text-xl font-bold text-gray-800">Fornecedores / Beneficiários</h1>
            </div>
            <Link
              href="/financeiro/partes/nova"
              className="bg-pink-700 text-white rounded-lg px-4 py-2 font-semibold flex items-center gap-2 hover:bg-pink-800"
            >
              <Plus size={18} /> Novo
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="relative mb-3">
            <Search size={18} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou documento..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
            />
          </div>

          <div className="flex gap-2 mb-4">
            {([
              { key: 'todos', label: 'Todos' },
              { key: 'fornecedor', label: 'Fornecedores' },
              { key: 'beneficiario', label: 'Beneficiários' },
            ] as { key: Filtro; label: string }[]).map((f) => (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  filtro === f.key
                    ? 'bg-pink-100 text-pink-700 border-transparent font-semibold'
                    : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : filtradas.length === 0 ? (
            <EmptyState title="Nenhuma parte cadastrada" description="Cadastre fornecedores e beneficiários para lançar despesas e compras" />
          ) : (
            <div className="space-y-2">
              {filtradas.map((p) => (
                <Link key={p.id} href={`/financeiro/partes/${p.id}`}>
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 cursor-pointer transition-all">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-gray-800">{p.nome}</p>
                        {p.documento && <p className="text-xs text-gray-500 font-mono mt-0.5">{p.documento}</p>}
                      </div>
                      <div className="flex gap-1">
                        {p.papel_fornecedor && (
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">Fornecedor</span>
                        )}
                        {p.papel_beneficiario && (
                          <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">Beneficiário</span>
                        )}
                        {!p.ativo && (
                          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">Inativo</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
