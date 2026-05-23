import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const readEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
};

const SUPABASE_URL = readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE');

const json = (res: VercelResponse, status: number, body: unknown) => res.status(status).json(body);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });
  const NO_SUPABASE = !SUPABASE_URL || !SUPABASE_KEY;
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const event = String((body as any).event || '').trim() || 'fallback_event';
  const details = (body as any).details || {};

  try {
    if (NO_SUPABASE) {
      // best-effort: just log and return success so client doesn't fail
      // eslint-disable-next-line no-console
      console.warn('logging/fallback: supabase not configured, payload:', event, details);
      return json(res, 200, { ok: true });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    try {
      await supabase.from('fallback_logs').insert([{ event, details: JSON.stringify(details), created_at: new Date().toISOString() }]);
    } catch (e) {
      // swallow logging errors
      // eslint-disable-next-line no-console
      console.error('logging/fallback insert failed', e);
    }

    return json(res, 200, { ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('logging/fallback handler error', err);
    return json(res, 500, { error: 'internal' });
  }
}
