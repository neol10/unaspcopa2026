/* eslint-disable no-restricted-globals */
// Service Worker para Push Notifications - Copa UNASP

self.addEventListener('push', (event) => {
  const data = event.data
    ? event.data.json()
    : {
        title: 'Copa UNASP',
        body: 'Nova atualização do torneio!',
        icon: '/icons.svg',
      }

  const options = {
    body: data.body,
    icon: data.icon || '/icons.svg',
    badge: '/favicon.svg',
    vibrate: [200, 100, 200],
    tag: 'copa-unasp-alert',
    renotify: true,
    silent: false,
    data: {
      url: data.url || '/',
    },
    actions: [{ action: 'open', title: 'Ver Agora' }],
  }

  event.waitUntil(self.registration.showNotification(data.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(event.notification.data.url)
      }
    }),
  )
})
