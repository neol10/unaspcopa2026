import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

export const usePwaNotifications = () => {
  const recentPushToastRef = useRef<Map<string, number>>(new Map());

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
      if (type === 'gol') {
        playSound('/audio/goal-crowd.mp3', 'https://assets.mixkit.co/active_storage/sfx/2330/2330-preview.mp3', 5000);
        return;
      }
      playSound('https://assets.mixkit.co/active_storage/sfx/2004/2004-preview.mp3');
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_NOTIFICATION') {
        const payload = event.data.payload || {};
        const { title, body, category, teamIds, important, url } = payload;
        const messageKey = `${String(category || 'general')}|${String(title || '')}|${String(body || '')}`;
        const now = Date.now();
        const lastShownAt = recentPushToastRef.current.get(messageKey) || 0;

        if (now - lastShownAt < 8000) return;

        // User preference filtering
        try {
          const rawPrefs = localStorage.getItem('copa_unasp_push_preferences_v1');
          if (rawPrefs) {
            const prefs = JSON.parse(rawPrefs);
            const favTeamId = prefs?.favoriteTeamId;
            
            if (favTeamId && Array.isArray(teamIds) && teamIds.length > 0 && !important) {
              if (!teamIds.includes(favTeamId)) return;
            }
          }
        } catch (e) {
          console.error('Push filter error:', e);
        }

        recentPushToastRef.current.set(messageKey, now);
        
        // Dynamic effects
        if (category === 'gol') {
          triggerConfetti();
          playNotificationSound('gol');
        } else {
          playNotificationSound('info');
        }

        toast((t) => (
          <div 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '4px', 
              cursor: url ? 'pointer' : 'default',
              minWidth: '200px'
            }}
            onClick={() => {
              if (url) {
                window.location.href = url;
                toast.dismiss(t.id);
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
        });
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, []);
};
