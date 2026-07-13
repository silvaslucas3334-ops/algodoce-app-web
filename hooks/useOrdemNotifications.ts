import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { tocarSomNotificacao } from '@/lib/tocarSom'

export interface OrdemNotification {
  id: string
  ordem_id: string
  produto_nome: string
  quantidade: number
  loja_destino: string
  timestamp: Date
}

// Espelha o padrão já usado em useTaskNotifications (tarefas): realtime +
// toast + Web Push opcional. Aqui a novidade é o som — dispara pra qualquer
// pessoa com a tela de Produção aberta, sem filtrar por usuário (a ordem não
// tem "responsável" individual como a tarefa tem).
export function useOrdemNotifications(ativo: boolean, onNotification?: (notification: OrdemNotification) => void) {
  const [pushEnabled, setPushEnabled] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.pushManager.getSubscription().then((subscription) => {
          setPushEnabled(!!subscription)
        })
      })
    }
  }, [])

  useEffect(() => {
    if (!ativo) return

    const channel = supabase
      .channel('ordens-producao-notificacao')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ordens_producao' },
        async (payload: any) => {
          const ordem = payload.new

          const { data: produtoData } = await supabase
            .from('produtos')
            .select('nome')
            .eq('id', ordem.produto_id)
            .single()

          const notification: OrdemNotification = {
            id: `${Date.now()}-${Math.random()}`,
            ordem_id: ordem.id,
            produto_nome: produtoData?.nome || 'Produto',
            quantidade: ordem.quantidade,
            loja_destino: ordem.loja_destino,
            timestamp: new Date(),
          }

          tocarSomNotificacao()
          onNotification?.(notification)

          if (pushEnabled && 'serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then((registration) => {
              registration.showNotification('Nova Ordem de Produção! 🧁', {
                body: `${notification.produto_nome} — ${notification.quantidade} un.`,
                icon: '/logo.png',
                badge: '/logo.png',
                tag: `ordem-${notification.ordem_id}`,
                requireInteraction: true,
                data: {
                  ordemId: notification.ordem_id,
                  url: '/producao',
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
  }, [ativo, pushEnabled])

  const registrarPush = async () => {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      console.warn('Web Push não suportado')
      return false
    }

    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        setPushEnabled(true)
        return true
      }
      return false
    } catch (error) {
      console.error('Erro ao habilitar notificações:', error)
      return false
    }
  }

  return {
    pushEnabled,
    registrarPush,
  }
}
