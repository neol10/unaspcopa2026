import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const applyBackgroundVariant = () => {
  const variants = [
    'radial-gradient(circle at 18% 18%, rgba(0, 169, 224, 0.16) 0%, transparent 42%), radial-gradient(circle at 82% 12%, rgba(0, 169, 224, 0.12) 0%, transparent 40%), linear-gradient(140deg, #02040c 0%, #081635 45%, #061b3b 100%)',
    'radial-gradient(circle at 12% 70%, rgba(0, 169, 224, 0.14) 0%, transparent 45%), radial-gradient(circle at 90% 20%, rgba(0, 169, 224, 0.1) 0%, transparent 38%), linear-gradient(150deg, #02040c 0%, #061026 48%, #0a1a3a 100%)',
    'radial-gradient(circle at 50% 15%, rgba(0, 169, 224, 0.12) 0%, transparent 40%), radial-gradient(circle at 10% 85%, rgba(0, 169, 224, 0.14) 0%, transparent 45%), linear-gradient(135deg, #02040c 0%, #071333 42%, #0b1f3f 100%)',
  ];

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (isLight) return;

  const rawIndex = Number(localStorage.getItem('bg_variant_index') || '0');
  const nextIndex = Number.isFinite(rawIndex) ? (rawIndex + 1) % variants.length : 0;
  document.body.style.backgroundImage = variants[nextIndex];
  localStorage.setItem('bg_variant_index', String(nextIndex));
};

applyBackgroundVariant();

// StrictMode removido propositalmente: causava erro de Lock no Supabase GoTrue
// ao montar cada componente 2x em dev, gerando conflito no auth token
createRoot(document.getElementById('root')!).render(
  <App />
)

// O registro do Service Worker (PWA) é gerenciado automaticamente pelo vite-plugin-pwa
