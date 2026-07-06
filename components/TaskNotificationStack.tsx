'use client'
import { useState, useCallback } from 'react'
import { TaskNotification, useTaskNotifications } from '@/hooks/useTaskNotifications'
import TaskNotificationToast from '@/components/TaskNotificationToast'
import { Bell } from 'lucide-react'

interface TaskNotificationStackProps {
  usuarioId: string | undefined
  maxNotifications?: number
}

export default function TaskNotificationStack({
  usuarioId,
  maxNotifications = 3,
}: TaskNotificationStackProps) {
  const [displayedNotifications, setDisplayedNotifications] = useState<TaskNotification[]>([])
  const [showPushPrompt, setShowPushPrompt] = useState(false)

  const handleNewNotification = useCallback((notification: TaskNotification) => {
    setDisplayedNotifications(prev => {
      const updated = [notification, ...prev]
      return updated.slice(0, maxNotifications)
    })
  }, [maxNotifications])

  const { pushEnabled, registrarPush } = useTaskNotifications(
    usuarioId,
    handleNewNotification
  )

  const handleEnablePush = async () => {
    const success = await registrarPush()
    if (success) {
      setShowPushPrompt(false)
    }
  }

  return (
    <>
      {/* Stack de notificações */}
      <div className="fixed bottom-6 right-6 space-y-3 pointer-events-none">
        {displayedNotifications.map((notification, index) => (
          <div key={notification.id} className="pointer-events-auto">
            <TaskNotificationToast
              notification={notification}
              onDismiss={() => {
                setDisplayedNotifications(prev =>
                  prev.filter(n => n.id !== notification.id)
                )
              }}
            />
          </div>
        ))}
      </div>

      {/* Prompt para habilitar Push Notifications */}
      {!pushEnabled && showPushPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-rose-100 rounded-full p-3">
                <Bell size={24} className="text-rose-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-800">
                Receba notificações!
              </h2>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Ative notificações para receber alertas de novas tarefas mesmo quando
              a aba está minimizada.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowPushPrompt(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
              >
                Agora não
              </button>
              <button
                onClick={handleEnablePush}
                className="flex-1 px-4 py-2 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-700 transition-colors"
              >
                Ativar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botão para habilitar push se não ativado */}
      {!pushEnabled && !showPushPrompt && (
        <button
          onClick={() => setShowPushPrompt(true)}
          className="fixed bottom-6 left-6 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-3 shadow-lg transition-all z-40"
          title="Habilitar notificações"
        >
          <Bell size={20} />
        </button>
      )}
    </>
  )
}
