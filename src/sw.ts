/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

// Mantém a lógica de Push Notifications separada (public/push-sw.js)
// e evita misturar cache de navegação com eventos de push.
try {
  importScripts('push-sw.js');
} catch {
  // Se falhar, o SW ainda funciona para cache; push pode não estar disponível.
}

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
