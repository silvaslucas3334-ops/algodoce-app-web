// Service Worker para Web Push Notifications

self.addEventListener('install', event => {
  console.log('Service Worker instalado')
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  console.log('Service Worker ativado')
  event.waitUntil(clients.claim())
})

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {}

  const options = {
    body: data.body || 'Nova notificação',
    icon: data.icon || '/logo.png',
    badge: data.badge || '/logo.png',
    tag: data.tag || 'notification',
    requireInteraction: true,
    data: data.data || {},
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Nova Tarefa!', options)
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()

  const data = event.notification.data
  const url = data.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      // Procura por uma aba já aberta
      for (let client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus()
        }
      }
      // Se não encontrar, abre uma nova
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})

self.addEventListener('notificationclose', event => {
  console.log('Notificação fechada:', event.notification.tag)
})
