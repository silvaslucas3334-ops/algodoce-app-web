'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { AlertTriangle, Package, Truck, TrendingUp, Settings } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'
import { LOCAL_LABEL } from '@/lib/constants'

function DashboardContent() {
  const router = useRouter()
  const { usuario, carregando } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>({})
  const [ordens, setOrdens] = useState<any[]>([])
  const [lojaFiltro, setLojaFiltro] = useState<string>('todas')

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

        // Para COZINHA
        if (usuario?.role === 'cozinha') {
          const { data: ordensData } = await supabase
            .from('ordens_producao')
            .select('*, produto:produtos(nome)')
            .in('status', ['pendente', 'em_producao'])
            .order('data_entrega')
            .limit(10)
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

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Carregando...</div>
  }

  // Mostrar carregamento
  if (!usuario) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-pink-50 to-white">
        <div className="text-center">
          <p className="text-gray-400 mb-2">{carregando ? 'Carregando...' : 'Você precisa fazer login'}</p>
        </div>
      </div>
    )
  }

  // LAYOUT PARA LOJA
  if (usuario?.role === 'loja') {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-6 pt-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{LOCAL_LABEL[usuario?.loja_id || 'loja1']}</h1>
            <p className="text-xs text-gray-500 mt-1">Gestão de Estoque</p>
          </div>
          <div className="text-right text-sm text-gray-500">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
          </div>
        </div>

        {/* ATALHOS */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <Link href="/ordens/nova" className="bg-gray-900 text-white rounded-lg p-3 text-center hover:bg-gray-800 transition-colors">
            <p className="text-lg">📋</p>
            <p className="text-xs font-semibold mt-1">Criar<br/>Ordem</p>
          </Link>
          <Link href="/estoque" className="bg-gray-700 text-white rounded-lg p-3 text-center hover:bg-gray-600 transition-colors">
            <p className="text-lg">📉</p>
            <p className="text-xs font-semibold mt-1">Baixar<br/>Estoque</p>
          </Link>
          <Link href="/estoque" className="bg-gray-600 text-white rounded-lg p-3 text-center hover:bg-gray-500 transition-colors">
            <p className="text-lg">📥</p>
            <p className="text-xs font-semibold mt-1">Receber<br/>Pendente</p>
          </Link>
        </div>

        {/* ALERTA DE LOTES PENDENTES */}
        {stats.lotesPendentes > 0 && (
          <Link href="/estoque" className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 mb-6 block hover:bg-blue-100 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-900">📥 Lotes Pendentes de Recebimento</p>
                <p className="text-xs text-blue-700 mt-1">{stats.lotesPendentes} etiqueta{stats.lotesPendentes !== 1 ? 's' : ''} aguardando confirmação</p>
              </div>
              <p className="text-3xl font-bold text-blue-600">{stats.lotesPendentes}</p>
            </div>
          </Link>
        )}

        {/* RESUMO */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-400 mb-1">Itens no Estoque</p>
            <p className="text-3xl font-bold text-gray-900">{stats.totalEstoque}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-400 mb-1">Próximos do Vencimento</p>
            <p className="text-3xl font-bold text-gray-900">{stats.vencendo}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-400 mb-1">Ordens Solicitadas</p>
            <p className="text-3xl font-bold text-gray-900">{stats.ordensSolicitadas}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-400 mb-1">Em Produção</p>
            <p className="text-3xl font-bold text-gray-900">{stats.ordensProducao}</p>
          </div>
        </div>
      </div>
    )
  }

  // LAYOUT PARA COZINHA
  if (usuario?.role === 'cozinha') {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-6 pt-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Cozinha</h1>
            <p className="text-xs text-gray-500 mt-1">Gestão de Produção</p>
          </div>
          <div className="text-right text-sm text-gray-500">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
          </div>
        </div>

        {/* ATALHOS */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Link href="/ordens" className="bg-gray-800 text-white rounded-lg p-4 text-center hover:bg-gray-700 transition-colors">
            <p className="text-2xl mb-1">⏳</p>
            <p className="text-sm font-semibold">Ordens Pendentes</p>
          </Link>
          <Link href="/estoque" className="bg-gray-700 text-white rounded-lg p-4 text-center hover:bg-gray-600 transition-colors">
            <p className="text-2xl mb-1">🚚</p>
            <p className="text-sm font-semibold">Criar Envio</p>
          </Link>
          <Link href="/producao/reimprimir" className="bg-gray-600 text-white rounded-lg p-4 text-center hover:bg-gray-500 transition-colors">
            <p className="text-2xl mb-1">🖨️</p>
            <p className="text-sm font-semibold">Reimprimir</p>
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
          </div>
        </div>

        {/* PAINEL GERENCIAL DE ORDENS POR DATA */}
        {(() => {
          const ordensFiltradas = lojaFiltro === 'todas'
            ? ordens
            : ordens.filter(o => o.loja_destino === lojaFiltro)

          return ordensFiltradas.length > 0 ? (
          <div className="space-y-3">
            {(() => {
              const ordensPorData = ordensFiltradas.reduce((acc, ordem) => {
                const data = ordem.data_entrega
                if (!acc[data]) acc[data] = []
                acc[data].push(ordem)
                return acc
              }, {} as Record<string, any[]>)

              const datas = Object.keys(ordensPorData).sort()
              const hoje = new Date().toISOString().split('T')[0]

              return datas.map(data => {
                const dataObj = new Date(data + 'T00:00:00')
                const diasAteEntrega = Math.floor((dataObj.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                const isHoje = data === hoje
                const isAtrasado = diasAteEntrega < 0
                const isUrgente = diasAteEntrega === 0

                let bgColor = 'bg-white border-gray-200'
                let headerColor = 'bg-gray-50'
                let badgeColor = 'bg-gray-100 text-gray-700'

                if (isAtrasado) {
                  bgColor = 'bg-red-50 border-red-200'
                  headerColor = 'bg-red-100'
                  badgeColor = 'bg-red-200 text-red-700'
                } else if (isUrgente) {
                  bgColor = 'bg-orange-50 border-orange-200'
                  headerColor = 'bg-orange-100'
                  badgeColor = 'bg-orange-200 text-orange-700'
                } else if (diasAteEntrega === 1) {
                  bgColor = 'bg-yellow-50 border-yellow-200'
                  headerColor = 'bg-yellow-100'
                  badgeColor = 'bg-yellow-200 text-yellow-700'
                }

                return (
                  <div key={data} className={`${bgColor} rounded-lg border overflow-hidden`}>
                    <div className={`${headerColor} px-4 py-3`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-800">
                            {isAtrasado && '⚠️ ATRASADO - '}
                            {isUrgente && '🔴 HOJE - '}
                            {isHoje ? 'Hoje' : dataObj.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {ordensPorData[data].length} ordem(ns) • {ordensPorData[data].reduce((sum: number, o: any) => sum + o.quantidade, 0)} itens
                          </p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded ${badgeColor}`}>
                          {diasAteEntrega < 0 ? `${Math.abs(diasAteEntrega)}d atrasado` : `${diasAteEntrega}d`}
                        </span>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {ordensPorData[data].map(ordem => (
                        <div key={ordem.id} className="p-3">
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex-1">
                              <p className="font-medium text-gray-800 text-sm">{ordem.produto?.nome}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{ordem.quantidade} un • {LOCAL_LABEL[ordem.loja_destino]}</p>
                            </div>
                            <span className={`text-xs font-semibold px-2 py-1 rounded ${ordem.status === 'pendente' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                              {ordem.status === 'pendente' ? 'Pendente' : 'Em Produção'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
              <p className="text-sm">Nenhuma ordem pendente ou em produção</p>
            </div>
          )
        })()}
      </div>
    )
  }

  // LAYOUT PARA ADMIN
  if (usuario?.role === 'admin') {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-6 pt-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Administração</h1>
            <p className="text-xs text-gray-500 mt-1">Gestão de Sistema</p>
          </div>
          <div className="text-right text-sm text-gray-500">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
          </div>
        </div>

        {/* ATALHOS */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/admin" className="bg-gray-800 text-white rounded-lg p-4 text-center hover:bg-gray-700 transition-colors">
            <p className="text-2xl mb-2">⚙️</p>
            <p className="text-sm font-semibold">Gerenciar Produtos</p>
            <p className="text-xs text-gray-300 mt-1">Adicionar, editar e remover</p>
          </Link>
          <Link href="/admin" className="bg-gray-700 text-white rounded-lg p-4 text-center hover:bg-gray-600 transition-colors">
            <p className="text-2xl mb-2">👥</p>
            <p className="text-sm font-semibold">Usuários & Permissões</p>
            <p className="text-xs text-gray-300 mt-1">Gerenciar acesso</p>
          </Link>
          <Link href="/admin" className="bg-gray-700 text-white rounded-lg p-4 text-center hover:bg-gray-600 transition-colors">
            <p className="text-2xl mb-2">📊</p>
            <p className="text-sm font-semibold">Relatórios</p>
            <p className="text-xs text-gray-300 mt-1">Análise de dados</p>
          </Link>
          <Link href="/admin" className="bg-gray-800 text-white rounded-lg p-4 text-center hover:bg-gray-700 transition-colors">
            <p className="text-2xl mb-2">🔧</p>
            <p className="text-sm font-semibold">Configurações</p>
            <p className="text-xs text-gray-300 mt-1">Sistema</p>
          </Link>
        </div>
      </div>
    )
  }

  return null
}

export default function Dashboard() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  )
}
