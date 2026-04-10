import { useEffect } from 'react';
import toast from 'react-hot-toast';

export const usePwaLifecycle = () => {
  useEffect(() => {
    // Escuta mudanças na conectividade para feedback offline
    const handleOnline = () => {
      toast.success('Você está online! ✨', { id: 'connectivity' });
    };
    const handleOffline = () => {
      toast.error('Você está offline. Exibindo dados salvos.', { id: 'connectivity', duration: 5000 });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Tratamento global de erros de Chunk/Module (comum em PWAs após novo deploy)
    const handleChunkError = (e: ErrorEvent) => {
      const msg = e.message || '';
      if (msg.includes('Loading chunk') || msg.includes('Failed to fetch dynamically imported module')) {
        toast.error('Nova versão disponível! Atualizando...', { duration: 3000 });
        setTimeout(() => window.location.reload(), 2000);
      }
    };

    window.addEventListener('error', handleChunkError);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('error', handleChunkError);
    };
  }, []);

  // Versão da aplicação e Force Refresh Logic
  useEffect(() => {
    const APP_VERSION = '1.0.6';
    const currentVersion = localStorage.getItem('app_version');

    if (currentVersion && currentVersion !== APP_VERSION) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
        });
      }
      
      // Limpa caches específicos (preservando auth)
      const keysToClear = [
        'copa_unasp_cache_matches_all',
        'copa_unasp_cache_news_3',
        'standings_cache_v1'
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
    } else if (!currentVersion) {
      localStorage.setItem('app_version', APP_VERSION);
    }
  }, []);
};
