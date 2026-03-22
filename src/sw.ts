/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

// Lógica de Push Notifications integrada diretamente para maior confiabilidade em segundo plano.
self.addEventListener('push', (event) => {
  let data = {
    title: 'Copa UNASP',
    body: 'Nova atualização imperdível do torneio!',
    icon: '/icons.svg',
    url: '/'
  };

  if (event.data) {
    try {
      const parsedData = event.data.json();
      data = { ...data, ...parsedData };
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  const pushMeta = data as {
    tag?: string;
    category?: string;
    sentAt?: string;
    url?: string;
    icon?: string;
    body?: string;
    title?: string;
  };

  const computedTag =
    pushMeta.tag ||
    `copa-unasp-${pushMeta.category || 'general'}-${pushMeta.sentAt || Date.now().toString()}`;

  const options: NotificationOptions = {
    body: data.body,
    icon: data.icon || '/icons.svg',
    badge: '/favicon.svg',
    vibrate: [300, 100, 400],
    // Evita colapsar várias notificações no Android usando uma tag fixa.
    tag: computedTag,
    renotify: false,
    requireInteraction: false,
    silent: false,
    data: {
      url: data.url || '/',
    },
    actions: [{ action: 'open', title: 'Ver Agora 🏆' }],
  };

  // Sempre mostra a notificação nativa do sistema (garante entrega no Android)
  // E também envia mensagem para abas abertas mostrarem o Toast interno
  event.waitUntil(
    Promise.all([
      // 1. Sempre exibe notificação nativa — confiável em background/Android
      self.registration.showNotification(data.title, options),

      // 2. Notifica abas abertas para mostrarem o Toast do React
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const client of clients) {
          client.postMessage({
            type: 'PUSH_NOTIFICATION',
            payload: {
              title: data.title,
              body: data.body,
              url: data.url || '/',
              icon: data.icon,
              category: pushMeta.category
            }
          });
        }
      })
    ])
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      let subscription = event.newSubscription;

      if (!subscription) {
        const oldKey = event.oldSubscription?.options?.applicationServerKey;
        if (!oldKey) return;

        subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: oldKey,
        });
      }

      await fetch('/api/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: null,
          subscription: subscription.toJSON(),
        }),
      });
    } catch {
      // Sem impacto crítico: a inscrição também é revalidada quando o app abre.
    }
  })());
});


self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notificationData = (event.notification.data || {}) as { url?: string };
  const urlToOpen = new URL(notificationData.url || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clientList.length > 0 && 'navigate' in clientList[0]) {
        return clientList[0].navigate(urlToOpen).then((client) => client?.focus());
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    }),
  );
});

// Limpeza de cache antigo e ativação imediata
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k === 'supabase-data-cache').map((k) => caches.delete(k))),
      ),
      self.clients.claim()
    ])
  );
});

self.skipWaiting();
clientsClaim();

// Pré-cache gerado automaticamente pelo Workbox
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// IMPORTANTE: Navegação sempre tenta rede primeiro.
// Isso evita ficar preso em um index.html antigo (cache) após deploy,
// que causaria 404 de assets e "loading" infinito no F5.
registerRoute(
  ({ request }) => request.mode === 'navigate',
  async ({ event }) => {
    try {
      return await fetch(event.request);
    } catch {
      // Offline (ou rede instável): devolve o app shell do precache.
      const cached = await caches.match('/index.html', { ignoreSearch: true });
      return cached ?? Response.error();
    }
  },
);

registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*$/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

registerRoute(
  /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
  new CacheFirst({
    cacheName: 'image-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);
