import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import './AutoRefreshStatus.css';

export const AutoRefreshStatus: React.FC = () => {
  const queryClient = useQueryClient();
  const location = useLocation();

  const getIntervalSeconds = (path: string) => {
    if (path.startsWith('/admin')) return 0;
    if (path.startsWith('/central-da-partida')) return 4;
    if (path === '/' || path.startsWith('/jogos')) return 8;
    return 12;
  };

  const intervalSeconds = getIntervalSeconds(location.pathname);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(intervalSeconds || 1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (intervalSeconds <= 0) return;

    let cancelled = false;
    const initTimeout = setTimeout(() => {
      if (!cancelled) setSecondsUntilRefresh(intervalSeconds);
    }, 0);

    const interval = setInterval(() => {
      setSecondsUntilRefresh(prev => {
        return prev <= 1 ? intervalSeconds : prev - 1;
      });
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(initTimeout);
      clearInterval(interval);
    };
  }, [intervalSeconds]);

  if (intervalSeconds <= 0) return null;

  const handleClick = () => {
    setIsRefreshing(true);
    queryClient.refetchQueries().finally(() => {
      setTimeout(() => setIsRefreshing(false), 300);
    });
  };

  return (
    <div 
      className={`auto-refresh-status ${isRefreshing ? 'refreshing' : ''}`} 
      title={`Auto-sincronização a cada ${intervalSeconds}s. Clique para sincronizar agora.`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick()}
    >
      <RefreshCw size={14} className={`refresh-icon ${isRefreshing ? 'spinning' : ''}`} />
      <span className="refresh-text">{secondsUntilRefresh}s</span>
    </div>
  );
};
