'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import { Plus, Play, Filter, ChevronRight, AlertCircle } from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import OluquinhasLogo from '@/components/OluquinhasLogo'

const STATUS_INFO = {
  pendente: { label: 'Pendente', color: 'bg-amber-100 text-amber-700 border-amber-300', bgContent: 'bg-amber-50' },
  em_producao: { label: 'Em Produção', color: 'bg-blue-100 text-blue-700 border-blue-300', bgContent: 'bg-blue-50' },
  concluida: { label: 'Concluída', color: 'bg-green-100 text-green-700 border-green-300', bgContent: 'bg-green-50' },
}

function ProducaoContent() {
  const { usuario } = useAuth()
  const isAdmin = usuario?.role === 'admin'
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

  const isAtrasada = (dataEntrega: string) => dataEntrega && dataEntrega < new Date().toISOString().split('T')[0]

  const KanbanCard = ({ ordem }: { ordem: any }) => (
    <div className={`bg-white rounded-lg p-4 shadow-sm border-l-4 transition-all hover:shadow-md ${
      abaAtiva === 'pendente' && isAtrasada(ordem.data_entrega)
        ? 'border-l-red-500 border border-red-200'
        : 'border-l-gray-300 border border-gray-200'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <p className="text-xs text-gray-500 font-mono">Ordem #{ordem.numero_ordem}</p>
          <p className="font-bold text-gray-800 mt-1">{ordem.produto?.nome}</p>
        </div>
        {isAtrasada(ordem.data_entrega) && abaAtiva !== 'concluida' && (
          <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-semibold">⚠️ Atrasada</span>
        )}
      </div>

      <div className="space-y-1 mb-4 pb-3 border-b border-gray-100 text-sm">
        <p className="text-gray-700">
          <strong className="text-gray-800">{ordem.quantidade}</strong> un. · <span className="font-medium">{LOCAL_LABEL[ordem.loja_destino]}</span>
        </p>
        {ordem.data_entrega && (
          <p className={`text-xs ${isAtrasada(ordem.data_entrega) ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
            📅 {new Date(ordem.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
          </p>
        )}
        {ordem.observacao && (
          <p className="text-xs text-gray-600 italic">💬 {ordem.observacao}</p>
        )}
      </div>

      {!isAdmin && abaAtiva === 'pendente' && (
        <button
          onClick={async () => {
            await atualizarStatus(ordem.id, 'em_producao')
            window.open(`/producao/imprimir/${ordem.id}`, '_blank')
          }}
          className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 shadow-sm"
        >
          <Play size={16} /> Iniciar Produção
        </button>
      )}

      {!isAdmin && abaAtiva === 'em_producao' && (
        <div className="flex flex-col gap-2">
          <Link
            href={`/producao/novo-lote?ordem=${ordem.id}&produto=${ordem.produto_id}&destino=${ordem.loja_destino}`}
            className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold text-center hover:bg-green-700 shadow-sm flex items-center justify-center gap-2"
          >
            ✓ Registrar Produção
          </Link>
          <div className="flex gap-2">
            <button
              onClick={() => atualizarStatus(ordem.id, 'pendente')}
              className="flex-1 bg-amber-100 text-amber-700 rounded-lg py-2 text-sm font-medium hover:bg-amber-200"
            >
              ⏳ Reagendar
            </button>
            <button
              onClick={() => atualizarStatus(ordem.id, 'cancelada')}
              className="flex-1 bg-red-100 text-red-700 rounded-lg py-2 text-sm font-medium hover:bg-red-200"
            >
              ✕ Cancelar
            </button>
          </div>
        </div>
      )}

      {!isAdmin && abaAtiva === 'concluida' && (
        <p className="text-xs text-green-600 font-semibold text-center py-2">✓ Ordem Concluída</p>
      )}
    </div>
  )

  // Calcular estatísticas
  const statsTotal = {
    pendente: ordens.filter(o => o.status === 'pendente').length,
    em_producao: ordens.filter(o => o.status === 'em_producao').length,
    concluida: ordens.filter(o => o.status === 'concluida').length,
  }
  const ordensAtrasadas = ordens.filter(o => o.data_entrega && o.data_entrega < new Date().toISOString().split('T')[0] && o.status !== 'concluida').length

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 sticky top-0 z-40 shadow-md flex items-center justify-between h-20">
        <div className="flex items-center gap-4">
          <OluquinhasLogo size="md" variant="oluquinhas" color="branco" />
          <OluquinhasLogo size="xs" variant="rosto" color="branco" />
          <div>
            <h1 className="text-xl font-bold text-white">Produção</h1>
            <p className="text-xs text-orange-100">Painel de produção da Cozinha</p>
          </div>
        </div>
        {!isAdmin && (
          <Link href="/producao/ordem-interna" className="bg-white text-orange-600 rounded-lg px-4 py-2 font-semibold flex items-center gap-2 hover:bg-orange-50 shadow-md">
            <Plus size={18} /> Ordem Interna
          </Link>
        )}
      </div>

      <div className="p-4 max-w-7xl mx-auto">
        {/* Cards de Estatísticas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-500 font-semibold">Pendentes</p>
            <p className="text-2xl font-bold text-amber-600 mt-2">{statsTotal.pendente}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-500 font-semibold">Em Produção</p>
            <p className="text-2xl font-bold text-blue-600 mt-2">{statsTotal.em_producao}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-500 font-semibold">Concluídas</p>
            <p className="text-2xl font-bold text-green-600 mt-2">{statsTotal.concluida}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-500 font-semibold">Atrasadas</p>
            <p className="text-2xl font-bold text-red-600 mt-2">{ordensAtrasadas}</p>
          </div>
        </div>

        {/* Alerta de Atrasadas */}
        {ordensAtrasadas > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-700">⚠️ {ordensAtrasadas} Ordem(ns) Atrasada(s)</p>
              <p className="text-sm text-red-600 mt-1">Existem ordens com data de entrega vencida que não foram concluídas</p>
            </div>
          </div>
        )}

        {/* Filtro e Abas */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <Filter size={18} /> Filtrar por Loja
            </h2>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'todas', label: 'Todas' },
              { id: 'loja1', label: 'Paraisópolis' },
              { id: 'loja2', label: 'Itajubá' },
              { id: 'cozinha', label: '🍳 Cozinha (Internas)' },
            ].map(loja => (
              <button
                key={loja.id}
                onClick={() => setLojaFiltro(loja.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  lojaFiltro === loja.id
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {loja.label}
              </button>
            ))}
          </div>
        </div>

        {/* Abas de Status */}
        <div className="mb-6">
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(STATUS_INFO) as Array<keyof typeof STATUS_INFO>).map(status => (
              <button
                key={status}
                onClick={() => setAbaAtiva(status)}
                className={`px-4 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                  abaAtiva === status
                    ? `${STATUS_INFO[status].color} shadow-md`
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                }`}
              >
                {status === 'pendente' && '⏳'}
                {status === 'em_producao' && '🔄'}
                {status === 'concluida' && '✅'}
                <span>
                  {STATUS_INFO[status].label}
                  <span className="ml-2 text-xs opacity-75">({ordens.filter(o => o.status === status).length})</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Ordens Kanban */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando ordens...</div>
        ) : (
          <div className={`rounded-xl p-6 ${STATUS_INFO[abaAtiva].bgContent}`}>
            {ordensAba.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-lg">Nenhuma ordem {STATUS_INFO[abaAtiva].label.toLowerCase()}</p>
                <p className="text-gray-400 text-sm mt-2">Filtro: {lojaFiltro === 'todas' ? 'Todas as lojas' : lojaFiltro === 'cozinha' ? 'Cozinha (Internas)' : LOCAL_LABEL[lojaFiltro as keyof typeof LOCAL_LABEL]}</p>
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
    </div>
  )
}

export default function ProducaoPage() {
  return (
    <ProtectedRoute allowedRoles={['cozinha', 'admin']}>
      <ProducaoContent />
    </ProtectedRoute>
  )
}
