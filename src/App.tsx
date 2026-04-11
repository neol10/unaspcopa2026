import React, { Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';

import Layout from './components/Layout/Layout';
import InstallPWAPrompt from './components/InstallPrompt/InstallPWAPrompt';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import SplashScreen from './components/SplashScreen/SplashScreen';

import { TelemetryProvider } from './contexts/TelemetryProvider';
import { AuthProvider, useAuthContext } from './contexts/AuthContext';
import { usePwaLifecycle } from './hooks/usePwaLifecycle';
import { usePwaNotifications } from './hooks/usePwaNotifications';
import { reportPerformanceMetric } from './lib/clientErrors';
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

// Versão da aplicação para controle de cache
const APP_VERSION = '1.0.6';

const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ 
          duration: 0.25, 
          ease: [0.22, 1, 0.36, 1] 
        }}
        style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

function AppContent() {
  const { loading: authLoading } = useAuthContext();
  const [showSplash, setShowSplash] = useState(true);
  const bootMetricSentRef = useRef(false);

  // Initialize PWA Lifecycle and Notifications
  usePwaLifecycle();
  usePwaNotifications();

  useEffect(() => {
    const id = setTimeout(() => setShowSplash(false), 1200);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (authLoading || showSplash) return;
    if (bootMetricSentRef.current) return;

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

    const nav = navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    };

    const connectionType = nav.connection?.effectiveType || '';
    const shouldSkipPrefetch =
      !navigator.onLine ||
      nav.connection?.saveData === true ||
      connectionType.includes('2g');

    if (!shouldSkipPrefetch) {
      const win = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };

      let idleId: number | null = null;
      let timeoutId: number | null = null;

      if (typeof win.requestIdleCallback === 'function') {
        idleId = win.requestIdleCallback(() => {
          void performPrefetch();
        }, { timeout: 2500 });
      } else {
        timeoutId = window.setTimeout(() => {
          void performPrefetch();
        }, 1500);
      }

      return () => {
        if (idleId !== null && typeof win.cancelIdleCallback === 'function') {
          win.cancelIdleCallback(idleId);
        }
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      };
    }
  }, []);

  if (authLoading && showSplash) return <SplashScreen />;

  return (
    <>
      <Toaster position="top-center" toastOptions={{ style: { background: '#1e293b', color: '#fff', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' } }} />
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
          <TelemetryProvider>
            <Router>
              <AppContent />
            </Router>
          </TelemetryProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
