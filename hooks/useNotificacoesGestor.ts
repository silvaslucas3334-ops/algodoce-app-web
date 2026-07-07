import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface NotificacaoGestor {
  id: string
  tarefa_id: string
  tarefa_titulo: string
  mensagem: string | null
  criado_por: string | null
  created_at: string
}

// Notificações assíncronas (ex: tarefa concluída pelo gestor em nome do
// colaborador) — não são tempo real, aparecem na próxima vez que o usuário
// abrir o app, e ficam registradas até ele confirmar que viu.
export function useNotificacoesGestor(usuarioId: string | undefined) {
  const [notificacoes, setNotificacoes] = useState<NotificacaoGestor[]>([])
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
        .select('id, tarefa_id, mensagem, criado_por, created_at, tarefa:tarefas(titulo)')
        .eq('usuario_id', usuarioId)
        .is('lida_em', null)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Erro ao carregar notificações do gestor:', error)
        return
      }

      setNotificacoes(
        (data || []).map((n: any) => ({
          id: n.id,
          tarefa_id: n.tarefa_id,
          tarefa_titulo: n.tarefa?.titulo || 'Tarefa',
          mensagem: n.mensagem,
          criado_por: n.criado_por,
          created_at: n.created_at,
        }))
      )
    } finally {
      setCarregando(false)
    }
  }, [usuarioId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function marcarComoLidas() {
    if (notificacoes.length === 0) return
    const ids = notificacoes.map((n) => n.id)
    await supabase.from('tarefas_notificacoes').update({ lida_em: new Date().toISOString() }).in('id', ids)
    setNotificacoes([])
  }

  return { notificacoes, carregando, marcarComoLidas }
}
