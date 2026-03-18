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

  const urlToOpen = new URL(event.notification.data.url || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Tenta focar em uma janela que já está na URL correta
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Se não achar na URL exata, foca na primeira janela disponível e navega
      if (clientList.length > 0 && 'navigate' in clientList[0]) {
        return clientList[0].navigate(urlToOpen).then(client => client.focus());
      }
      // Se não houver janela aberta, abre uma nova
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    }),
  )
})
