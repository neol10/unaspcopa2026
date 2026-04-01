import React, { useEffect, Suspense, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Layout from './components/Layout/Layout';
import { AuthProvider } from './contexts/AuthContext';
import { Toaster, toast } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './components/Layout/Layout.css';
import { flushClientErrorQueue, reportErrorFromWindowEvent, reportPerformanceMetric } from './lib/clientErrors';
import { supabase } from './lib/supabase';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 10, // 10 minutos - mais agressivo para reduzir refetch
      refetchOnWindowFocus: false, // Não refetch ao voltar para a aba (evita carregamento infinito)
      // Auto-refresh por rota para reduzir carga e manter telas críticas mais vivas.
      refetchInterval: () => {
        if (typeof window !== 'undefined') {
          const path = window.location.pathname;
          if (path.startsWith('/admin')) return false;
          return 1000 * 10;
        }
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          return false;
        }
        return 1000 * 10;
      },
      refetchIntervalInBackground: false, // Evita tempestade de requests quando aba não está ativa
      retry: 2, // Retry 2 vezes em erro antes de falhar
      retryDelay: (attemptIndex) => Math.min(300 * Math.pow(2, attemptIndex), 5000), // Exponential backoff, max 5s
      networkMode: 'online', // Respeita status de rede, não tenta offline
    },
  },
});

// Lazy loading: cada página só carrega quando o usuário acessa
const Home = React.lazy(() => import('./pages/Home/Home'));
const Standings = React.lazy(() => import('./pages/Standings/Standings'));
const Rankings = React.lazy(() => import('./pages/Rankings/Rankings'));
const Teams = React.lazy(() => import('./pages/Teams/Teams'));
const Players = React.lazy(() => import('./pages/Players/Players'));
const MatchCenter = React.lazy(() => import('./pages/MatchCenter/MatchCenter'));
const Brackets = React.lazy(() => import('./pages/Brackets/Brackets'));
const Gallery = React.lazy(() => import('./pages/Gallery/Gallery'));
const Admin = React.lazy(() => import('./pages/Admin/Admin'));

const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: '1.5rem' }}>
    <motion.div
      animate={{ 
        scale: [1, 1.05, 1],
        opacity: [0.7, 1, 0.7],
        textShadow: [
          '0 0 0px var(--secondary)',
          '0 0 15px var(--secondary)',
          '0 0 0px var(--secondary)'
        ]
      }}
      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
      style={{
        display: 'inline-block',
        color: 'white',
        textAlign: 'center'
      }}
    >
      <h2 style={{ fontSize: '2rem', fontWeight: 900, margin: 0, letterSpacing: '2px', lineHeight: 1.1, textTransform: 'uppercase' }}>
        UNASP <br />
        <span style={{ color: 'var(--secondary)', WebkitTextFillColor: 'var(--secondary)' }}>COPA</span>
      </h2>
    </motion.div>
    <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', letterSpacing: '1px', textTransform: 'uppercase' }}>Carregando...</p>
  </div>
);

const ForceRefresh = () => {
  useEffect(() => {
    // Em DEV (localhost), um Service Worker antigo pode continuar ativo e
    // interferir em requisições/caches, causando "loading" infinito.
    // Aqui removemos o SW e caches sem mexer no localStorage (token Supabase).
    if (import.meta.env.DEV) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
          .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
          .catch((err) => console.log('Service Worker unregister failed: ', err));
      }
      if ('caches' in window) {
        caches.keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .catch(() => undefined);
      }
    }

    // Versão da aplicação para controle de cache
    const APP_VERSION = '1.0.6';
    const currentVersion = localStorage.getItem('app_version');

    if (currentVersion !== APP_VERSION) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
          for (const registration of registrations) {
            registration.unregister();
          }
        }).catch(function(err) {
          console.log('Service Worker unregister failed: ', err);
        });
      }
      
      // Limpa caches específicos que podem travar a UI com dados velhos/vazios
      // sem apagar o token de sessão do Supabase (localStorage.getItem('copa-unasp-auth')).
      const keysToClear = [
        'copa_unasp_cache_matches_all',
        'copa_unasp_cache_news_3',
        'standings_cache_v1',
        'copa_unasp_role_' // prefixo
      ];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && keysToClear.some(k => key.startsWith(k))) {
          localStorage.removeItem(key);
        }
      }

      sessionStorage.clear();
      localStorage.setItem('app_version', APP_VERSION);
      window.location.reload();
    }
  }, []);
  return null;
};

const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 1.02 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

import InstallPWAPrompt from './components/InstallPrompt/InstallPWAPrompt';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import SplashScreen from './components/SplashScreen/SplashScreen';
import { useAuthContext } from './contexts/AuthContext';

function AppContent() {
  const { loading: authLoading } = useAuthContext();
  const [showSplash, setShowSplash] = useState(true);
  const bootMetricSentRef = useRef(false);
  const recentPushToastRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const id = setTimeout(() => setShowSplash(false), 1200);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const triggerConfetti = async () => {
      try {
        const confetti = (await import('canvas-confetti')).default;
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#FFD700', '#FF0000', '#0000FF', '#FFFFFF'],
          zIndex: 9999
        });
      } catch (err) {
        console.warn('Confetti fail:', err);
      }
    };

    const playSound = (primaryUrl: string, fallbackUrl?: string, maxDurationMs?: number) => {
      const playAudio = (url: string) => {
        const audio = new Audio(url);
        audio.volume = 0.5;
        audio.play().catch(() => {});
        if (maxDurationMs) {
          window.setTimeout(() => {
            audio.pause();
            audio.currentTime = 0;
          }, maxDurationMs);
        }
        return audio;
      };

      const audio = playAudio(primaryUrl);
      if (fallbackUrl) {
        audio.addEventListener('error', () => {
          playAudio(fallbackUrl);
        }, { once: true });
      }
    };

    const playNotificationSound = (type: string) => {
      // Som de gol (torcida) ou apito (informação)
      if (type === 'gol') {
        playSound('/audio/goal-crowd.mp3', 'https://assets.mixkit.co/active_storage/sfx/2330/2330-preview.mp3', 5000);
        return;
      }
      playSound('https://assets.mixkit.co/active_storage/sfx/2004/2004-preview.mp3');
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_NOTIFICATION') {
        const { title, body, category } = event.data.payload || {};
        const messageKey = `${String(category || 'general')}|${String(title || '')}|${String(body || '')}`;
        const now = Date.now();
        const lastShownAt = recentPushToastRef.current.get(messageKey) || 0;

        // Evita toasts duplicados quando o mesmo push chega múltiplas vezes em poucos segundos.
        if (now - lastShownAt < 8000) {
          return;
        }

        recentPushToastRef.current.set(messageKey, now);
        if (recentPushToastRef.current.size > 50) {
          const entries = Array.from(recentPushToastRef.current.entries())
            .sort((a, b) => a[1] - b[1])
            .slice(0, 20);
          for (const [key] of entries) {
            recentPushToastRef.current.delete(key);
          }
        }
        
        // Efeitos Imersivos em Tempo Real
        if (category === 'gol') {
          triggerConfetti();
          playNotificationSound('gol');
        } else {
          playNotificationSound('info');
        }

        toast(() => (
          <div 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '4px', 
              cursor: event.data.payload?.url ? 'pointer' : 'default',
              minWidth: '200px'
            }}
            onClick={() => {
              if (event.data.payload?.url) {
                window.location.href = event.data.payload.url;
              }
            }}
          >
            <strong style={{ fontSize: '0.95rem' }}>{title || 'Copa UNASP'}</strong>
            <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>{body}</span>
          </div>
        ), {
          id: `push-${messageKey}`,
          icon: category === 'gol' ? '⚽' : '🔔',
          duration: 8000,
          position: 'top-center'
        });
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (bootMetricSentRef.current) return;
    if (authLoading || showSplash) return;

    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const navStart = navEntry?.startTime ?? 0;
    const now = performance.now();
    const bootMs = Math.max(0, now - navStart);

    reportPerformanceMetric('app_boot_ready', bootMs, {
      route: window.location.pathname,
    });
    bootMetricSentRef.current = true;
  }, [authLoading, showSplash]);

  useEffect(() => {
    // Escuta mudanças na conectividade para feedback offline
    const handleOnline = () => {
      toast.success('Você está online! ✨', { id: 'connectivity' });
      flushClientErrorQueue();
    };
    const handleOffline = () => toast.error('Você está offline. Exibindo dados salvos.', { id: 'connectivity', duration: 5000 });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Tratamento global de erros para evitar tela branca (ex: erro de chunk no PWA)
    const handleError = (e: unknown) => {
      const evt = e as { message?: unknown; reason?: unknown; preventDefault?: () => void };
      const reason = evt?.reason as { message?: unknown } | undefined;
      const msg = String(evt?.message ?? reason?.message ?? '');

      const lowerMsg = msg.toLowerCase();
      const isIgnorableAbort =
        lowerMsg.includes('aborterror')
        || lowerMsg.includes("lock broken by another request with the 'steal' option")
        || lowerMsg.includes('request was aborted');

      if (isIgnorableAbort && typeof evt.preventDefault === 'function') {
        evt.preventDefault();
        return;
      }
      if (isIgnorableAbort) return;

      console.error('Global Error Caught:', e);
      reportErrorFromWindowEvent(e, 'window');
      if (msg.includes('Loading chunk') || msg.includes('Failed to fetch dynamically imported module')) {
        toast.error('Nova versão disponível! Atualizando...', { duration: 3000 });
        setTimeout(() => window.location.reload(), 2000);
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);

    // Tenta enviar erros pendentes no boot
    flushClientErrorQueue();

    // Prefetch de dados críticos para navegação instantânea - COM SEGURANÇA
    const performPrefetch = async () => {
      try {
        await queryClient.prefetchQuery({
          queryKey: ['teams'],
          queryFn: async () => {
            const { data, error } = await supabase
              .from('teams')
              .select('*')
              .order('name');
            if (error) throw error;
            return data;
          },
        });
      } catch (err) {
        console.warn('Prefetch failed (expected behavior for some networks):', err);
      }
    };

    performPrefetch();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleError);
    };
  }, []);

  if (authLoading && showSplash) return <SplashScreen />;

  return (
    <>
      <Toaster position="top-center" toastOptions={{ style: { background: '#1e293b', color: '#fff', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' } }} />
      <ForceRefresh />
      <InstallPWAPrompt />
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <PageTransition>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/classificacao" element={<Standings />} />
              <Route path="/rankings" element={<Rankings />} />
              <Route path="/equipes" element={<Teams />} />
              <Route path="/jogadores" element={<Players />} />
              <Route path="/equipes/:teamId" element={<Players />} />
              <Route path="/central-da-partida" element={<MatchCenter />} />
              <Route path="/jogos" element={<Brackets />} />
              <Route path="/galeria" element={<Gallery />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </PageTransition>
        </Suspense>
      </Layout>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Router>
            <AppContent />
          </Router>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
