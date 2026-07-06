import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface TaskNotification {
  id: string
  tarefa_id: string
  titulo: string
  setor_nome: string
  timestamp: Date
}

export function useTaskNotifications(usuarioId: string | undefined, onNotification?: (notification: TaskNotification) => void) {
  const [notifications, setNotifications] = useState<TaskNotification[]>([])
  const [pushEnabled, setPushEnabled] = useState(false)

  // Verificar se Web Push está disponível e habilitado
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(registration => {
        registration.pushManager.getSubscription().then(subscription => {
          setPushEnabled(!!subscription)
        })
      })
    }
  }, [])

  // Monitorar novas tarefas em realtime
  useEffect(() => {
    if (!usuarioId) return

    const channel = supabase
      .channel(`tarefas-notificacao-${usuarioId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tarefas',
        },
        async (payload: any) => {
          const tarefa = payload.new

          // Filtrar no código: só processar se é para este usuário
          if (tarefa.responsavel_atual_id !== usuarioId) return

          // Buscar nome do setor
          const { data: setorData } = await supabase
            .from('setores')
            .select('nome')
            .eq('id', tarefa.setor_id)
            .single()

          const notification: TaskNotification = {
            id: `${Date.now()}-${Math.random()}`,
            tarefa_id: tarefa.id,
            titulo: tarefa.titulo,
            setor_nome: setorData?.nome || 'Desconhecido',
            timestamp: new Date(),
          }

          setNotifications(prev => [notification, ...prev])
          onNotification?.(notification)

          // Enviar Web Push se habilitado
          if (pushEnabled && 'serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
              registration.showNotification('Nova Tarefa Designada! 🎯', {
                body: `${notification.titulo} - ${notification.setor_nome}`,
                icon: '/logo.png',
                badge: '/logo.png',
                tag: `task-${notification.tarefa_id}`,
                requireInteraction: true,
                data: {
                  tarefaId: notification.tarefa_id,
                  url: '/tarefas',
                },
              })
            })
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [usuarioId, pushEnabled, onNotification])

  // Função para registrar Web Push
  const registrarPush = async () => {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      console.warn('Web Push não suportado')
      return false
    }

    try {
      // Solicitar permissão de notificação
      const permission = await Notification.requestPermission()

      if (permission === 'granted') {
        console.log('✓ Notificações habilitadas')
        setPushEnabled(true)
        return true
      } else {
        console.log('✗ Permissão de notificação negada')
        return false
      }
    } catch (error) {
      console.error('Erro ao habilitar notificações:', error)
      return false
    }
  }

  return {
    notifications,
    pushEnabled,
    registrarPush,
  }
}
