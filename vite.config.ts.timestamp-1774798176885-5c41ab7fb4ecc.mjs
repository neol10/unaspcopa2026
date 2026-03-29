// vite.config.ts
import { defineConfig } from "file:///C:/Users/neolu/OneDrive/compactadas/copaunasp/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/neolu/OneDrive/compactadas/copaunasp/node_modules/@vitejs/plugin-react/dist/index.mjs";
import { VitePWA } from "file:///C:/Users/neolu/OneDrive/compactadas/copaunasp/node_modules/vite-plugin-pwa/dist/index.js";
var vite_config_default = defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return void 0;
          if (id.includes("react") || id.includes("scheduler")) return "react-core";
          if (id.includes("react-router")) return "router";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@tanstack/react-query")) return "react-query";
          if (id.includes("framer-motion")) return "framer";
          if (id.includes("lucide-react")) return "icons";
          return "vendor";
        }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // Em localhost (DEV) o Service Worker pode ficar ativo de builds antigos
      // e interferir no carregamento (cache/requests), causando loading infinito.
      // Desabilitamos o SW em DEV; em produção continua habilitado.
      devOptions: {
        enabled: false
      },
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "favicon.png", "icons.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"],
      manifest: {
        name: "Copa Unasp 2026",
        short_name: "Copa Unasp",
        description: "O palco da gl\xF3ria suprema. Acompanhe a maior competi\xE7\xE3o universit\xE1ria do Unasp.",
        theme_color: "#05070a",
        background_color: "#020408",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      injectManifest: {
        // Mantém o precache de estáticos; a regra de navegação (HTML) fica no SW customizado.
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"]
      }
    })
  ],
  server: {
    host: true,
    // Evita subir múltiplas instâncias em portas diferentes (5174/5175/...)
    // o que confunde durante debug (F5 parece “não atualizar”).
    port: 5174,
    strictPort: true,
    proxy: {
      "/api/notify-push": {
        target: "https://unaspcopa2026.vercel.app",
        changeOrigin: true,
        secure: true
      },
      "/api/notify_push": {
        target: "https://unaspcopa2026.vercel.app",
        changeOrigin: true,
        secure: true
      },
      "/api/push-subscription": {
        target: "https://unaspcopa2026.vercel.app",
        changeOrigin: true,
        secure: true
      },
      "/api/push-public-key": {
        target: "https://unaspcopa2026.vercel.app",
        changeOrigin: true,
        secure: true
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxuZW9sdVxcXFxPbmVEcml2ZVxcXFxjb21wYWN0YWRhc1xcXFxjb3BhdW5hc3BcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXG5lb2x1XFxcXE9uZURyaXZlXFxcXGNvbXBhY3RhZGFzXFxcXGNvcGF1bmFzcFxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvbmVvbHUvT25lRHJpdmUvY29tcGFjdGFkYXMvY29wYXVuYXNwL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCdcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tICd2aXRlLXBsdWdpbi1wd2EnXG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIGJ1aWxkOiB7XG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIG1hbnVhbENodW5rcyhpZCkge1xuICAgICAgICAgIGlmICghaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcycpKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdyZWFjdCcpIHx8IGlkLmluY2x1ZGVzKCdzY2hlZHVsZXInKSkgcmV0dXJuICdyZWFjdC1jb3JlJztcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ3JlYWN0LXJvdXRlcicpKSByZXR1cm4gJ3JvdXRlcic7XG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdAc3VwYWJhc2UnKSkgcmV0dXJuICdzdXBhYmFzZSc7XG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdAdGFuc3RhY2svcmVhY3QtcXVlcnknKSkgcmV0dXJuICdyZWFjdC1xdWVyeSc7XG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdmcmFtZXItbW90aW9uJykpIHJldHVybiAnZnJhbWVyJztcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ2x1Y2lkZS1yZWFjdCcpKSByZXR1cm4gJ2ljb25zJztcbiAgICAgICAgICByZXR1cm4gJ3ZlbmRvcic7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIFZpdGVQV0Eoe1xuICAgICAgc3RyYXRlZ2llczogJ2luamVjdE1hbmlmZXN0JyxcbiAgICAgIHNyY0RpcjogJ3NyYycsXG4gICAgICBmaWxlbmFtZTogJ3N3LnRzJyxcbiAgICAgIC8vIEVtIGxvY2FsaG9zdCAoREVWKSBvIFNlcnZpY2UgV29ya2VyIHBvZGUgZmljYXIgYXRpdm8gZGUgYnVpbGRzIGFudGlnb3NcbiAgICAgIC8vIGUgaW50ZXJmZXJpciBubyBjYXJyZWdhbWVudG8gKGNhY2hlL3JlcXVlc3RzKSwgY2F1c2FuZG8gbG9hZGluZyBpbmZpbml0by5cbiAgICAgIC8vIERlc2FiaWxpdGFtb3MgbyBTVyBlbSBERVY7IGVtIHByb2R1XHUwMEU3XHUwMEUzbyBjb250aW51YSBoYWJpbGl0YWRvLlxuICAgICAgZGV2T3B0aW9uczoge1xuICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICByZWdpc3RlclR5cGU6ICdhdXRvVXBkYXRlJyxcbiAgICAgIGluY2x1ZGVBc3NldHM6IFsnZmF2aWNvbi5zdmcnLCAnZmF2aWNvbi5wbmcnLCAnaWNvbnMuc3ZnJywgJ2ljb24tMTkyLnBuZycsICdpY29uLTUxMi5wbmcnLCAnYXBwbGUtdG91Y2gtaWNvbi5wbmcnXSxcbiAgICAgIG1hbmlmZXN0OiB7XG4gICAgICAgIG5hbWU6ICdDb3BhIFVuYXNwIDIwMjYnLFxuICAgICAgICBzaG9ydF9uYW1lOiAnQ29wYSBVbmFzcCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnTyBwYWxjbyBkYSBnbFx1MDBGM3JpYSBzdXByZW1hLiBBY29tcGFuaGUgYSBtYWlvciBjb21wZXRpXHUwMEU3XHUwMEUzbyB1bml2ZXJzaXRcdTAwRTFyaWEgZG8gVW5hc3AuJyxcbiAgICAgICAgdGhlbWVfY29sb3I6ICcjMDUwNzBhJyxcbiAgICAgICAgYmFja2dyb3VuZF9jb2xvcjogJyMwMjA0MDgnLFxuICAgICAgICBkaXNwbGF5OiAnc3RhbmRhbG9uZScsXG4gICAgICAgIHN0YXJ0X3VybDogJy8nLFxuICAgICAgICBpY29uczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIHNyYzogJy9pY29uLTE5Mi5wbmcnLFxuICAgICAgICAgICAgc2l6ZXM6ICcxOTJ4MTkyJyxcbiAgICAgICAgICAgIHR5cGU6ICdpbWFnZS9wbmcnXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBzcmM6ICcvaWNvbi01MTIucG5nJyxcbiAgICAgICAgICAgIHNpemVzOiAnNTEyeDUxMicsXG4gICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJ1xuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgc3JjOiAnL2ljb24tNTEyLnBuZycsXG4gICAgICAgICAgICBzaXplczogJzUxMng1MTInLFxuICAgICAgICAgICAgdHlwZTogJ2ltYWdlL3BuZycsXG4gICAgICAgICAgICBwdXJwb3NlOiAnYW55IG1hc2thYmxlJ1xuICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgICAgfSxcbiAgICAgIGluamVjdE1hbmlmZXN0OiB7XG4gICAgICAgIC8vIE1hbnRcdTAwRTltIG8gcHJlY2FjaGUgZGUgZXN0XHUwMEUxdGljb3M7IGEgcmVncmEgZGUgbmF2ZWdhXHUwMEU3XHUwMEUzbyAoSFRNTCkgZmljYSBubyBTVyBjdXN0b21pemFkby5cbiAgICAgICAgZ2xvYlBhdHRlcm5zOiBbJyoqLyoue2pzLGNzcyxodG1sLGljbyxwbmcsc3ZnfSddLFxuICAgICAgfSxcbiAgICB9KVxuICBdLFxuICBzZXJ2ZXI6IHtcbiAgICBob3N0OiB0cnVlLFxuICAgIC8vIEV2aXRhIHN1YmlyIG1cdTAwRkFsdGlwbGFzIGluc3RcdTAwRTJuY2lhcyBlbSBwb3J0YXMgZGlmZXJlbnRlcyAoNTE3NC81MTc1Ly4uLilcbiAgICAvLyBvIHF1ZSBjb25mdW5kZSBkdXJhbnRlIGRlYnVnIChGNSBwYXJlY2UgXHUyMDFDblx1MDBFM28gYXR1YWxpemFyXHUyMDFEKS5cbiAgICBwb3J0OiA1MTc0LFxuICAgIHN0cmljdFBvcnQ6IHRydWUsXG4gICAgcHJveHk6IHtcbiAgICAgICcvYXBpL25vdGlmeS1wdXNoJzoge1xuICAgICAgICB0YXJnZXQ6ICdodHRwczovL3VuYXNwY29wYTIwMjYudmVyY2VsLmFwcCcsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgc2VjdXJlOiB0cnVlLFxuICAgICAgfSxcbiAgICAgICcvYXBpL25vdGlmeV9wdXNoJzoge1xuICAgICAgICB0YXJnZXQ6ICdodHRwczovL3VuYXNwY29wYTIwMjYudmVyY2VsLmFwcCcsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgc2VjdXJlOiB0cnVlLFxuICAgICAgfSxcbiAgICAgICcvYXBpL3B1c2gtc3Vic2NyaXB0aW9uJzoge1xuICAgICAgICB0YXJnZXQ6ICdodHRwczovL3VuYXNwY29wYTIwMjYudmVyY2VsLmFwcCcsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgICAgc2VjdXJlOiB0cnVlLFxuICAgICAgfSxcbiAgICAgICcvYXBpL3B1c2gtcHVibGljLWtleSc6IHtcbiAgICAgICAgdGFyZ2V0OiAnaHR0cHM6Ly91bmFzcGNvcGEyMDI2LnZlcmNlbC5hcHAnLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4g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
