'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import Link from 'next/link'
import { Plus, Play } from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'

const STATUS_INFO = {
  pendente: { label: 'Pendente', color: 'bg-amber-100 text-amber-700 border-amber-300', bgContent: 'bg-amber-50' },
  em_producao: { label: 'Em Produção', color: 'bg-blue-100 text-blue-700 border-blue-300', bgContent: 'bg-blue-50' },
  concluida: { label: 'Concluída', color: 'bg-green-100 text-green-700 border-green-300', bgContent: 'bg-green-50' },
}

function ProducaoContent() {
  const [abaAtiva, setAbaAtiva] = useState<'pendente' | 'em_producao' | 'concluida'>('pendente')
  const [ordens, setOrdens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [lojaFiltro, setLojaFiltro] = useState<string>('todas')

  useEffect(() => {
    carregarOrdens()

    const channel = supabase
      .channel('ordens-producao-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_producao' }, carregarOrdens)
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [])

  async function carregarOrdens() {
    setLoading(true)
    const { data } = await supabase
      .from('ordens_producao')
      .select('*, produto:produtos(nome)')
      .in('status', ['pendente', 'em_producao', 'concluida'])
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

  const ordensAba = ordens.filter(o => {
    const statusMatch = o.status === abaAtiva
    if (lojaFiltro === 'cozinha') {
      return statusMatch && o.tipo_ordem === 'interna'
    }
    return statusMatch && (lojaFiltro === 'todas' || o.loja_destino === lojaFiltro)
  })

  const KanbanCard = ({ ordem }: { ordem: any }) => (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <p className="text-xs text-gray-400 font-mono">Ordem #{ordem.numero_ordem}</p>
          <p className="font-semibold text-gray-800 text-sm mt-1">{ordem.produto?.nome}</p>
        </div>
      </div>

      <div className="space-y-1 mb-4 pb-4 border-b border-gray-100">
        <p className="text-sm text-gray-600">
          <strong>{ordem.quantidade}</strong> unidades · {LOCAL_LABEL[ordem.loja_destino]}
        </p>
        {ordem.data_entrega && (
          <p className="text-xs text-gray-400">
            Entrega: {new Date(ordem.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
          </p>
        )}
        {ordem.observacao && (
          <p className="text-xs text-gray-500 italic">"{ordem.observacao}"</p>
        )}
      </div>

      {abaAtiva === 'pendente' && (
        <button
          onClick={async () => {
            await atualizarStatus(ordem.id, 'em_producao')
            window.open(`/producao/imprimir/${ordem.id}`, '_blank')
          }}
          className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 hover:bg-blue-700"
        >
          <Play size={16} /> Iniciar Produção
        </button>
      )}

      {abaAtiva === 'em_producao' && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/producao/novo-lote?ordem=${ordem.id}&produto=${ordem.produto_id}&destino=${ordem.loja_destino}`}
            className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium text-center hover:bg-green-700"
          >
            ✓ Registrar Produção
          </Link>
          <button
            onClick={() => atualizarStatus(ordem.id, 'pendente')}
            className="flex-1 bg-amber-100 text-amber-700 rounded-lg py-2 text-sm font-medium hover:bg-amber-200"
          >
            Reagendar
          </button>
        </div>
      )}

      {abaAtiva === 'em_producao' && (
        <button
          onClick={() => atualizarStatus(ordem.id, 'cancelada')}
          className="w-full bg-gray-100 text-gray-500 rounded-lg py-1.5 text-xs mt-2 hover:bg-gray-200"
        >
          Cancelar ordem
        </button>
      )}
    </div>
  )

  return (
    <div className="p-4">
      <div className="flex items-center justify-between pt-4 mb-6">
        <h1 className="text-xl font-bold text-gray-800">Produção</h1>
        <Link href="/producao/ordem-interna" className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm flex items-center gap-1 hover:bg-blue-700">
          <Plus size={16} /> Ordem Interna
        </Link>
      </div>

      {/* FILTRO POR LOJA */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <p className="text-xs font-semibold text-gray-600 mb-3">Filtrar por loja:</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setLojaFiltro('todas')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              lojaFiltro === 'todas'
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Todas
          </button>
          <button
            onClick={() => setLojaFiltro('loja1')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              lojaFiltro === 'loja1'
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Paraisópolis
          </button>
          <button
            onClick={() => setLojaFiltro('loja2')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              lojaFiltro === 'loja2'
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Itajubá
          </button>
          <button
            onClick={() => setLojaFiltro('cozinha')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              lojaFiltro === 'cozinha'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            🍳 Cozinha (Internas)
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200 flex-wrap sm:flex-nowrap">
        {(Object.keys(STATUS_INFO) as Array<keyof typeof STATUS_INFO>).map(status => (
          <button
            key={status}
            onClick={() => setAbaAtiva(status)}
            className={`px-2 sm:px-4 py-3 font-medium rounded-t-lg border-b-2 transition-all text-xs sm:text-base ${
              abaAtiva === status
                ? `${STATUS_INFO[status as keyof typeof STATUS_INFO].color} border-b-2`
                : 'text-gray-500 border-b-2 border-transparent hover:text-gray-700'
            }`}
          >
            <span className="flex items-center gap-2">
              {status === 'pendente' && '⏳'}
              {status === 'em_producao' && '🔄'}
              {status === 'concluida' && '✅'}
              <span>
                {STATUS_INFO[status].label}
                <span className="ml-2 text-xs opacity-70">({ordens.filter(o => o.status === status).length})</span>
              </span>
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : (
        <div className={`rounded-xl p-6 ${STATUS_INFO[abaAtiva].bgContent}`}>
          {ordensAba.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg">Nenhuma ordem {STATUS_INFO[abaAtiva].label.toLowerCase()}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ordensAba.map((ordem: any) => (
                <KanbanCard key={ordem.id} ordem={ordem} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ProducaoPage() {
  return (
    <ProtectedRoute allowedRoles={['cozinha']}>
      <ProducaoContent />
    </ProtectedRoute>
  )
}
