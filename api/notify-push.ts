import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
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

    const { title, body, url } = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};

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
    });

    const results = await Promise.all(
      subscriptions.map(async (row: any) => {
        try {
          await webpush.sendNotification(row.subscription, payload);
          return { success: true };
        } catch (err: any) {
          const statusCode = err?.statusCode;
          const message = err?.message || String(err);

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
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
