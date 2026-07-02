'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Plus, ArrowLeft, Check, Clock, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import ProtectedRoute from '@/components/ProtectedRoute'

const STATUS_INFO = {
  pendente: { label: 'Pendente', color: 'bg-amber-100 text-amber-700 border-amber-300', icon: Clock },
  concluida: { label: 'Concluída', color: 'bg-green-100 text-green-700 border-green-300', icon: Check },
}

function CozinhaContent() {
  const { usuario } = useAuth()
  const [ordens, setOrdens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('pendente')

  useEffect(() => {
    carregarOrdens()
  }, [])

  async function carregarOrdens() {
    setLoading(true)
    const { data } = await supabase
      .from('ordens_producao')
      .select('*, produto:produtos(nome, tipo)')
      .eq('tipo_ordem', 'interna')
      .order('created_at', { ascending: false })
    setOrdens(data || [])
    setLoading(false)
  }

  async function atualizarStatus(id: string, novoStatus: string) {
    await supabase.from('ordens_producao')
      .update({ status: novoStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
    carregarOrdens()
  }

  const ordensFilter = ordens.filter(o => o.status === filtroStatus)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="p-4 max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800">Cozinha</h1>
          <p className="text-gray-600 text-sm">Gerenciar produção interna de insumos</p>
        </div>
      </div>

      {/* Ações */}
      <div className="bg-white border-b border-gray-200">
        <div className="p-4 max-w-7xl mx-auto flex gap-2">
          <Link
            href="/cozinha/nova"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 font-medium text-sm"
          >
            <Plus size={18} /> Nova Ordem Interna
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border-b border-gray-200">
        <div className="p-4 max-w-7xl mx-auto flex gap-2">
          {Object.entries(STATUS_INFO).map(([status, info]) => (
            <button
              key={status}
              onClick={() => setFiltroStatus(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filtroStatus === status
                  ? info.color
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {info.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Ordens */}
      <div className="max-w-7xl mx-auto p-4">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : ordensFilter.length === 0 ? (
          <div className="bg-white rounded-lg p-12 text-center border border-gray-200">
            <AlertCircle size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-600">Nenhuma ordem encontrada</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ordensFilter.map((ordem) => (
              <div key={ordem.id} className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-xs text-gray-400 font-mono">#{ordem.numero_ordem}</p>
                    <p className="font-semibold text-gray-800 text-sm mt-1">{ordem.produto?.nome}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded ${STATUS_INFO[ordem.status as keyof typeof STATUS_INFO]?.color || 'bg-gray-100'}`}>
                    {STATUS_INFO[ordem.status as keyof typeof STATUS_INFO]?.label || ordem.status}
                  </span>
                </div>

                <div className="space-y-2 mb-4 pb-4 border-b border-gray-100">
                  <p className="text-sm text-gray-600">
                    <strong>{ordem.quantidade}</strong> {ordem.produto?.unidade_medida || 'unid'}
                  </p>
                  {ordem.observacao && (
                    <p className="text-xs text-gray-500 italic">"{ordem.observacao}"</p>
                  )}
                </div>

                {ordem.status === 'pendente' && (
                  <button
                    onClick={() => atualizarStatus(ordem.id, 'concluida')}
                    className="w-full bg-green-600 text-white rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 hover:bg-green-700"
                  >
                    <Check size={16} /> Marcar como Concluída
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CozinhaPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'gerente_cozinha']}>
      <CozinhaContent />
    </ProtectedRoute>
  )
}
