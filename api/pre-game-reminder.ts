import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import type { PushSubscription } from 'web-push';
import { createClient } from '@supabase/supabase-js';

// ---------- env helpers ----------
const readEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
};

const SUPABASE_URL = readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
const VAPID_PUBLIC_KEY = readEnv('VAPID_PUBLIC_KEY', 'VITE_VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = readEnv('VAPID_PRIVATE_KEY');

const ICON_URL =
  process.env.PUSH_ICON_URL ??
  'https://etxgacitdleucpkhvyhp.supabase.co/storage/v1/object/public/assets/favicon.png';

// ---------- VAPID setup ----------
let vapidReady = false;
const ensureVapid = () => {
  if (vapidReady) return;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('Missing VAPID keys');
  webpush.setVapidDetails('mailto:desenvolvimento@unasp.edu.br', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidReady = true;
};

type SubscriptionRow = {
  subscription: PushSubscription & { preferences?: { preGameReminder?: boolean; favoriteTeamId?: string | null } };
};

type MatchRow = {
  id: string;
  match_date: string;
  team_a_id: string;
  team_b_id: string;
  teams_a?: { name: string } | null;
  teams_b?: { name: string } | null;
};

/** Vercel Cron: called every minute (configured in vercel.json) */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Accept both GET (cron) and POST (manual trigger)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase config' });
  }

  try {
    ensureVapid();

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Find matches starting in the next 15-20 minutes (window to catch the cron)
    const now = new Date();
    const windowStart = new Date(now.getTime() + 14 * 60 * 1000).toISOString();
    const windowEnd = new Date(now.getTime() + 20 * 60 * 1000).toISOString();

    const { data: upcomingMatches, error: matchError } = await supabase
      .from('matches')
      .select('id, match_date, team_a_id, team_b_id, teams_a:teams!team_a_id(name), teams_b:teams!team_b_id(name)')
      .eq('status', 'agendado')
      .gte('match_date', windowStart)
      .lte('match_date', windowEnd);

    if (matchError) throw matchError;

    if (!upcomingMatches || upcomingMatches.length === 0) {
      return res.status(200).json({ message: 'No upcoming matches in window', notified: 0 });
    }

    // Fetch all push subscriptions
    const { data: subs, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('subscription');

    if (subsError) throw subsError;
    if (!subs || subs.length === 0) return res.status(200).json({ message: 'No subscriptions', notified: 0 });

    let totalNotified = 0;

    for (const match of upcomingMatches as MatchRow[]) {
      const teamA = match.teams_a?.name ?? 'Time A';
      const teamB = match.teams_b?.name ?? 'Time B';
      const matchTime = new Date(match.match_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

      const payload = JSON.stringify({
        title: '⚽ Jogo começa em 15 min!',
        body: `${teamA} x ${teamB} às ${matchTime}`,
        url: '/central-da-partida',
        icon: ICON_URL,
        category: 'pregame',
        important: true,
        teamIds: [match.team_a_id, match.team_b_id],
      });

      const notifyPromises = (subs as SubscriptionRow[]).map(async (row) => {
        let sub = row.subscription;
        if (typeof sub === 'string') {
          try { sub = JSON.parse(sub); } catch { return; }
        }
        const prefs = sub?.preferences;
        // Honor preGameReminder preference (default: true)
        if (prefs?.preGameReminder === false) return;

        // Honor favoriteTeamId filter
        if (prefs?.favoriteTeamId && prefs.favoriteTeamId !== match.team_a_id && prefs.favoriteTeamId !== match.team_b_id) return;

        try {
          await webpush.sendNotification(sub as unknown as PushSubscription, payload);
          totalNotified++;
        } catch {
          // ignore expired subscriptions silently
        }
      });

      await Promise.all(notifyPromises);
    }

    return res.status(200).json({
      message: `Pre-match reminders sent`,
      matches: upcomingMatches.length,
      notified: totalNotified,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
}
