/* eslint-disable no-restricted-globals */
// Service Worker para Push Notifications - Copa UNASP

self.addEventListener('push', (event) => {
  let data = {
    title: 'Copa UNASP',
    body: 'Nova atualização imperdível do torneio!',
    icon: '/icons.svg',
    url: '/'
  };

  if (event.data) {
    try {
      // Tenta fazer o parse do JSON enviado pela Supabase
      const parsedData = event.data.json();
      data = { ...data, ...parsedData };
    } catch (e) {
      // Se falhar (ex: payload em texto puro), usa como corpo
      data.body = event.data.text() || data.body;
      console.warn('Push payload não era JSON válido. Usando como texto.');
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icons.svg',
    badge: '/favicon.svg',
    vibrate: [300, 100, 400],
    tag: data.tag || 'copa-unasp-alert', // tag permite substituir notificação antiga
    renotify: true, // Garante que vibre/toque mesmo se a tag for a mesma
    requireInteraction: true, // Mantém a notificação na tela até o usuário interagir (bom para desktop/alguns Androids)
    silent: false,
    data: {
      url: data.url || '/',
    },
    actions: [{ action: 'open', title: 'Ver Agora 🏆' }],
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
