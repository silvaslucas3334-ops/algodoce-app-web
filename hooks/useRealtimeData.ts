import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface UseRealtimeDataProps {
  table: string
  onInsert?: (data: any) => void
  onUpdate?: (data: any) => void
  onDelete?: (data: any) => void
  schema?: string
}

export function useRealtimeData({ 
  table, 
  onInsert, 
  onUpdate, 
  onDelete,
  schema = 'public'
}: UseRealtimeDataProps) {
  useEffect(() => {
    const channel = supabase
      .channel(`${table}_changes`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema, table },
        (payload) => onInsert?.(payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema, table },
        (payload) => onUpdate?.(payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema, table },
        (payload) => onDelete?.(payload.old)
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [table, schema, onInsert, onUpdate, onDelete])
}
