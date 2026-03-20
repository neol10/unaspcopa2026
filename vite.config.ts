import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (id.includes('react') || id.includes('scheduler')) return 'react-core';
          if (id.includes('react-router')) return 'router';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('@tanstack/react-query')) return 'react-query';
          if (id.includes('framer-motion')) return 'framer';
          if (id.includes('lucide-react')) return 'icons';
          return 'vendor';
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Em localhost (DEV) o Service Worker pode ficar ativo de builds antigos
      // e interferir no carregamento (cache/requests), causando loading infinito.
      // Desabilitamos o SW em DEV; em produção continua habilitado.
      devOptions: {
        enabled: false,
      },
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.png', 'icons.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
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
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      injectManifest: {
        // Mantém o precache de estáticos; a regra de navegação (HTML) fica no SW customizado.
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    })
  ],
  server: {
    host: true,
    // Evita subir múltiplas instâncias em portas diferentes (5174/5175/...)
    // o que confunde durante debug (F5 parece “não atualizar”).
    port: 5174,
    strictPort: true,
    proxy: {
      '/api/notify-push': {
        target: 'https://unaspcopa2026.vercel.app',
        changeOrigin: true,
        secure: true,
      },
      '/api/notify_push': {
        target: 'https://unaspcopa2026.vercel.app',
        changeOrigin: true,
        secure: true,
      },
      '/api/push-subscription': {
        target: 'https://unaspcopa2026.vercel.app',
        changeOrigin: true,
        secure: true,
      },
      '/api/push-public-key': {
        target: 'https://unaspcopa2026.vercel.app',
        changeOrigin: true,
        secure: true,
      },
    },
  }
})
