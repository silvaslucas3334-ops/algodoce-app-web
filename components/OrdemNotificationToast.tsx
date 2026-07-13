'use client'
import { useEffect, useState } from 'react'
import { OrdemNotification } from '@/hooks/useOrdemNotifications'
import { LOCAL_LABEL } from '@/lib/constants'
import OluquinhasLogo from '@/components/OluquinhasLogo'
import { X } from 'lucide-react'

interface OrdemNotificationToastProps {
  notification: OrdemNotification
  onDismiss?: () => void
  autoCloseDuration?: number
}

export default function OrdemNotificationToast({
  notification,
  onDismiss,
  autoCloseDuration = 6000,
}: OrdemNotificationToastProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (!autoCloseDuration) return

    const timer = setTimeout(() => {
      setIsExiting(true)
      setTimeout(() => {
        setIsVisible(false)
        onDismiss?.()
      }, 300)
    }, autoCloseDuration)

    return () => clearTimeout(timer)
  }, [autoCloseDuration, onDismiss])

  if (!isVisible) return null

  const handleDismiss = () => {
    setIsExiting(true)
    setTimeout(() => {
      setIsVisible(false)
      onDismiss?.()
    }, 300)
  }

  const destinoLabel =
    notification.loja_destino === 'cozinha'
      ? 'Ordem Interna'
      : LOCAL_LABEL[notification.loja_destino as keyof typeof LOCAL_LABEL] || notification.loja_destino

  return (
    <div
      className={`fixed bottom-6 right-6 max-w-md z-50 transform transition-all duration-300 ${
        isExiting ? 'translate-x-[400px] opacity-0' : 'translate-x-0 opacity-100'
      }`}
      role="alert"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-orange-200 overflow-hidden">
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <OluquinhasLogo size="sm" variant="rosto" color="branco" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Nova Ordem de Produção!</h3>
              <p className="text-xs text-orange-100">{destinoLabel}</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-orange-100 hover:text-white transition-colors flex-shrink-0"
            aria-label="Descartar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-3 bg-white">
          <p className="text-sm font-semibold text-gray-800 mb-2">
            {notification.produto_nome} · {notification.quantidade} un.
          </p>
          <p className="text-xs text-gray-500">
            {new Date(notification.timestamp).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>

        <div className="h-1 bg-orange-100">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-orange-600 transition-all"
            style={{ animation: `shrink-ordem ${autoCloseDuration}ms linear forwards` }}
          />
        </div>
      </div>

      <style>{`
        @keyframes shrink-ordem {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  )
}
