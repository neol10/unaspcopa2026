import { useEffect, useMemo, useState } from 'react';
import { deriveMatchStatus } from '../lib/matchStatus';

interface MatchTimingInfo {
  id?: string;
  status: string;
  match_date?: string | null;
  is_timer_running?: boolean;
  timer_started_at?: string | null;
  timer_offset_seconds: number;
}

export const useMatchTimer = (match: MatchTimingInfo | null | undefined) => {
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    if (!match) return;

    let cancelled = false;
    // Evita setState síncrono no corpo do effect (lint performance).
    queueMicrotask(() => {
      if (cancelled) return;
      setNowMs(Date.now());
    });

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [match]);

  return useMemo(() => {
    if (!match) return { elapsedTime: '00:00', isPaused: false };

    const effectiveStatus = deriveMatchStatus(match, nowMs);

    if (effectiveStatus === 'ao_vivo') {
      if (match.is_timer_running && match.timer_started_at) {
        const start = new Date(match.timer_started_at).getTime();
        const diff = Math.floor((nowMs - start) / 1000);
        const totalSeconds = (match.timer_offset_seconds || 0) + Math.max(0, diff);

        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return {
          elapsedTime: `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`,
          isPaused: false,
        };
      }

      const totalSeconds = match.timer_offset_seconds || 0;
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return {
        elapsedTime: `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`,
        isPaused: true,
      };
    }

    if (effectiveStatus === 'finalizado') {
      return { elapsedTime: 'Fim', isPaused: false };
    }

    return { elapsedTime: 'Pré-jogo', isPaused: false };
  }, [match, nowMs]);
};
