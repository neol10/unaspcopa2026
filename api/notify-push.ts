import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import type { PushSubscription } from 'web-push';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';

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

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY' });
    }

    const { title, body, url, category, important, teamIds } =
      ((typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {}) as NotifyPayload;

    if (!title || !body) {
      return res.status(400).json({ error: 'Missing title/body' });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: subscriptions, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('subscription');

    if (error) throw error;

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

    const eligibleSubscriptions = (subscriptions as SubscriptionRow[]).filter((row) =>
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

          if (statusCode === 410 || statusCode === 404) {
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
