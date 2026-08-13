import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { OrdemNotificacao } from '@/lib/types'

const JANELA_FEED_DIAS = 5

// Espelha hooks/useNotificacoesTarefas.ts — feed de notificações de ordem
// (hoje só 'cancelada'), mostra toda não lida mais as lidas dos últimos 5
// dias, atualiza em tempo real via Realtime.
export function useOrdensNotificacoes(usuarioId: string | undefined) {
  const [notificacoes, setNotificacoes] = useState<OrdemNotificacao[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    if (!usuarioId) {
      setCarregando(false)
      return
    }
    setCarregando(true)
    try {
      const limiteJanela = new Date(Date.now() - JANELA_FEED_DIAS * 86400000).toISOString()
      const { data, error } = await supabase
        .from('ordens_notificacoes')
        .select('*, ordem:ordens_producao(numero_ordem, produto:produtos(nome))')
        .eq('usuario_id', usuarioId)
        .or(`lida_em.is.null,created_at.gte.${limiteJanela}`)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Erro ao carregar notificações de ordem:', error)
        return
      }
      setNotificacoes(data || [])
    } finally {
      setCarregando(false)
    }
  }, [usuarioId])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    if (!usuarioId) return

    const channel = supabase
      .channel(`ordens-notificacoes-${usuarioId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ordens_notificacoes',
          filter: `usuario_id=eq.${usuarioId}`,
        },
        async (payload: any) => {
          const nova = payload.new
          const { data: ordem } = await supabase
            .from('ordens_producao')
            .select('numero_ordem, produto:produtos(nome)')
            .eq('id', nova.ordem_id)
            .single()

          setNotificacoes((prev) => [{ ...nova, ordem: ordem || undefined }, ...prev])
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [usuarioId])

  async function marcarComoLidas(ids?: string[]) {
    const alvo = ids ?? notificacoes.filter((n) => !n.lida_em).map((n) => n.id)
    if (alvo.length === 0) return
    const agora = new Date().toISOString()
    await supabase.from('ordens_notificacoes').update({ lida_em: agora }).in('id', alvo)
    setNotificacoes((prev) => prev.map((n) => (alvo.includes(n.id) ? { ...n, lida_em: agora } : n)))
  }

  const naoLidas = notificacoes.filter((n) => !n.lida_em).length

  return { notificacoes, naoLidas, carregando, marcarComoLidas }
}
