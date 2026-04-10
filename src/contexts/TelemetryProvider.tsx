import React, { useEffect, useRef } from 'react';
import { flushClientErrorQueue, reportErrorFromWindowEvent, reportPerformanceMetric } from '../lib/clientErrors';
import { useAuthContext } from './AuthContext';

interface TelemetryProviderProps {
  children: React.ReactNode;
}

export const TelemetryProvider: React.FC<TelemetryProviderProps> = ({ children }) => {
  const { loading: authLoading } = useAuthContext();
  const bootMetricSentRef = useRef(false);

  useEffect(() => {
    // Escuta erros globais da janela
    window.addEventListener('error', (e) => reportErrorFromWindowEvent(e, 'window_error'));
    window.addEventListener('unhandledrejection', (e) => reportErrorFromWindowEvent(e, 'unhandled_rejection'));

    // Tenta enviar erros pendentes no boot
    flushClientErrorQueue();

    return () => {
      // Cleanup (embora este provider geralmente viva por toda a sessão)
      window.removeEventListener('error', (e) => reportErrorFromWindowEvent(e, 'window_error'));
      window.removeEventListener('unhandledrejection', (e) => reportErrorFromWindowEvent(e, 'unhandled_rejection'));
    };
  }, []);

  // Performance Reporting: App Boot Ready
  useEffect(() => {
    if (bootMetricSentRef.current || authLoading) return;

    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const navStart = navEntry?.startTime ?? 0;
    const now = performance.now();
    const bootMs = Math.max(0, now - navStart);

    reportPerformanceMetric('app_boot_ready', bootMs, {
      route: window.location.pathname,
    });
    bootMetricSentRef.current = true;
  }, [authLoading]);

  // Performance Reporting: Web Vitals (Simple Observer)
  useEffect(() => {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    let lcp = 0;
    let cls = 0;

    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      lcp = last.startTime;
    });
    
    try {
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch { /* ignore */ }

    const reportVitals = () => {
      if (lcp > 0) reportPerformanceMetric('lcp', lcp, { route: window.location.pathname });
    };

    window.addEventListener('pagehide', reportVitals);
    return () => {
      lcpObserver.disconnect();
      window.removeEventListener('pagehide', reportVitals);
    };
  }, []);

  return <>{children}</>;
};
