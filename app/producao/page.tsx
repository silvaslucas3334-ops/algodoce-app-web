'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import { Plus, Play, AlertCircle } from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import OluquinhasLogo from '@/components/OluquinhasLogo'

const STATUS_INFO = {
  pendente: { label: 'Pendente', emoji: '⏳', color: 'bg-amber-100 text-amber-700 border-amber-300', bgContent: 'bg-amber-50' },
  em_producao: { label: 'Em Produção', emoji: '🔄', color: 'bg-blue-100 text-blue-700 border-blue-300', bgContent: 'bg-blue-50' },
  concluida: { label: 'Concluída Hoje', emoji: '✅', color: 'bg-green-100 text-green-700 border-green-300', bgContent: 'bg-green-50' },
}

// Unidade é o agrupamento principal da tela: quem produz pensa primeiro em
// "o que falta pra cada loja", então cada destino ganha sua própria seção
// com as 3 colunas de status lado a lado — dá pra ver o quadro completo de
// um destino sem precisar alternar entre filtro e abas.
const DESTINOS = [
  { id: 'loja1', label: LOCAL_LABEL.loja1, filtroLabel: LOCAL_LABEL.loja1 },
  { id: 'loja2', label: LOCAL_LABEL.loja2, filtroLabel: LOCAL_LABEL.loja2 },
  { id: 'cozinha', label: '🍳 Cozinha (Internas)', filtroLabel: 'Ordem Interna' },
]

function ProducaoContent() {
  const { usuario } = useAuth()
  const isAdmin = usuario?.role === 'admin'
  const [ordens, setOrdens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [destinoFiltro, setDestinoFiltro] = useState<string>('todas')

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

  const isAtrasada = (dataEntrega: string) => dataEntrega && dataEntrega < new Date().toISOString().split('T')[0]

  const KanbanCard = ({ ordem }: { ordem: any }) => (
    <div className={`bg-white rounded-lg p-4 shadow-sm border-l-4 transition-all hover:shadow-md ${
      ordem.status === 'pendente' && isAtrasada(ordem.data_entrega)
        ? 'border-l-red-500 border border-red-200'
        : 'border-l-gray-300 border border-gray-200'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <p className="text-xs text-gray-500 font-mono">Ordem #{ordem.numero_ordem}</p>
          <p className="font-bold text-gray-800 mt-1">{ordem.produto?.nome}</p>
        </div>
        {isAtrasada(ordem.data_entrega) && ordem.status !== 'concluida' && (
          <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-semibold">⚠️ Atrasada</span>
        )}
      </div>

      <div className="space-y-1 mb-4 pb-3 border-b border-gray-100 text-sm">
        <p className="text-gray-700">
          <strong className="text-gray-800">{ordem.quantidade}</strong> un. ·{' '}
          <span className="font-medium">{DESTINOS.find((d) => d.id === ordem.loja_destino)?.filtroLabel}</span>
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

      {!isAdmin && ordem.status === 'pendente' && (
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

      {!isAdmin && ordem.status === 'em_producao' && (
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

      {!isAdmin && ordem.status === 'concluida' && (
        <p className="text-xs text-green-600 font-semibold text-center py-2">✓ Ordem Concluída</p>
      )}
    </div>
  )

  const hoje = new Date().toISOString().split('T')[0]
  const ordensAtrasadas = ordens.filter(o => o.data_entrega && o.data_entrega < hoje && o.status !== 'concluida').length
  const ordensFiltradas = destinoFiltro === 'todas' ? ordens : ordens.filter((o) => o.loja_destino === destinoFiltro)

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 sticky top-0 z-40 shadow-md flex items-center justify-between h-20">
        <div className="flex items-center gap-4">
          <OluquinhasLogo size="md" variant="oluquinhas" color="marrom" />
          <OluquinhasLogo size="xs" variant="rosto" color="marrom" />
          <div>
            <h1 className="text-xl font-bold" style={{color: '#401c04'}}>Produção</h1>
            <p className="text-xs" style={{color: '#401c04'}}>Painel de produção da Cozinha</p>
          </div>
        </div>
        {!isAdmin && (
          <Link href="/producao/ordem-interna" className="bg-white text-orange-600 rounded-lg px-4 py-2 font-semibold flex items-center gap-2 hover:bg-orange-50 shadow-md">
            <Plus size={18} /> Ordem Interna
          </Link>
        )}
      </div>

      <div className="p-4 max-w-7xl mx-auto">
        {/* Filtro de destino: acesso rápido a uma unidade sem precisar rolar
            a página inteira; "Ver Todas" mantém a visão completa. */}
        <div className="flex gap-2 flex-wrap mb-6">
          {[{ id: 'todas', filtroLabel: 'Ver Todas' }, ...DESTINOS].map((d) => (
            <button
              key={d.id}
              onClick={() => setDestinoFiltro(d.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                destinoFiltro === d.id
                  ? 'bg-orange-600 text-white shadow-md'
                  : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
              }`}
            >
              {d.filtroLabel}
            </button>
          ))}
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

        {/* Um único quadro (3 colunas de status); o filtro de unidade acima
            troca o CONTEÚDO das colunas, não a estrutura da tela. */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando ordens...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(Object.keys(STATUS_INFO) as Array<keyof typeof STATUS_INFO>).map((status) => {
              const info = STATUS_INFO[status]
              // Concluída só mostra as de hoje — sem isso, o histórico
              // completo (meses de ordens) deixa a coluna enorme e enterra
              // o que realmente falta fazer.
              const lista = ordensFiltradas.filter(
                (o) => o.status === status && (status !== 'concluida' || (o.updated_at || '').slice(0, 10) === hoje)
              )
              return (
                <div key={status} className={`rounded-xl p-3 ${info.bgContent}`}>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className={`text-xs font-bold uppercase tracking-wide px-2 py-1 rounded-full border ${info.color}`}>
                      {info.emoji} {info.label}
                    </span>
                    <span className="text-xs font-semibold text-gray-500">{lista.length}</span>
                  </div>
                  {lista.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-6">Nenhuma ordem</p>
                  ) : (
                    <div className="space-y-3">
                      {lista.map((ordem: any) => (
                        <KanbanCard key={ordem.id} ordem={ordem} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
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
