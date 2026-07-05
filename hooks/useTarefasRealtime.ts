import { useEffect, useCallback } from 'react'
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
  useEffect(() => {
    const channel = supabase
      .channel('tarefas-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tarefas' },
        () => onInsert?.()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tarefas' },
        () => onUpdate?.()
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'tarefas' },
        () => onDelete?.()
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [onInsert, onUpdate, onDelete])
}
