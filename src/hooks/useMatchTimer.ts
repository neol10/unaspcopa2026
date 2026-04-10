import { useState, useEffect } from 'react';

interface MatchTimingInfo {
  status: string;
  is_timer_running?: boolean;
  timer_started_at?: string | null;
  timer_offset_seconds: number;
}

export const useMatchTimer = (match: MatchTimingInfo | null | undefined) => {
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!match) {
      setElapsedTime('00:00');
      return;
    }

    const updateTimer = () => {
      if (match.status === 'ao_vivo') {
        if (match.is_timer_running && match.timer_started_at) {
          const start = new Date(match.timer_started_at).getTime();
          const now = Date.now();
          const diff = Math.floor((now - start) / 1000);
          const totalSeconds = (match.timer_offset_seconds || 0) + diff;
          
          const mins = Math.floor(totalSeconds / 60);
          const secs = totalSeconds % 60;
          setElapsedTime(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
          setIsPaused(false);
        } else {
          const totalSeconds = match.timer_offset_seconds || 0;
          const mins = Math.floor(totalSeconds / 60);
          const secs = totalSeconds % 60;
          setElapsedTime(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
          setIsPaused(true);
        }
      } else if (match.status === 'finalizado') {
        setElapsedTime('Fim');
        setIsPaused(false);
      } else {
        setElapsedTime('Pré-jogo');
        setIsPaused(false);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [match?.id, match?.status, match?.is_timer_running, match?.timer_started_at, match?.timer_offset_seconds]);

  return { elapsedTime, isPaused };
};
