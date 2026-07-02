'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { AlertTriangle, Package, Truck, TrendingUp, Settings, Plus } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'
import { LOCAL_LABEL } from '@/lib/constants'
import { useRealtimeData } from '@/hooks/useRealtimeData'

function DashboardContent() {
  const router = useRouter()
  const { usuario, carregando } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>({})
  const [ordens, setOrdens] = useState<any[]>([])
  const [lojaFiltro, setLojaFiltro] = useState<string>('todas')
  const [statusFiltro, setStatusFiltro] = useState<string>('pendente')

  // Redirecionar para login se não há usuário
  useEffect(() => {
    if (!carregando && !usuario) {
      router.replace('/login')
    }
  }, [carregando, usuario, router])

  useEffect(() => {
    if (!usuario) return

    async function carregar() {

      const hoje = new Date().toISOString().split('T')[0]
      const em7dias = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

      try {
        // Para LOJA
        if (usuario?.role === 'loja' && usuario?.loja_id) {
          const [{ count: totalEstoque }, { count: vencendo }, { count: ordensSolicitadas }, { count: ordensProducao }, { count: lotesPendentes }] = await Promise.all([
            supabase.from('lotes_producao').select('id', { count: 'exact', head: true })
              .eq('destino', usuario.loja_id)
              .eq('status', 'na_loja'),
            supabase.from('lotes_producao').select('id', { count: 'exact', head: true })
              .eq('destino', usuario.loja_id)
              .lte('data_validade', em7dias)
              .gte('data_validade', hoje)
              .in('status', ['na_loja', 'na_cozinha']),
            supabase.from('ordens_producao').select('id', { count: 'exact', head: true })
              .eq('loja_destino', usuario.loja_id)
              .eq('status', 'pendente'),
            supabase.from('ordens_producao').select('id', { count: 'exact', head: true })
              .eq('loja_destino', usuario.loja_id)
              .eq('status', 'em_producao'),
            supabase.from('lotes_producao').select('id', { count: 'exact', head: true })
              .eq('destino', usuario.loja_id)
              .eq('status', 'enviado'),
          ])
          setStats({
            totalEstoque: totalEstoque || 0,
            vencendo: vencendo || 0,
            ordensSolicitadas: ordensSolicitadas || 0,
            ordensProducao: ordensProducao || 0,
            lotesPendentes: lotesPendentes || 0,
          })
        }

        // Para COZINHA - Carregar todas as ordens
        if (usuario?.role === 'cozinha' || usuario?.role === 'admin') {
          const { data: ordensData } = await supabase
            .from('ordens_producao')
            .select('*, produto:produtos(nome)')
            .order('data_entrega')
          setOrdens(ordensData || [])
        }

        setLoading(false)
      } catch (err) {
        console.error('Erro ao carregar dashboard:', err)
        setLoading(false)
      }
    }
    carregar()
  }, [usuario?.role, usuario?.loja_id])

  // Real-time listeners
  useRealtimeData({
    table: 'lotes_producao',
    onInsert: () => {
      if (usuario?.role === 'loja' || usuario?.role === 'cozinha') {
        const event = new Event('refetch-dashboard')
        window.dispatchEvent(event)
      }
    },
    onUpdate: () => {
      if (usuario?.role === 'loja' || usuario?.role === 'cozinha') {
        const event = new Event('refetch-dashboard')
        window.dispatchEvent(event)
      }
    },
    onDelete: () => {
      if (usuario?.role === 'loja' || usuario?.role === 'cozinha') {
        const event = new Event('refetch-dashboard')
        window.dispatchEvent(event)
      }
    }
  })

  useRealtimeData({
    table: 'ordens_producao',
    onInsert: () => {
      if (usuario?.role === 'loja' || usuario?.role === 'cozinha') {
        const event = new Event('refetch-dashboard')
        window.dispatchEvent(event)
      }
    },
    onUpdate: () => {
      if (usuario?.role === 'loja' || usuario?.role === 'cozinha') {
        const event = new Event('refetch-dashboard')
        window.dispatchEvent(event)
      }
    }
  })

  // Listen para refetch events
  useEffect(() => {
    const handleRefetch = () => {
      if (usuario) {
        const hoje = new Date().toISOString().split('T')[0]
        const em7dias = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

        if (usuario?.role === 'loja' && usuario?.loja_id) {
          Promise.all([
            supabase.from('lotes_producao').select('id', { count: 'exact', head: true })
              .eq('destino', usuario.loja_id)
              .eq('status', 'na_loja'),
            supabase.from('lotes_producao').select('id', { count: 'exact', head: true })
              .eq('destino', usuario.loja_id)
              .lte('data_validade', em7dias)
              .gte('data_validade', hoje)
              .in('status', ['na_loja', 'na_cozinha']),
            supabase.from('ordens_producao').select('id', { count: 'exact', head: true })
              .eq('loja_destino', usuario.loja_id)
              .eq('status', 'pendente'),
            supabase.from('ordens_producao').select('id', { count: 'exact', head: true })
              .eq('loja_destino', usuario.loja_id)
              .eq('status', 'em_producao'),
            supabase.from('lotes_producao').select('id', { count: 'exact', head: true })
              .eq('destino', usuario.loja_id)
              .eq('status', 'enviado'),
          ]).then(([e1, e2, e3, e4, e5]) => {
            setStats({
              totalEstoque: e1.count || 0,
              vencendo: e2.count || 0,
              ordensSolicitadas: e3.count || 0,
              ordensProducao: e4.count || 0,
              lotesPendentes: e5.count || 0,
            })
          })
        }

        if (usuario?.role === 'cozinha' || usuario?.role === 'admin') {
          supabase.from('ordens_producao')
            .select('*, produto:produtos(nome)')
            .order('data_entrega')
            .then(({ data }) => setOrdens(data || []))
        }
      }
    }

    window.addEventListener('refetch-dashboard', handleRefetch)
    return () => window.removeEventListener('refetch-dashboard', handleRefetch)
  }, [usuario?.role, usuario?.loja_id])

  if (loading) {
    return <div className="p-4 text-center text-gray-400">Carregando...</div>
  }

  // RENDER PARA COZINHA
  if (usuario?.role === 'cozinha' || usuario?.role === 'admin') {
    const hoje = new Date().toISOString().split('T')[0]
    const amanha = new Date(Date.now() + 86400000).toISOString().split('T')[0]

    // Filtrar por status e destino
    const ordensFiltradasPorStatus = ordens.filter(o => o.status === statusFiltro)
    const ordensFiltradasPorDestino = lojaFiltro === 'todas'
      ? ordensFiltradasPorStatus
      : ordensFiltradasPorStatus.filter(o => o.loja_destino === lojaFiltro)

    const ordensAgrupadas = {
      atrasadas: ordensFiltradasPorDestino.filter(o => o.data_entrega < hoje),
      hoje: ordensFiltradasPorDestino.filter(o => o.data_entrega === hoje),
      amanha: ordensFiltradasPorDestino.filter(o => o.data_entrega === amanha),
      proximos: ordensFiltradasPorDestino.filter(o => o.data_entrega > amanha && o.data_entrega <= new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]),
    }

    const statusLabel = (status: string) => {
      const labels: Record<string, string> = {
        pendente: 'Pendente',
        em_producao: 'Em Produção',
        concluida: 'Concluída',
      }
      return labels[status] || status
    }

    const statusColor = (status: string) => {
      const colors: Record<string, string> = {
        pendente: 'bg-amber-100 text-amber-700',
        em_producao: 'bg-blue-100 text-blue-700',
        concluida: 'bg-green-100 text-green-700',
      }
      return colors[status] || 'bg-gray-100 text-gray-700'
    }

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4">
          <h1 className="text-2xl font-bold text-gray-800">Produção</h1>
          <p className="text-sm text-gray-600">Cronograma de ordens</p>
        </div>

        {/* Atalhos */}
        <div className="p-4 max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Link href="/producao" className="bg-white border border-gray-200 text-gray-800 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition-all">
              <p className="text-2xl mb-2">⏳</p>
              <p className="font-medium text-sm">Ordens Pendentes</p>
            </Link>
            <Link href="/producao/ordem-interna" className="bg-white border border-gray-200 text-gray-800 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition-all">
              <p className="text-2xl mb-2">➕</p>
              <p className="font-medium text-sm">Criar Ordem Interna</p>
            </Link>
            <Link href="/producao/novo-lote" className="bg-white border border-gray-200 text-gray-800 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition-all">
              <p className="text-2xl mb-2">📦</p>
              <p className="font-medium text-sm">Criar Envio</p>
            </Link>
            <Link href="/producao/reimprimir" className="bg-white border border-gray-200 text-gray-800 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition-all">
              <p className="text-2xl mb-2">🖨️</p>
              <p className="font-medium text-sm">Reimprimir</p>
            </Link>
          </div>
        </div>

        {/* Filtros */}
        <div className="p-4 max-w-6xl mx-auto mb-4">
          <div className="flex flex-col gap-4">
            {/* Filtro por Destino */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Filtrar por destino:</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setLojaFiltro('todas')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    lojaFiltro === 'todas'
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Todas
                </button>
                <button
                  onClick={() => setLojaFiltro('loja1')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    lojaFiltro === 'loja1'
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Paraisópolis
                </button>
                <button
                  onClick={() => setLojaFiltro('loja2')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    lojaFiltro === 'loja2'
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Itajubá
                </button>
                <button
                  onClick={() => setLojaFiltro('cozinha')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    lojaFiltro === 'cozinha'
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  🍳 Cozinha (Internas)
                </button>
              </div>
            </div>

            {/* Filtro por Status */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Filtrar por status:</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setStatusFiltro('pendente')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    statusFiltro === 'pendente'
                      ? 'bg-amber-100 text-amber-700 border-2 border-amber-300'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Pendente
                </button>
                <button
                  onClick={() => setStatusFiltro('em_producao')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    statusFiltro === 'em_producao'
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Em Produção
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="max-w-6xl mx-auto px-4 pb-6">
          {/* Atrasadas */}
          {ordensAgrupadas.atrasadas.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-8 bg-red-500 rounded-full"></div>
                <h2 className="text-lg font-bold text-gray-800">🔴 Atrasadas ({ordensAgrupadas.atrasadas.length})</h2>
              </div>
              <div className="space-y-2">
                {ordensAgrupadas.atrasadas.map((ordem) => (
                  <div key={ordem.id} className="bg-white border-l-4 border-red-500 rounded-lg p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{ordem.produto?.nome}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          <strong>{ordem.quantidade}</strong> un • {LOCAL_LABEL[ordem.loja_destino] || ordem.loja_destino}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Entrega: {new Date(ordem.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded ${statusColor(ordem.status)}`}>
                        {statusLabel(ordem.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hoje */}
          {ordensAgrupadas.hoje.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-8 bg-amber-500 rounded-full"></div>
                <h2 className="text-lg font-bold text-gray-800">🟡 Hoje ({ordensAgrupadas.hoje.length})</h2>
              </div>
              <div className="space-y-2">
                {ordensAgrupadas.hoje.map((ordem) => (
                  <div key={ordem.id} className="bg-white border-l-4 border-amber-500 rounded-lg p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{ordem.produto?.nome}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          <strong>{ordem.quantidade}</strong> un • {LOCAL_LABEL[ordem.loja_destino] || ordem.loja_destino}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded ${statusColor(ordem.status)}`}>
                        {statusLabel(ordem.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Amanhã */}
          {ordensAgrupadas.amanha.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-8 bg-green-500 rounded-full"></div>
                <h2 className="text-lg font-bold text-gray-800">🟢 Amanhã ({ordensAgrupadas.amanha.length})</h2>
              </div>
              <div className="space-y-2">
                {ordensAgrupadas.amanha.map((ordem) => (
                  <div key={ordem.id} className="bg-white border-l-4 border-green-500 rounded-lg p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{ordem.produto?.nome}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          <strong>{ordem.quantidade}</strong> un • {LOCAL_LABEL[ordem.loja_destino] || ordem.loja_destino}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded ${statusColor(ordem.status)}`}>
                        {statusLabel(ordem.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Próximos */}
          {ordensAgrupadas.proximos.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-8 bg-blue-500 rounded-full"></div>
                <h2 className="text-lg font-bold text-gray-800">🔵 Próximos dias ({ordensAgrupadas.proximos.length})</h2>
              </div>
              <div className="space-y-2">
                {ordensAgrupadas.proximos.map((ordem) => (
                  <div key={ordem.id} className="bg-white border-l-4 border-blue-500 rounded-lg p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{ordem.produto?.nome}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          <strong>{ordem.quantidade}</strong> un • {LOCAL_LABEL[ordem.loja_destino] || ordem.loja_destino}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Entrega: {new Date(ordem.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded ${statusColor(ordem.status)}`}>
                        {statusLabel(ordem.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ordens.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">Nenhuma ordem encontrada</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // RENDER PARA LOJA
  return (
    <div className="p-4">
      <div className="flex items-center justify-between pt-4 mb-6">
        <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-lg p-4 border border-gray-100">
          <p className="text-xs text-gray-600 font-semibold">Estoque</p>
          <p className="text-2xl font-bold text-gray-800 mt-2">{stats.totalEstoque || 0}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-100">
          <p className="text-xs text-gray-600 font-semibold">Vencendo</p>
          <p className="text-2xl font-bold text-orange-600 mt-2">{stats.vencendo || 0}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-100">
          <p className="text-xs text-gray-600 font-semibold">Solicitadas</p>
          <p className="text-2xl font-bold text-blue-600 mt-2">{stats.ordensSolicitadas || 0}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-100">
          <p className="text-xs text-gray-600 font-semibold">Em Produção</p>
          <p className="text-2xl font-bold text-purple-600 mt-2">{stats.ordensProducao || 0}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-100">
          <p className="text-xs text-gray-600 font-semibold">Pendentes</p>
          <p className="text-2xl font-bold text-green-600 mt-2">{stats.lotesPendentes || 0}</p>
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  )
}
