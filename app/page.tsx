'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { AlertTriangle, Package, Truck, TrendingUp, Settings, Plus, Clock, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'
import { LOCAL_LABEL } from '@/lib/constants'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import OluquinhasLogo from '@/components/OluquinhasLogo'

function DashboardContent() {
  const router = useRouter()
  const { usuario, carregando } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>({})
  const [ordens, setOrdens] = useState<any[]>([])
  const [tarefas, setTarefas] = useState<any[]>([])
  const [recebimentos, setRecebimentos] = useState<any[]>([])
  const [tarefasCozinha, setTarefasCozinha] = useState<any[]>([])
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
          const [{ count: totalEstoque }, { count: vencendo }, { count: ordensSolicitadas }, { count: ordensProducao }, { count: lotesPendentes }, { data: tarefasData }, { data: recebimentosData }] = await Promise.all([
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
            supabase.from('tarefas').select('*')
              .eq('setor_id', usuario.setor_id)
              .in('status', ['pendente', 'em_andamento']),
            supabase.from('romaneios').select('*')
              .eq('status', 'confirmado')
              .eq('unidade_destino', usuario.loja_id)
              .in('tipo', ['envio', 'transferencia']),
          ])
          setStats({
            totalEstoque: totalEstoque || 0,
            vencendo: vencendo || 0,
            ordensSolicitadas: ordensSolicitadas || 0,
            ordensProducao: ordensProducao || 0,
            lotesPendentes: lotesPendentes || 0,
          })
          setTarefas(tarefasData || [])
          setRecebimentos(recebimentosData || [])
        }

        // Para COZINHA - Carregar todas as ordens e tarefas
        if (usuario?.role === 'cozinha' || usuario?.role === 'admin') {
          const [{ data: ordensData }, { data: tarefasData }] = await Promise.all([
            supabase
              .from('ordens_producao')
              .select('*, produto:produtos(nome)')
              .order('data_entrega'),
            supabase
              .from('tarefas')
              .select('*')
              .eq('setor_id', usuario.setor_id)
              .in('status', ['pendente', 'em_andamento']),
          ])
          setOrdens(ordensData || [])
          setTarefasCozinha(tarefasData || [])
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
            supabase.from('tarefas').select('*')
              .eq('setor_id', usuario.setor_id)
              .in('status', ['pendente', 'em_andamento']),
            supabase.from('romaneios').select('*')
              .eq('status', 'confirmado')
              .eq('unidade_destino', usuario.loja_id)
              .in('tipo', ['envio', 'transferencia']),
          ]).then(([e1, e2, e3, e4, e5, tarefasRes, recebimentosRes]) => {
            setStats({
              totalEstoque: e1.count || 0,
              vencendo: e2.count || 0,
              ordensSolicitadas: e3.count || 0,
              ordensProducao: e4.count || 0,
              lotesPendentes: e5.count || 0,
            })
            setTarefas(tarefasRes.data || [])
            setRecebimentos(recebimentosRes.data || [])
          })
        }

        if (usuario?.role === 'cozinha' || usuario?.role === 'admin') {
          Promise.all([
            supabase.from('ordens_producao')
              .select('*, produto:produtos(nome)')
              .order('data_entrega'),
            supabase.from('tarefas')
              .select('*')
              .eq('setor_id', usuario.setor_id)
              .in('status', ['pendente', 'em_andamento']),
          ]).then(([ordensRes, tarefasRes]) => {
            setOrdens(ordensRes.data || [])
            setTarefasCozinha(tarefasRes.data || [])
          })
        }
      }
    }

    window.addEventListener('refetch-dashboard', handleRefetch)
    return () => window.removeEventListener('refetch-dashboard', handleRefetch)
  }, [usuario?.role, usuario?.loja_id])

  if (loading) {
    return <div className="p-4 text-center text-gray-400">Carregando...</div>
  }

  // RENDER PARA ADMIN
  if (usuario?.role === 'admin') {
    const hoje = new Date().toISOString().split('T')[0]

    // Calcular tarefas
    const tarefasHoje = tarefasCozinha.filter(t => t.data_vencimento === hoje)
    const tarefasAtrasadas = tarefasCozinha.filter(t => t.data_vencimento < hoje && t.status !== 'concluida')

    // Calcular ordens
    const ordensAtrasadas = ordens.filter(o => o.data_entrega < hoje && o.status !== 'concluida')
    const ordensHoje = ordens.filter(o => o.data_entrega === hoje)
    const ordensEmProducao = ordens.filter(o => o.status === 'em_producao')
    const ordensAguardando = ordens.filter(o => o.status === 'pendente')

    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4 sticky top-0 z-40 shadow-md flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <OluquinhasLogo size="sm" variant="rosto" color="branco" />
            <div>
              <h1 className="text-2xl font-bold text-white">Gestão AlgoDoce</h1>
              <p className="text-sm text-blue-100 mt-1">Painel administrativo</p>
            </div>
          </div>
          <OluquinhasLogo size="lg" variant="oluquinhas" color="branco" />
        </div>

        <div className="p-4 max-w-2xl mx-auto">
          {/* Ações Rápidas */}
          <div className="mb-8">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Ações Rápidas</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Link href="/ordens" className="bg-gradient-to-br from-slate-500 to-slate-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
                <TrendingUp size={24} className="mb-2" />
                <p className="font-medium text-sm">Ordens</p>
              </Link>
              <Link href="/producao" className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
                <Clock size={24} className="mb-2" />
                <p className="font-medium text-sm">Produção</p>
              </Link>
              <Link href="/estoque" className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
                <Package size={24} className="mb-2" />
                <p className="font-medium text-sm">Estoque</p>
              </Link>
              <Link href="/expedicao" className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
                <Truck size={24} className="mb-2" />
                <p className="font-medium text-sm">Expedição</p>
              </Link>
              <Link href="/tarefas/dashboard" className="bg-gradient-to-br from-pink-500 to-pink-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
                <CheckCircle2 size={24} className="mb-2" />
                <p className="font-medium text-sm">Tarefas</p>
              </Link>
              <Link href="/admin" className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
                <Settings size={24} className="mb-2" />
                <p className="font-medium text-sm">Config</p>
              </Link>
            </div>
          </div>

          {/* Indicadores Críticos (Atrasados) */}
          {(ordensAtrasadas.length > 0 || tarefasAtrasadas.length > 0) && (
            <div className="mb-8 space-y-3">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Atenção Necessária</h2>

              {ordensAtrasadas.length > 0 && (
                <Link href="/producao" className="bg-red-50 border border-red-200 rounded-lg p-4 hover:bg-red-100 transition-all block">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-red-700 flex items-center gap-2">
                        <AlertCircle size={18} /> Ordens Atrasadas
                      </p>
                      <p className="text-sm text-red-600 mt-1">Ordens com entrega vencida</p>
                    </div>
                    <span className="bg-red-200 text-red-700 px-3 py-1 rounded-full text-sm font-bold">{ordensAtrasadas.length}</span>
                  </div>
                </Link>
              )}

              {tarefasAtrasadas.length > 0 && (
                <Link href="/tarefas/dashboard" className="bg-orange-50 border border-orange-200 rounded-lg p-4 hover:bg-orange-100 transition-all block">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-orange-700 flex items-center gap-2">
                        <AlertTriangle size={18} /> Tarefas Atrasadas
                      </p>
                      <p className="text-sm text-orange-600 mt-1">Tarefas vencidas</p>
                    </div>
                    <span className="bg-orange-200 text-orange-700 px-3 py-1 rounded-full text-sm font-bold">{tarefasAtrasadas.length}</span>
                  </div>
                </Link>
              )}
            </div>
          )}

          {/* Indicadores Gerais */}
          <div className="mb-8">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Situação Geral</h2>

            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* Ordens em Produção */}
              <Link href="/producao" className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <Clock size={20} className="text-orange-600" />
                  <span className="text-xs text-gray-500">Produzindo</span>
                </div>
                <p className="text-2xl font-bold text-gray-800">{ordensEmProducao.length}</p>
                <p className="text-xs text-gray-600 mt-1">Ordem(ns) em produção</p>
              </Link>

              {/* Ordens Aguardando */}
              <Link href="/ordens" className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <TrendingUp size={20} className="text-blue-600" />
                  <span className="text-xs text-gray-500">Fila</span>
                </div>
                <p className="text-2xl font-bold text-gray-800">{ordensAguardando.length}</p>
                <p className="text-xs text-gray-600 mt-1">Ordem(ns) aguardando</p>
              </Link>

              {/* Ordens para Hoje */}
              <Link href="/ordens" className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <Package size={20} className="text-emerald-600" />
                  <span className="text-xs text-gray-500">Hoje</span>
                </div>
                <p className="text-2xl font-bold text-gray-800">{ordensHoje.length}</p>
                <p className="text-xs text-gray-600 mt-1">Entrega(s) hoje</p>
              </Link>

              {/* Tarefas do Dia */}
              <Link href="/tarefas/dashboard" className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <CheckCircle2 size={20} className="text-pink-600" />
                  <span className="text-xs text-gray-500">Hoje</span>
                </div>
                <p className="text-2xl font-bold text-gray-800">{tarefasHoje.length}</p>
                <p className="text-xs text-gray-600 mt-1">Tarefa(s) do dia</p>
              </Link>
            </div>

            {/* Total de Ordens */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <AlertTriangle size={20} className="text-purple-600" />
                <span className="text-xs text-gray-500">Total</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">{ordens.length}</p>
              <p className="text-xs text-gray-600 mt-1">Ordem(ns) no sistema</p>
            </div>
          </div>

          {/* Rodapé com Auditoria */}
          <div className="text-xs text-gray-500 text-center py-4 border-t border-gray-200">
            <p>✓ Dados em tempo real • Visão global do sistema • Atualizado automaticamente</p>
          </div>
        </div>
      </div>
    )
  }

  // RENDER PARA COZINHA
  if (usuario?.role === 'cozinha') {
    const hoje = new Date().toISOString().split('T')[0]

    // Calcular tarefas
    const tarefasHoje = tarefasCozinha.filter(t => t.data_vencimento === hoje)
    const tarefasAtrasadas = tarefasCozinha.filter(t => t.data_vencimento < hoje && t.status !== 'concluida')

    // Calcular ordens
    const ordensAtrasadas = ordens.filter(o => o.data_entrega < hoje && o.status !== 'concluida')
    const ordensHoje = ordens.filter(o => o.data_entrega === hoje)
    const ordensEmProducao = ordens.filter(o => o.status === 'em_producao')
    const ordensAguardando = ordens.filter(o => o.status === 'pendente')

    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-4 sticky top-0 z-40 shadow-md flex items-center gap-3">
          <OluquinhasLogo size="sm" variant="rosto" color="branco" />
          <div>
            <h1 className="text-2xl font-bold text-white">Produção</h1>
            <p className="text-sm text-orange-100 mt-1">Painel da Cozinha</p>
          </div>
        </div>

        <div className="p-4 max-w-2xl mx-auto">
          {/* Ações Rápidas */}
          <div className="mb-8">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Ações Rápidas</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Link href="/producao" className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
                <Clock size={24} className="mb-2" />
                <p className="font-medium text-sm">Ordens Pendentes</p>
              </Link>
              <Link href="/producao/ordem-interna" className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
                <Plus size={24} className="mb-2" />
                <p className="font-medium text-sm">Ordem Interna</p>
              </Link>
              <Link href="/expedicao" className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
                <Truck size={24} className="mb-2" />
                <p className="font-medium text-sm">Expedição</p>
              </Link>
              <Link href="/tarefas" className="bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
                <CheckCircle2 size={24} className="mb-2" />
                <p className="font-medium text-sm">Tarefas</p>
              </Link>
              <Link href="/estoque" className="bg-gradient-to-br from-cyan-500 to-cyan-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
                <Package size={24} className="mb-2" />
                <p className="font-medium text-sm">Criar Envio</p>
              </Link>
              <Link href="/producao/reimprimir" className="bg-gradient-to-br from-red-500 to-red-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
                <AlertCircle size={24} className="mb-2" />
                <p className="font-medium text-sm">Reimprimir</p>
              </Link>
            </div>
          </div>

          {/* Indicadores Críticos (Atrasados) */}
          {(ordensAtrasadas.length > 0 || tarefasAtrasadas.length > 0) && (
            <div className="mb-8 space-y-3">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Atenção Necessária</h2>

              {ordensAtrasadas.length > 0 && (
                <Link href="/producao" className="bg-red-50 border border-red-200 rounded-lg p-4 hover:bg-red-100 transition-all block">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-red-700 flex items-center gap-2">
                        <AlertCircle size={18} /> Ordens Atrasadas
                      </p>
                      <p className="text-sm text-red-600 mt-1">Ordens com entrega vencida</p>
                    </div>
                    <span className="bg-red-200 text-red-700 px-3 py-1 rounded-full text-sm font-bold">{ordensAtrasadas.length}</span>
                  </div>
                </Link>
              )}

              {tarefasAtrasadas.length > 0 && (
                <Link href="/tarefas" className="bg-orange-50 border border-orange-200 rounded-lg p-4 hover:bg-orange-100 transition-all block">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-orange-700 flex items-center gap-2">
                        <AlertTriangle size={18} /> Tarefas Atrasadas
                      </p>
                      <p className="text-sm text-orange-600 mt-1">Tarefas vencidas</p>
                    </div>
                    <span className="bg-orange-200 text-orange-700 px-3 py-1 rounded-full text-sm font-bold">{tarefasAtrasadas.length}</span>
                  </div>
                </Link>
              )}
            </div>
          )}

          {/* Indicadores Gerais */}
          <div className="mb-8">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Situação Atual</h2>

            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* Ordens em Produção */}
              <Link href="/producao" className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <Truck size={20} className="text-blue-600" />
                  <span className="text-xs text-gray-500">Produzindo</span>
                </div>
                <p className="text-2xl font-bold text-gray-800">{ordensEmProducao.length}</p>
                <p className="text-xs text-gray-600 mt-1">Ordem(ns) em produção</p>
              </Link>

              {/* Ordens Aguardando */}
              <Link href="/producao" className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <Clock size={20} className="text-amber-600" />
                  <span className="text-xs text-gray-500">Fila</span>
                </div>
                <p className="text-2xl font-bold text-gray-800">{ordensAguardando.length}</p>
                <p className="text-xs text-gray-600 mt-1">Ordem(ns) aguardando</p>
              </Link>

              {/* Ordens para Hoje */}
              <Link href="/producao" className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <Package size={20} className="text-green-600" />
                  <span className="text-xs text-gray-500">Hoje</span>
                </div>
                <p className="text-2xl font-bold text-gray-800">{ordensHoje.length}</p>
                <p className="text-xs text-gray-600 mt-1">Entrega(s) hoje</p>
              </Link>

              {/* Tarefas do Dia */}
              <Link href="/tarefas" className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <CheckCircle2 size={20} className="text-orange-600" />
                  <span className="text-xs text-gray-500">Hoje</span>
                </div>
                <p className="text-2xl font-bold text-gray-800">{tarefasHoje.length}</p>
                <p className="text-xs text-gray-600 mt-1">Tarefa(s) do dia</p>
              </Link>
            </div>

            {/* Total de Ordens */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp size={20} className="text-purple-600" />
                <span className="text-xs text-gray-500">Total</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">{ordens.length}</p>
              <p className="text-xs text-gray-600 mt-1">Ordem(ns) no sistema</p>
            </div>
          </div>

          {/* Rodapé com Auditoria */}
          <div className="text-xs text-gray-500 text-center py-4 border-t border-gray-200">
            <p>✓ Dados em tempo real • Ordens globais • Atualizado automaticamente</p>
          </div>
        </div>
      </div>
    )
  }

  // RENDER PARA LOJA
  const hoje = new Date().toISOString().split('T')[0]

  // Calcular tarefas do dia
  const tarefasHoje = tarefas.filter(t => t.data_vencimento === hoje)
  const tarefasAtrasadas = tarefas.filter(t => t.data_vencimento < hoje && t.status !== 'concluida')

  // Calcular ordens
  const ordensHoje = ordens.filter(o => o.data_entrega === hoje && o.loja_destino === usuario?.loja_id)
  const ordensEmAberto = ordens.filter(o => (o.status === 'pendente' || o.status === 'em_producao') && o.loja_destino === usuario?.loja_id)

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 sticky top-0 z-40 flex items-center gap-3">
        <OluquinhasLogo size="sm" variant="rosto" color="branco" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{LOCAL_LABEL[usuario?.loja_id || 'cozinha']}</h1>
          <p className="text-sm text-gray-600 mt-1">Painel de gestão da unidade</p>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {/* Atalhos de Ação Rápida */}
        <div className="mb-8">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Ações Rápidas</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Link href="/ordens/nova" className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
              <Plus size={24} className="mb-2" />
              <p className="font-medium text-sm">Criar Ordem</p>
            </Link>
            <Link href="/estoque" className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
              <Package size={24} className="mb-2" />
              <p className="font-medium text-sm">Estoque</p>
            </Link>
            <Link href="/expedicao" className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
              <Truck size={24} className="mb-2" />
              <p className="font-medium text-sm">Expedição</p>
            </Link>
            <Link href="/tarefas" className="bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
              <CheckCircle2 size={24} className="mb-2" />
              <p className="font-medium text-sm">Tarefas</p>
            </Link>
            <Link href="/ordens" className="bg-gradient-to-br from-cyan-500 to-cyan-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
              <TrendingUp size={24} className="mb-2" />
              <p className="font-medium text-sm">Ordens</p>
            </Link>
            <Link href="/scanner" className="bg-gradient-to-br from-pink-500 to-pink-600 text-white rounded-lg p-4 hover:shadow-md transition-all">
              <AlertCircle size={24} className="mb-2" />
              <p className="font-medium text-sm">Scanner</p>
            </Link>
          </div>
        </div>

        {/* Indicadores Críticos (Atrasados/Vencendo) */}
        {(tarefasAtrasadas.length > 0 || stats.vencendo > 0 || recebimentos.length > 0) && (
          <div className="mb-8 space-y-3">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Atenção Necessária</h2>

            {tarefasAtrasadas.length > 0 && (
              <Link href="/tarefas" className="bg-red-50 border border-red-200 rounded-lg p-4 hover:bg-red-100 transition-all block">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-red-700 flex items-center gap-2">
                      <AlertCircle size={18} /> Tarefas Atrasadas
                    </p>
                    <p className="text-sm text-red-600 mt-1">{tarefasAtrasadas.length} tarefa(s) vencida(s)</p>
                  </div>
                  <span className="bg-red-200 text-red-700 px-3 py-1 rounded-full text-sm font-bold">{tarefasAtrasadas.length}</span>
                </div>
              </Link>
            )}

            {stats.vencendo > 0 && (
              <Link href="/estoque" className="bg-orange-50 border border-orange-200 rounded-lg p-4 hover:bg-orange-100 transition-all block">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-orange-700 flex items-center gap-2">
                      <AlertTriangle size={18} /> Vencimento Próximo
                    </p>
                    <p className="text-sm text-orange-600 mt-1">Itens com validade em 7 dias</p>
                  </div>
                  <span className="bg-orange-200 text-orange-700 px-3 py-1 rounded-full text-sm font-bold">{stats.vencendo}</span>
                </div>
              </Link>
            )}

            {recebimentos.length > 0 && (
              <Link href="/expedicao" className="bg-blue-50 border border-blue-200 rounded-lg p-4 hover:bg-blue-100 transition-all block">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-blue-700 flex items-center gap-2">
                      <Truck size={18} /> Pendente de Recebimento
                    </p>
                    <p className="text-sm text-blue-600 mt-1">Envios aguardando conferência</p>
                  </div>
                  <span className="bg-blue-200 text-blue-700 px-3 py-1 rounded-full text-sm font-bold">{recebimentos.length}</span>
                </div>
              </Link>
            )}
          </div>
        )}

        {/* Indicadores Gerais */}
        <div className="mb-8">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Situação Atual</h2>

          <div className="grid grid-cols-2 gap-3 mb-3">
            {/* Tarefas do Dia */}
            <Link href="/tarefas" className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all">
              <div className="flex items-center justify-between mb-2">
                <Clock size={20} className="text-amber-600" />
                <span className="text-xs text-gray-500">Hoje</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">{tarefasHoje.length}</p>
              <p className="text-xs text-gray-600 mt-1">Tarefa(s) do dia</p>
            </Link>

            {/* Ordens para Hoje */}
            <Link href="/ordens" className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all">
              <div className="flex items-center justify-between mb-2">
                <Package size={20} className="text-cyan-600" />
                <span className="text-xs text-gray-500">Hoje</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">{ordensHoje.length}</p>
              <p className="text-xs text-gray-600 mt-1">Entrega(s) hoje</p>
            </Link>

            {/* Estoque Total */}
            <Link href="/estoque" className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all">
              <div className="flex items-center justify-between mb-2">
                <Package size={20} className="text-green-600" />
                <span className="text-xs text-gray-500">Total</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">{stats.totalEstoque || 0}</p>
              <p className="text-xs text-gray-600 mt-1">Itens em estoque</p>
            </Link>

            {/* Ordens em Aberto */}
            <Link href="/ordens" className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all">
              <div className="flex items-center justify-between mb-2">
                <AlertCircle size={20} className="text-blue-600" />
                <span className="text-xs text-gray-500">Aberto</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">{ordensEmAberto.length}</p>
              <p className="text-xs text-gray-600 mt-1">Ordem(ns) em andamento</p>
            </Link>
          </div>
        </div>

        {/* Rodapé com Auditoria */}
        <div className="text-xs text-gray-500 text-center py-4 border-t border-gray-200">
          <p>✓ Dados em tempo real • Isolado por unidade • Atualizado automaticamente</p>
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
