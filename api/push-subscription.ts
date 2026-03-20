import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
};

const readEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
};

const SUPABASE_URL = readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = readEnv(
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
);
const SUPABASE_ANON_KEY = readEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');

const isLikelyJwt = (value: string) => value.split('.').length === 3;

const getUsableSupabaseKeys = () => {
  const rawKeys = [SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY].filter(Boolean) as string[];
  return Array.from(new Set(rawKeys)).filter((key) => isLikelyJwt(key));
};

const getPayload = (req: VercelRequest): Record<string, unknown> => {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (req.body || {}) as Record<string, unknown>;
};

const getErrorMessage = (err: unknown) => {
  if (err && typeof err === 'object') {
    const maybe = err as { message?: unknown };
    if (typeof maybe.message === 'string') return maybe.message;
  }
  return String(err);
};

const isInvalidApiKeyError = (err: unknown) => {
  const raw = err as { message?: unknown; details?: unknown; code?: unknown };
  const message = typeof raw?.message === 'string' ? raw.message.toLowerCase() : '';
  const details = typeof raw?.details === 'string' ? raw.details.toLowerCase() : '';
  const code = typeof raw?.code === 'string' ? raw.code.toLowerCase() : '';
  return message.includes('invalid api key') || details.includes('invalid api key') || code.includes('apikey');
};

type DbErrorShape = {
  message?: string;
  details?: string;
  code?: string;
} | null;

type DbResult = {
  error: DbErrorShape;
};

type PushSubscriptionsTable = {
  delete: () => {
    eq: (column: string, value: string) => Promise<DbResult>;
  };
  insert: (values: Record<string, unknown>) => Promise<DbResult>;
};

type SupabaseLikeClient = {
  from: (table: string) => PushSubscriptionsTable;
};

const withSupabaseClient = async <T>(fn: (client: SupabaseLikeClient) => Promise<T>) => {
  if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL');

  const keysToTry = getUsableSupabaseKeys();
  if (keysToTry.length === 0) throw new Error('No valid Supabase key available for push-subscription API');

  let lastError: unknown = null;
  for (const key of keysToTry) {
    const client = createClient(SUPABASE_URL, key) as unknown as SupabaseLikeClient;
    try {
      return await fn(client);
    } catch (err) {
      lastError = err;
      if (!isInvalidApiKeyError(err)) throw err;
    }
  }

  throw lastError || new Error('Unable to create Supabase client');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res
      .status(200)
      .setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin'])
      .setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers'])
      .setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods'])
      .send('ok');
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res
      .status(405)
      .setHeader('Allow', 'POST, DELETE, OPTIONS')
      .json({ error: 'Method Not Allowed' });
  }

  const payload = getPayload(req);

  try {
    if (req.method === 'DELETE') {
      const endpoint = typeof payload.endpoint === 'string' ? payload.endpoint : '';
      if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

      await withSupabaseClient(async (client) => {
        const { error } = await client
          .from('push_subscriptions')
          .delete()
          .eq('subscription->>endpoint', endpoint);
        if (error) throw error;
      });

      return res.status(200).setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']).json({ ok: true });
    }

    const subscription = (payload.subscription || null) as Record<string, unknown> | null;
    const endpoint = typeof subscription?.endpoint === 'string' ? subscription.endpoint : '';
    const userId = typeof payload.userId === 'string' ? payload.userId : null;

    if (!endpoint || !subscription) {
      return res.status(400).json({ error: 'Missing valid subscription payload' });
    }

    await withSupabaseClient(async (client) => {
      const { error: delError } = await client
        .from('push_subscriptions')
        .delete()
        .eq('subscription->>endpoint', endpoint);
      if (delError) throw delError;

      const { error: insError } = await client.from('push_subscriptions').insert({
        user_id: userId,
        subscription,
      });
      if (insError) throw insError;
    });

    return res.status(200).setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']).json({ ok: true });
  } catch (err: unknown) {
    return res.status(500).json({ error: getErrorMessage(err) });
  }
}
