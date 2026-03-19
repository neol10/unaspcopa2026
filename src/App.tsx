import React, { useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Layout from './components/Layout/Layout';
import { AuthProvider } from './contexts/AuthContext';
import { Toaster, toast } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './components/Layout/Layout.css';
import { flushClientErrorQueue, reportErrorFromWindowEvent } from './lib/clientErrors';

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
          if (path.startsWith('/central-da-partida')) return 1000 * 4;
          if (path === '/' || path.startsWith('/jogos')) return 1000 * 8;
          return 1000 * 12;
        }
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          return false;
        }
        return 1000 * 8;
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
const Admin = React.lazy(() => import('./pages/Admin/Admin'));

const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: '1rem' }}>
    <div className="spinner" style={{ width: 40, height: 40, border: '3px solid rgba(255,215,0,0.2)', borderTop: '3px solid #FFD700', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Carregando...</p>
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
    const APP_VERSION = '1.0.4';
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
      // Não limpar o localStorage completo pois apaga o token de sessão do Supabase!
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
      console.error('Global Error Caught:', e);
      reportErrorFromWindowEvent(e, 'window');
      const evt = e as { message?: unknown; reason?: unknown };
      const reason = evt?.reason as { message?: unknown } | undefined;
      const msg = String(evt?.message ?? reason?.message ?? '');
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
            const { data, error } = await (await import('./lib/supabase')).supabase
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

  if (authLoading) return <SplashScreen />;

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
