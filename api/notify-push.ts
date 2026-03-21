import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import type { PushSubscription } from 'web-push';
import { createClient } from '@supabase/supabase-js';

const readEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
};

const readEnvList = (...keys: string[]) => {
  const values = keys
    .map((key) => process.env[key]?.trim() || '')
    .filter(Boolean);
  return Array.from(new Set(values));
};

const SUPABASE_URL = readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = readEnv(
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_KEY',
  'SERVICE_ROLE_KEY',
);
const SUPABASE_ANON_KEY = readEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_KEYS = readEnvList(
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_KEY',
  'SERVICE_ROLE_KEY',
);

const VAPID_PUBLIC_KEY = readEnv('VAPID_PUBLIC_KEY', 'VITE_VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = readEnv('VAPID_PRIVATE_KEY');

const ICON_URL =
  process.env.PUSH_ICON_URL ??
  'https://etxqacjtqleucpkhvyhg.supabase.co/storage/v1/object/public/assets/favicon.png';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

let vapidConfigured = false;
const ensureVapid = () => {
  if (vapidConfigured) return;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error('Missing VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY');
  }
  webpush.setVapidDetails('mailto:desenvolvimento@unasp.edu.br', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
};

const getUsableSupabaseKeys = () => {
  const keys: string[] = [];
  keys.push(...SUPABASE_SERVICE_KEYS);
  if (SUPABASE_ANON_KEY) keys.push(SUPABASE_ANON_KEY);
  return Array.from(new Set(keys));
};

const validateSupabaseEnv = () => {
  if (!SUPABASE_URL || (!SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_ANON_KEY)) {
    return 'Missing SUPABASE_URL and keys (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY)';
  }

  try {
    const parsed = new URL(SUPABASE_URL);
    if (!parsed.hostname.includes('supabase.co')) {
      return 'SUPABASE_URL is not a valid supabase.co URL';
    }
  } catch {
    return 'SUPABASE_URL is invalid';
  }

  if (getUsableSupabaseKeys().length === 0) {
    return 'No Supabase key detected for notify-push endpoint';
  }

  return null;
};

const isInvalidApiKeyError = (err: unknown) => {
  const raw = err as { message?: unknown; details?: unknown; code?: unknown };
  const message = typeof raw?.message === 'string' ? raw.message.toLowerCase() : '';
  const details = typeof raw?.details === 'string' ? raw.details.toLowerCase() : '';
  const code = typeof raw?.code === 'string' ? raw.code.toLowerCase() : '';
  return message.includes('invalid api key') || details.includes('invalid api key') || code.includes('apikey');
};

type SubscriptionRow = {
  subscription: PushSubscription & {
    preferences?: {
      categories?: Record<string, boolean>;
      onlyImportant?: boolean;
      favoriteTeamId?: string | null;
      preGameReminder?: boolean;
    };
  };
};

type NotifyPayload = {
  title: string;
  body: string;
  url?: string;
  category?: string;
  important?: boolean;
  teamIds?: string[];
};

const shouldReceiveNotification = (
  row: SubscriptionRow,
  payload: NotifyPayload,
): boolean => {
  const prefs = row.subscription?.preferences;
  if (!prefs) return true;

  if (prefs.onlyImportant && !payload.important) return false;

  if (payload.category && prefs.categories && prefs.categories[payload.category] === false) {
    return false;
  }

  const favorite = prefs.favoriteTeamId;
  if (!favorite || !Array.isArray(payload.teamIds) || payload.teamIds.length === 0) return true;

  return payload.teamIds.includes(favorite);
};

type WebPushErrorLike = {
  statusCode?: number;
  message?: string;
};

const getErrorInfo = (err: unknown): { statusCode?: number; message: string } => {
  if (err && typeof err === 'object') {
    const e = err as WebPushErrorLike;
    return {
      statusCode: typeof e.statusCode === 'number' ? e.statusCode : undefined,
      message: typeof e.message === 'string' ? e.message : String(err),
    };
  }
  return { message: String(err) };
};

const getBase64UrlByteLength = (value: string) => {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, 'base64').length;
  } catch {
    return -1;
  }
};

const getSubscriptionEndpoint = (subscription: unknown) => {
  if (!subscription || typeof subscription !== 'object') return '';
  const endpoint = (subscription as { endpoint?: unknown }).endpoint;
  return typeof endpoint === 'string' ? endpoint : '';
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']).setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']).setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']).send('ok');
  }

  if (req.method !== 'POST') {
    return res
      .status(405)
      .setHeader('Allow', 'POST, OPTIONS')
      .json({ error: 'Method Not Allowed' });
  }

  try {
    ensureVapid();

    const envValidationError = validateSupabaseEnv();
    if (envValidationError) {
      return res.status(500).json({ error: envValidationError });
    }

    const { title, body, url, category, important, teamIds } =
      ((typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {}) as NotifyPayload;

    if (!title || !body) {
      return res.status(400).json({ error: 'Missing title/body' });
    }

    const keysToTry = getUsableSupabaseKeys();

    let supabaseAdmin: ReturnType<typeof createClient> | null = null;
    let subscriptions: SubscriptionRow[] | null = null;
    let lastKeyError: unknown = null;

    for (const key of keysToTry) {
      const candidateClient = createClient(SUPABASE_URL, key);
      const { data, error } = await candidateClient
        .from('push_subscriptions')
        .select('subscription');

      if (!error) {
        supabaseAdmin = candidateClient;
        subscriptions = (data as SubscriptionRow[]) || [];
        break;
      }

      lastKeyError = error;
      if (!isInvalidApiKeyError(error)) throw error;
    }

    if (!supabaseAdmin) {
      throw lastKeyError || new Error('Unable to access push_subscriptions with configured Supabase keys');
    }

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ message: 'No subscriptions found', results: [] });
    }

    const payload = JSON.stringify({
      title,
      body,
      url: url || '/',
      icon: ICON_URL,
      category: category || 'general',
      important: Boolean(important),
    });

    const validSubscriptions = (subscriptions as SubscriptionRow[]).filter((row) =>
      isValidPushSubscription(row?.subscription),
    );

    const malformedEndpoints = (subscriptions as SubscriptionRow[])
      .map((row) => getSubscriptionEndpoint(row?.subscription))
      .filter((endpoint, index, list) => endpoint && !isValidPushSubscription((subscriptions as SubscriptionRow[])[index]?.subscription) && list.indexOf(endpoint) === index);

    if (malformedEndpoints.length > 0) {
      await Promise.all(
        malformedEndpoints.map((endpoint) =>
          supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('subscription->>endpoint', endpoint),
        ),
      );
    }

    const eligibleSubscriptions = validSubscriptions.filter((row) =>
      shouldReceiveNotification(row, { title, body, url, category, important, teamIds }),
    );

    if (eligibleSubscriptions.length === 0) {
      return res
        .status(200)
        .setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin'])
        .json({ message: 'No eligible subscriptions for this notification', results: [] });
    }

    const results = await Promise.all(
      eligibleSubscriptions.map(async (row) => {
        try {
          await webpush.sendNotification(row.subscription, payload);
          return { success: true };
        } catch (err: unknown) {
          const { statusCode, message } = getErrorInfo(err);
          const lowerMessage = String(message || '').toLowerCase();

          const shouldDeleteSubscription =
            statusCode === 410 ||
            statusCode === 404 ||
            statusCode === 403 ||
            lowerMessage.includes('p256dh value should be 65 bytes long') ||
            lowerMessage.includes('auth value should be 16 bytes long') ||
            lowerMessage.includes('subscription endpoint is required');

          if (shouldDeleteSubscription) {
            const endpoint = row?.subscription?.endpoint;
            if (endpoint) {
              await supabaseAdmin
                .from('push_subscriptions')
                .delete()
                .eq('subscription->>endpoint', endpoint);
            }
          }

          return { success: false, error: message, statusCode };
        }
      }),
    );

    return res.status(200).setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']).json({ results });
  } catch (err: unknown) {
    const { message } = getErrorInfo(err);
    return res.status(500).json({ error: message });
  }
}
