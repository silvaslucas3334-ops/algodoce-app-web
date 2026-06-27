import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useRealtimeData<T>(
  table: string,
  filter?: { column: string; value: string | string[] }
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const carregarDados = async () => {
      try {
        let query = supabase.from(table).select('*')

        if (filter) {
          if (Array.isArray(filter.value)) {
            query = query.in(filter.column, filter.value)
          } else {
            query = query.eq(filter.column, filter.value)
          }
        }

        const { data: result, error: err } = await query

        if (err) {
          console.error(`Erro ao carregar ${table}:`, err)
          setError(err.message)
          setLoading(false)
          return
        }

        setData(result as T[])
        setError(null)
        setLoading(false)

        // Subscrever a mudanças em tempo real
        const channel = supabase
          .channel(`${table}-${Date.now()}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table,
            },
            async () => {
              // Recarregar os dados quando houver mudanças
              let refreshQuery = supabase.from(table).select('*')

              if (filter) {
                if (Array.isArray(filter.value)) {
                  refreshQuery = refreshQuery.in(filter.column, filter.value)
                } else {
                  refreshQuery = refreshQuery.eq(filter.column, filter.value)
                }
              }

              const { data: newData } = await refreshQuery
              if (newData) setData(newData as T[])
            }
          )
          .subscribe()

        return () => {
          channel.unsubscribe()
        }
      } catch (err) {
        console.error('Erro em useRealtimeData:', err)
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
        setLoading(false)
      }
    }

    carregarDados()
  }, [table, filter?.column, filter?.value?.toString()])

  return { data, loading, error }
}
