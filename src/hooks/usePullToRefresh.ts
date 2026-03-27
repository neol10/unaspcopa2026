import { useEffect, useRef, useState, useCallback } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

export function usePullToRefresh({ onRefresh, threshold = 70, disabled = false }: UsePullToRefreshOptions) {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const startYRef = useRef<number | null>(null);
  const isAtTopRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Refs para capturar os valores mais recentes sem invalidar os listeners
  const onRefreshRef = useRef(onRefresh);
  const isRefreshingRef = useRef(isRefreshing);
  const isPullingRef = useRef(isPulling);
  const pullDistanceRef = useRef(pullDistance);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
    isRefreshingRef.current = isRefreshing;
    isPullingRef.current = isPulling;
    pullDistanceRef.current = pullDistance;
  }, [onRefresh, isRefreshing, isPulling, pullDistance]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshingRef.current) return;
    const scrollTop = containerRef.current?.scrollTop ?? window.scrollY;
    const atTop = scrollTop <= 0;
    isAtTopRef.current = atTop;
    if (atTop) {
      startYRef.current = e.touches[0].clientY;
    } else {
      startYRef.current = null;
    }
  }, [disabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (startYRef.current === null || disabled || isRefreshingRef.current) return;
    if (!isAtTopRef.current) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, threshold * 1.5));
      setIsPulling(true);
      // Prevent default only when the user is clearly pulling down from the very top.
      if (delta > 16) e.preventDefault();
    }
  }, [disabled, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current) return;
    if (pullDistanceRef.current >= threshold) {
      setIsRefreshing(true);
      setPullDistance(threshold);
      try {
        await onRefreshRef.current();
      } finally {
        setIsRefreshing(false);
      }
    }
    setIsPulling(false);
    setPullDistance(0);
    startYRef.current = null;
    isAtTopRef.current = false;
  }, [threshold]);

  useEffect(() => {
    const el = containerRef.current ?? window;
    el.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true });
    el.addEventListener('touchmove', handleTouchMove as EventListener, { passive: false });
    el.addEventListener('touchend', handleTouchEnd as EventListener);
    return () => {
      el.removeEventListener('touchstart', handleTouchStart as EventListener);
      el.removeEventListener('touchmove', handleTouchMove as EventListener);
      el.removeEventListener('touchend', handleTouchEnd as EventListener);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { containerRef, isPulling, pullDistance, isRefreshing, threshold };
}
