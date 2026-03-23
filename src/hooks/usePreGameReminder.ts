import { useEffect } from 'react';
import type { Match } from './useMatches';

type ReminderPreferences = {
  preGameReminder: boolean;
  favoriteTeamId: string | null;
};

const PRE_GAME_WINDOW_MS = 15 * 60 * 1000;
const TICK_MS = 30 * 1000;

const reminderKey = (match: Match) => {
  return `copa_unasp_reminder_${match.id}_${new Date(match.match_date).toISOString()}`;
};

const markReminded = (match: Match) => {
  try {
    localStorage.setItem(reminderKey(match), String(Date.now()));
  } catch {
    // ignore
  }
};

const alreadyReminded = (match: Match) => {
  try {
    return Boolean(localStorage.getItem(reminderKey(match)));
  } catch {
    return false;
  }
};

const canRemindForMatch = (match: Match, favoriteTeamId: string | null) => {
  if (match.status !== 'agendado') return false;
  if (!favoriteTeamId) return true;
  return match.team_a_id === favoriteTeamId || match.team_b_id === favoriteTeamId;
};

export const usePreGameReminder = (
  matches: Match[],
  enabled: boolean,
  preferences: ReminderPreferences,
) => {
  useEffect(() => {
    if (!enabled) return;
    if (!preferences.preGameReminder) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;

    const checkReminders = async () => {
      const now = Date.now();
      const candidates = matches.filter((match) => {
        if (!canRemindForMatch(match, preferences.favoriteTeamId)) return false;
        if (alreadyReminded(match)) return false;

        const startAt = new Date(match.match_date).getTime();
        if (Number.isNaN(startAt)) return false;

        const diff = startAt - now;
        return diff > 0 && diff <= PRE_GAME_WINDOW_MS;
      });

      if (candidates.length === 0) return;

      const registration = await navigator.serviceWorker.ready;
      for (const match of candidates) {
        if (cancelled) return;

        const teamA = match.teams_a?.name || 'Equipe A';
        const teamB = match.teams_b?.name || 'Equipe B';

        await registration.showNotification('⏰ Jogo em 15 minutos', {
          body: `${teamA} x ${teamB} começa em breve.`,
          icon: new URL('/icon-192.png', window.location.origin).href,
          badge: new URL('/favicon.svg', window.location.origin).href,
          tag: `pregame-${match.id}`,
          renotify: true,
          data: { url: '/jogos' },
          actions: [{ action: 'open', title: 'Ver jogos' }],
        } as any);

        markReminded(match);
      }
    };

    void checkReminders();
    const timer = window.setInterval(() => {
      void checkReminders();
    }, TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [matches, enabled, preferences.preGameReminder, preferences.favoriteTeamId]);
};
