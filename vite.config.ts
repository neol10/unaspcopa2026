import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Em localhost (DEV) o Service Worker pode ficar ativo de builds antigos
      // e interferir no carregamento (cache/requests), causando loading infinito.
      // Desabilitamos o SW em DEV; em produção continua habilitado.
      devOptions: {
        enabled: false,
      },
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.png', 'icons.svg'],
      manifest: {
        name: 'Copa Unasp 2026',
        short_name: 'Copa Unasp',
        description: 'O palco da glória suprema. Acompanhe a maior competição universitária do Unasp.',
        theme_color: '#05070a',
        background_color: '#020408',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/favicon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/favicon.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/favicon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        importScripts: ['push-sw.js'],
        // Cacheia apenas assets estáticos, NUNCA a API
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        cleanupOutdatedCaches: true,
        // Força o SW a assumir o controle imediatamente ao atualizar
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    // Evita subir múltiplas instâncias em portas diferentes (5174/5175/...)
    // o que confunde durante debug (F5 parece “não atualizar”).
    port: 5174,
    strictPort: true,
  }
})
