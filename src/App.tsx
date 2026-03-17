import React, { useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Layout from './components/Layout/Layout';
import { AuthProvider } from './contexts/AuthContext';
import { Toaster, toast } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './components/Layout/Layout.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos de cache em memória
      refetchOnWindowFocus: true,
      retry: 2,
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
    // Versão da aplicação para controle de cache
    const APP_VERSION = '1.0.4';
    const currentVersion = localStorage.getItem('app_version');

    if (currentVersion !== APP_VERSION) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
          for (let registration of registrations) {
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

function App() {
  useEffect(() => {
    // Escuta mudanças na conectividade para feedback offline
    const handleOnline = () => toast.success('Você está online! ✨', { id: 'connectivity' });
    const handleOffline = () => toast.error('Você está offline. Exibindo dados salvos.', { id: 'connectivity', duration: 5000 });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Prefetch de dados críticos para navegação instantânea
    queryClient.prefetchQuery({
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
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Toaster position="top-center" toastOptions={{ style: { background: '#1e293b', color: '#fff', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' } }} />
        <ForceRefresh />
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
      </Router>
    </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
