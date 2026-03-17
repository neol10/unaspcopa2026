import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode removido propositalmente: causava erro de Lock no Supabase GoTrue
// ao montar cada componente 2x em dev, gerando conflito no auth token
createRoot(document.getElementById('root')!).render(
  <App />
)

// O registro do Service Worker (PWA) é gerenciado automaticamente pelo vite-plugin-pwa
