'use client'
import { useState, useCallback } from 'react'
import { OrdemNotification, useOrdemNotifications } from '@/hooks/useOrdemNotifications'
import OrdemNotificationToast from '@/components/OrdemNotificationToast'
import { Bell } from 'lucide-react'

interface OrdemNotificationStackProps {
  ativo: boolean
  maxNotifications?: number
}

export default function OrdemNotificationStack({
  ativo,
  maxNotifications = 3,
}: OrdemNotificationStackProps) {
  const [displayedNotifications, setDisplayedNotifications] = useState<OrdemNotification[]>([])
  const [showPushPrompt, setShowPushPrompt] = useState(false)

  const handleNewNotification = useCallback((notification: OrdemNotification) => {
    setDisplayedNotifications((prev) => {
      const updated = [notification, ...prev]
      return updated.slice(0, maxNotifications)
    })
  }, [maxNotifications])

  const { pushEnabled, registrarPush } = useOrdemNotifications(ativo, handleNewNotification)

  const handleEnablePush = async () => {
    await registrarPush()
    setShowPushPrompt(false)
  }

  return (
    <>
      {/* Stack de notificações */}
      <div className="fixed bottom-6 left-6 space-y-3 pointer-events-none z-40">
        {displayedNotifications.map((notification) => (
          <div key={notification.id} className="pointer-events-auto">
            <OrdemNotificationToast
              notification={notification}
              onDismiss={() => {
                setDisplayedNotifications((prev) => prev.filter((n) => n.id !== notification.id))
              }}
            />
          </div>
        ))}
      </div>

      {/* Prompt para habilitar Push Notifications - apenas se usuário clicar */}
      {showPushPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-orange-100 rounded-full p-3">
                <Bell size={24} className="text-orange-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-800">Receba notificações!</h2>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Ative notificações para saber de novas ordens de produção mesmo quando a aba
              está minimizada.
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
                className="flex-1 px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 transition-colors"
              >
                Ativar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botão para habilitar push - apenas se não ativado e não mostrar prompt */}
      {!pushEnabled && !showPushPrompt && (
        <button
          onClick={() => setShowPushPrompt(true)}
          className="fixed bottom-20 right-6 bg-orange-600 hover:bg-orange-700 text-white rounded-full p-3 shadow-lg transition-all z-50"
          title="Habilitar notificações"
        >
          <Bell size={20} />
        </button>
      )}
    </>
  )
}
