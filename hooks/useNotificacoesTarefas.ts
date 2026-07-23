import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { TarefaNotificacao } from '@/lib/types'

const LIMITE_FEED = 30

// Feed de atividade das tarefas (comentário, devolução pra refazer,
// aprovação, conclusão pelo gestor) — histórico rolável (lidas + não
// lidas), não uma caixa de entrada que esvazia. Atualiza em tempo real via
// Realtime (mesmo padrão de hooks/useTaskNotifications.ts), com filtro no
// servidor já que o alvo é sempre o próprio usuário.
export function useNotificacoesTarefas(usuarioId: string | undefined) {
  const [notificacoes, setNotificacoes] = useState<TarefaNotificacao[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    if (!usuarioId) {
      setCarregando(false)
      return
    }
    setCarregando(true)
    try {
      const { data, error } = await supabase
        .from('tarefas_notificacoes')
        .select('*, tarefa:tarefas(titulo, responsavel_atual_id)')
        .eq('usuario_id', usuarioId)
        .order('created_at', { ascending: false })
        .limit(LIMITE_FEED)

      if (error) {
        console.error('Erro ao carregar notificações:', error)
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
      .channel(`tarefas-notificacoes-${usuarioId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tarefas_notificacoes',
          filter: `usuario_id=eq.${usuarioId}`,
        },
        async (payload: any) => {
          const nova = payload.new
          // O payload do Realtime não traz o join — busca o título à parte.
          const { data: tarefa } = await supabase
            .from('tarefas')
            .select('titulo, responsavel_atual_id')
            .eq('id', nova.tarefa_id)
            .single()

          setNotificacoes((prev) => [{ ...nova, tarefa: tarefa || undefined }, ...prev].slice(0, LIMITE_FEED))
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
    await supabase.from('tarefas_notificacoes').update({ lida_em: agora }).in('id', alvo)
    setNotificacoes((prev) => prev.map((n) => (alvo.includes(n.id) ? { ...n, lida_em: agora } : n)))
  }

  const naoLidas = notificacoes.filter((n) => !n.lida_em).length

  return { notificacoes, naoLidas, carregando, marcarComoLidas }
}
