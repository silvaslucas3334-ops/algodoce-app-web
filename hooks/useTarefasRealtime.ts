import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface UseTarefasRealtimeProps {
  onInsert?: () => void
  onUpdate?: () => void
  onDelete?: () => void
}

export function useTarefasRealtime({
  onInsert,
  onUpdate,
  onDelete,
}: UseTarefasRealtimeProps) {
  const callbacksRef = useRef({ onInsert, onUpdate, onDelete })

  useEffect(() => {
    callbacksRef.current = { onInsert, onUpdate, onDelete }
  }, [onInsert, onUpdate, onDelete])

  useEffect(() => {
    console.log('[Realtime] Iniciando subscription para tarefas')

    const channel = supabase
      .channel('tarefas-realtime-v2', { config: { broadcast: { self: true } } })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tarefas' },
        (payload) => {
          console.log('[Realtime] INSERT detectado:', payload.new.id)
          callbacksRef.current.onInsert?.()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tarefas' },
        (payload) => {
          console.log('[Realtime] UPDATE detectado:', payload.new.id)
          callbacksRef.current.onUpdate?.()
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'tarefas' },
        (payload) => {
          console.log('[Realtime] DELETE detectado:', payload.old.id)
          callbacksRef.current.onDelete?.()
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Status:', status)
      })

    return () => {
      console.log('[Realtime] Encerrando subscription')
      channel.unsubscribe()
    }
  }, [])
}
