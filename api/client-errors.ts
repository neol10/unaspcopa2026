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
const SUPABASE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');

const json = (res: VercelResponse, status: number, body: unknown) => res.status(status).json(body);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json(res, 500, {
      error: 'Missing Supabase config',
      hint: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel project env',
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    if (req.method === 'GET') {
      const limit = Math.min(Number(req.query.limit || 50) || 50, 100);
      const { data, error } = await supabase
        .from('client_errors')
        .select('id, created_at, source, message, stack, path, user_agent, app_version, extra')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return json(res, 200, { data: data || [] });
    }

    if (req.method === 'POST') {
      const payload = Array.isArray(req.body) ? req.body : req.body?.batch;
      if (!Array.isArray(payload)) return json(res, 400, { error: 'batch required' });
      if (payload.length === 0) return json(res, 200, { data: [] });

      const batch = payload.slice(0, 10).map((item) => ({
        source: String(item?.source || 'unknown'),
        message: String(item?.message || 'Erro desconhecido'),
        stack: item?.stack ?? null,
        path: item?.path ?? null,
        user_agent: item?.user_agent ?? null,
        app_version: item?.app_version ?? null,
        extra: item?.extra ?? null,
      }));

      const { error } = await supabase.from('client_errors').insert(batch);
      if (error) throw error;
      return json(res, 200, { ok: true, inserted: batch.length });
    }

    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('client-errors error:', err);
    return json(res, 500, { error: msg });
  }
}
