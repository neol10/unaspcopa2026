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
  subscription: PushSubscription & {
    preferences?: {
      preGameReminder?: boolean;
      favoriteTeamId?: string | null;
      division?: 'masculino' | 'feminino';
    };
  };
};

type SubscriptionRowLegacy = {
  subscription?: unknown;
  preferences?: {
    preGameReminder?: boolean;
    favoriteTeamId?: string | null;
    division?: 'masculino' | 'feminino';
  } | null;
  endpoint?: string | null;
  p256dh?: string | null;
  auth?: string | null;
};

type MatchRow = {
  id: string;
  match_date: string;
  team_a_id: string;
  team_b_id: string;
  division?: 'masculino' | 'feminino' | null;
  teams_a?: { name: string } | null;
  teams_b?: { name: string } | null;
};

const normalizeDivision = (value: unknown): 'masculino' | 'feminino' | null => {
  if (value === 'feminino') return 'feminino';
  if (value === 'masculino') return 'masculino';
  return null;
};

const getErrorMessage = (err: unknown) => {
  if (err && typeof err === 'object') {
    const maybe = err as { message?: unknown };
    if (typeof maybe.message === 'string') return maybe.message;
  }
  return String(err);
};

const isSchemaCompatibilityError = (err: unknown) => {
  const msg = getErrorMessage(err).toLowerCase();
  return (
    msg.includes('column') ||
    msg.includes('does not exist') ||
    msg.includes('operator does not exist') ||
    msg.includes('failed to parse') ||
    msg.includes('invalid input syntax')
  );
};

const selectUpcomingMatchesAdaptive = async (
  supabase: ReturnType<typeof createClient>,
  windowStart: string,
  windowEnd: string,
) => {
  const base = supabase
    .from('matches')
    .eq('status', 'agendado')
    .gte('match_date', windowStart)
    .lte('match_date', windowEnd);

  const selectWithDivision =
    'id, match_date, team_a_id, team_b_id, division, teams_a:teams!team_a_id(name), teams_b:teams!team_b_id(name)';
  const selectLegacy = 'id, match_date, team_a_id, team_b_id, teams_a:teams!team_a_id(name), teams_b:teams!team_b_id(name)';

  const withDivision = await base.select(selectWithDivision);
  if (!withDivision.error) return withDivision;
  if (!isSchemaCompatibilityError(withDivision.error)) return withDivision;

  return await base.select(selectLegacy);
};

const getBase64UrlByteLength = (value: string) => {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const base64 = `${normalized}${padding}`;

    const anyGlobal = globalThis as unknown as { Buffer?: { from?: (input: string, encoding: string) => { length: number } } };
    if (anyGlobal.Buffer?.from) {
      return anyGlobal.Buffer.from(base64, 'base64').length;
    }

    const anyAtob = globalThis as unknown as { atob?: (input: string) => string };
    if (typeof anyAtob.atob === 'function') {
      return anyAtob.atob(base64).length;
    }

    return -1;
  } catch {
    return -1;
  }
};

const isValidPushSubscription = (subscription: unknown) => {
  if (!subscription || typeof subscription !== 'object') return false;
  const s = subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof s.endpoint === 'string' ? s.endpoint.trim() : '';
  const p256dh = typeof s.keys?.p256dh === 'string' ? s.keys.p256dh.trim() : '';
  const auth = typeof s.keys?.auth === 'string' ? s.keys.auth.trim() : '';
  if (!endpoint || !p256dh || !auth) return false;
  return getBase64UrlByteLength(p256dh) === 65 && getBase64UrlByteLength(auth) === 16;
};

const normalizeSubscriptionRow = (row: SubscriptionRowLegacy): SubscriptionRow | null => {
  if (!row) return null;

  let subObj = row.subscription;
  if (typeof subObj === 'string') {
    try {
      subObj = JSON.parse(subObj);
    } catch {
      // ignore
    }
  }

  const prefsFromColumn = (row.preferences || undefined) as SubscriptionRow['subscription']['preferences'];

  if (subObj && typeof subObj === 'object') {
    const s = subObj as { endpoint?: string; keys?: { p256dh?: string; auth?: string }; preferences?: unknown };
    const reconstructed = {
      endpoint: s.endpoint,
      keys: s.keys,
      preferences: (s.preferences as any) || prefsFromColumn,
    } as unknown as SubscriptionRow['subscription'];

    if (isValidPushSubscription(reconstructed)) {
      if (!reconstructed.preferences && prefsFromColumn) {
        reconstructed.preferences = prefsFromColumn;
      }
      return { subscription: reconstructed };
    }
  }

  const endpoint = typeof row.endpoint === 'string' ? row.endpoint.trim() : '';
  const p256dh = typeof row.p256dh === 'string' ? row.p256dh.trim() : '';
  const auth = typeof row.auth === 'string' ? row.auth.trim() : '';
  if (!endpoint || !p256dh || !auth) return null;

  const reconstructed = {
    endpoint,
    keys: { p256dh, auth },
    preferences: prefsFromColumn,
  } as unknown as SubscriptionRow['subscription'];
  if (!isValidPushSubscription(reconstructed)) return null;
  return { subscription: reconstructed };
};

const selectSubscriptionsAdaptive = async (supabase: ReturnType<typeof createClient>) => {
  const queries = [
    'subscription',
    'subscription, preferences',
    'endpoint, p256dh, auth, preferences',
    'endpoint, p256dh, auth',
  ];

  let lastError: unknown = null;
  for (const query of queries) {
    const { data, error } = await supabase.from('push_subscriptions').select(query);
    if (!error) {
      const normalized = ((data as SubscriptionRowLegacy[]) || [])
        .map((row) => normalizeSubscriptionRow(row))
        .filter((row): row is SubscriptionRow => Boolean(row));
      return { data: normalized, error: null as unknown };
    }
    lastError = error;
    if (!isSchemaCompatibilityError(error)) return { data: null, error };
  }

  return { data: null, error: lastError };
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

  // --- Security Check: Cron Secret ---
  const cronSecret = process.env.CRON_SECRET || process.env.VITE_CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid CRON_SECRET' });
    }
  }

  try {
    ensureVapid();

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Find matches starting in the next 15-20 minutes (window to catch the cron)
    const now = new Date();
    const windowStart = new Date(now.getTime() + 14 * 60 * 1000).toISOString();
    const windowEnd = new Date(now.getTime() + 20 * 60 * 1000).toISOString();

    const { data: upcomingMatches, error: matchError } = await selectUpcomingMatchesAdaptive(
      supabase,
      windowStart,
      windowEnd,
    );

    if (matchError) throw matchError;

    if (!upcomingMatches || upcomingMatches.length === 0) {
      return res.status(200).json({ message: 'No upcoming matches in window', notified: 0 });
    }

    const { data: subs, error: subsError } = await selectSubscriptionsAdaptive(supabase);

    if (subsError) throw subsError;
    if (!subs || subs.length === 0) return res.status(200).json({ message: 'No subscriptions', notified: 0 });

    let totalNotified = 0;

    for (const match of upcomingMatches as MatchRow[]) {
      const teamA = match.teams_a?.name ?? 'Time A';
      const teamB = match.teams_b?.name ?? 'Time B';
      const matchTime = new Date(match.match_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      const matchDivision = normalizeDivision(match.division) || 'masculino';

      const payload = JSON.stringify({
        title: '⚽ Jogo começa em 15 min!',
        body: `${teamA} x ${teamB} às ${matchTime}`,
        url: '/central-da-partida',
        icon: ICON_URL,
        category: 'pregame',
        important: true,
        teamIds: [match.team_a_id, match.team_b_id],
        division: matchDivision,
      });

      const notifyPromises = (subs as SubscriptionRow[]).map(async (row) => {
        const sub = row.subscription;
        const prefs = sub?.preferences;
        // Honor preGameReminder preference (default: true)
        if (prefs?.preGameReminder === false) return;

        const subscriptionDivision = normalizeDivision(prefs?.division) || 'masculino';
        if (subscriptionDivision !== matchDivision) return;

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
