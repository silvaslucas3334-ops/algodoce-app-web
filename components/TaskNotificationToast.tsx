'use client'
import { useEffect, useState } from 'react'
import { TaskNotification } from '@/hooks/useTaskNotifications'
import OluquinhasLogo from '@/components/OluquinhasLogo'
import { X } from 'lucide-react'

interface TaskNotificationToastProps {
  notification: TaskNotification
  onDismiss?: () => void
  autoCloseDuration?: number
}

export default function TaskNotificationToast({
  notification,
  onDismiss,
  autoCloseDuration = 6000,
}: TaskNotificationToastProps) {
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

  return (
    <div
      className={`fixed bottom-6 right-6 max-w-md z-50 transform transition-all duration-300 ${
        isExiting
          ? 'translate-x-[400px] opacity-0'
          : 'translate-x-0 opacity-100'
      }`}
      role="alert"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-rose-200 overflow-hidden">
        {/* Header com gradiente rose */}
        <div className="bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <OluquinhasLogo size="sm" variant="rosto" color="branco" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Nova Tarefa!</h3>
              <p className="text-xs text-rose-100">{notification.setor_nome}</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-rose-100 hover:text-white transition-colors flex-shrink-0"
            aria-label="Descartar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="px-4 py-3 bg-white">
          <p className="text-sm font-semibold text-gray-800 mb-2">
            {notification.titulo}
          </p>
          <p className="text-xs text-gray-500">
            {new Date(notification.timestamp).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-rose-100">
          <div
            className="h-full bg-gradient-to-r from-rose-500 to-rose-600 transition-all"
            style={{
              animation: `shrink ${autoCloseDuration}ms linear forwards`,
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  )
}
