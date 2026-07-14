'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import EmptyState from '@/components/EmptyState'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import { FinanceiroCotacao, StatusCotacao } from '@/lib/types'
import { UNIDADE_LABEL } from '@/lib/constants'

const STATUS_LABEL: Record<StatusCotacao, string> = {
  aberta: 'Aberta',
  fechada: 'Fechada',
  cancelada: 'Cancelada',
}
const STATUS_COLOR: Record<StatusCotacao, string> = {
  aberta: 'bg-amber-100 text-amber-700',
  fechada: 'bg-green-100 text-green-700',
  cancelada: 'bg-gray-100 text-gray-500',
}

export default function CotacoesPage() {
  const router = useRouter()
  const [cotacoes, setCotacoes] = useState<FinanceiroCotacao[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('financeiro_cotacoes')
      .select('*, fornecedor_vencedor:financeiro_partes!fornecedor_vencedor_id(nome)')
      .order('criado_em', { ascending: false })
    if (error) console.error('Erro ao carregar cotações:', error)
    // Abertas primeiro, depois por data de criação mais recente dentro de cada grupo.
    const ordenadas = (data || []).sort((a, b) => {
      if (a.status === 'aberta' && b.status !== 'aberta') return -1
      if (a.status !== 'aberta' && b.status === 'aberta') return 1
      return 0
    })
    setCotacoes(ordenadas)
    setLoading(false)
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/financeiro')} className="text-gray-500 hover:text-gray-700">
                <ArrowLeft size={22} />
              </button>
              <h1 className="text-xl font-bold text-gray-800">Cotações</h1>
            </div>
            <button
              onClick={() => router.push('/financeiro/cotacoes/nova')}
              className="bg-pink-700 text-white rounded-lg px-4 py-2 font-semibold flex items-center gap-2 hover:bg-pink-800"
            >
              <Plus size={18} /> Nova Cotação
            </button>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-6">
          {loading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : cotacoes.length === 0 ? (
            <EmptyState
              title="Nenhuma cotação ainda"
              description="Crie uma cotação para comparar preços de fornecedores antes de comprar"
            />
          ) : (
            <div className="space-y-2">
              {cotacoes.map((c) => (
                <div
                  key={c.id}
                  onClick={() => router.push(`/financeiro/cotacoes/${c.id}`)}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:border-gray-200"
                >
                  <div>
                    <p className="font-medium text-gray-800">{c.titulo}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {UNIDADE_LABEL[c.unidade]} · {new Date(c.criado_em).toLocaleDateString('pt-BR')}
                      {c.status === 'fechada' && c.fornecedor_vencedor?.nome && (
                        <span> · Vencedor: {c.fornecedor_vencedor.nome}</span>
                      )}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold ${STATUS_COLOR[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
