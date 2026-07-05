'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useAuth } from '@/hooks/useAuth'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { temPermissao } from '@/lib/permissions'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import EmptyState from '@/components/EmptyState'
import OluquinhasLogo from '@/components/OluquinhasLogo'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Pendente', color: 'bg-amber-100 text-amber-700' },
  em_producao: { label: 'Em produção', color: 'bg-blue-100 text-blue-700' },
  concluida: { label: 'Concluída', color: 'bg-green-100 text-green-700' },
  cancelada: { label: 'Cancelada', color: 'bg-gray-100 text-gray-500' },
}

export default function OrdensPage() {
  const { usuario } = useAuth()
  const [filtro, setFiltro] = useState('pendente')
  const [ordens, setOrdens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const podecriarOrdens = temPermissao(usuario?.role, 'criarOrdens')

  useEffect(() => {
    carregarOrdens()

    const channel = supabase
      .channel(`ordens-${filtro}-${usuario?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_producao' }, () => {
        carregarOrdens()
      })
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [filtro, usuario?.id])

  async function carregarOrdens() {
    setLoading(true)
    try {
      let query = supabase
        .from('ordens_producao')
        .select('*, produto:produtos(nome)')
        .eq('status', filtro)

      // Se for usuário de loja, filtrar pela loja designada
      if (usuario?.role === 'loja' && usuario?.loja_id) {
        query = query.eq('loja_destino', usuario.loja_id)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) {
        console.error('Erro Supabase:', JSON.stringify(error, null, 2))
        setOrdens([])
        return
      }

      setOrdens(data || [])
    } catch (err) {
      console.error('Erro ao carregar ordens:', err)
      setOrdens([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-gradient-to-r from-slate-500 to-slate-600 px-4 py-2 sticky top-0 z-40 shadow-md flex items-center justify-between h-20">
        <div className="flex items-center gap-4">
          <OluquinhasLogo size="md" variant="oluquinhas" color="branco" />
          <OluquinhasLogo size="xs" variant="rosto" color="branco" />
          <div>
            <h1 className="text-xl font-bold text-white">Ordens</h1>
            <p className="text-xs text-slate-100">Minhas Ordens</p>
          </div>
        </div>
        {podecriarOrdens && (
          <Link href="/ordens/nova" className="bg-white text-slate-600 rounded-lg px-4 py-2 font-semibold flex items-center gap-2 hover:bg-slate-50 shadow-md">
            <Plus size={18} /> Nova
          </Link>
        )}
      </div>

      <div className="p-4">
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {Object.entries(STATUS_LABEL).map(([key, { label, color }]) => (
            <button key={key} onClick={() => setFiltro(key)}
              className={`px-3 py-1 rounded-full text-sm whitespace-nowrap border ${filtro === key ? color + ' border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'}`}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : ordens.length === 0 ? (
          <EmptyState
            title={`Nenhuma ordem ${STATUS_LABEL[filtro]?.label.toLowerCase()}`}
            description="Quando tiver ordens, elas vão aparecer aqui"
            action={podecriarOrdens ? { label: 'Criar primeira ordem', onClick: () => {} } : undefined}
          />
        ) : (
          <div className="space-y-2">
            {ordens.map((ordem: any) => (
              <Link key={ordem.id} href={`/ordens/${ordem.id}`}>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 cursor-pointer transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-gray-400 font-mono">#{ordem.numero_ordem}</p>
                      <p className="font-semibold text-gray-800">{ordem.produto?.nome || 'Produto'}</p>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {ordem.quantidade} un · {LOCAL_LABEL[ordem.loja_destino]}
                    </p>
                    {ordem.data_entrega && (
                      <p className="text-xs text-gray-400 mt-1">
                        Entrega: {new Date(ordem.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap font-medium ${STATUS_LABEL[ordem.status]?.color}`}>
                    {STATUS_LABEL[ordem.status]?.label}
                  </span>
                </div>
                {ordem.observacao && <p className="text-xs text-gray-400 italic">{ordem.observacao}</p>}
              </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
