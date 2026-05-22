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

const parseOptions = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json(res, 503, {
      error: 'Missing Supabase config',
      hint: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel project env',
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const body = req.body || {};
    const pollId = String(body.pollId || body.poll_id || '').trim();
    const optionId = String(body.optionId || body.option_id || '').trim();

    if (!pollId || !optionId) {
      return json(res, 400, { error: 'pollId and optionId required' });
    }

    const { error: rpcError } = await supabase.rpc('increment_poll_vote', {
      poll_id_param: pollId,
      option_id_param: optionId,
    });

    if (!rpcError) {
      return json(res, 200, { ok: true, method: 'rpc' });
    }

    console.warn('polls: rpc increment_poll_vote failed, falling back to row update', rpcError);

    const { data: pollRow, error: fetchError } = await supabase
      .from('polls')
      .select('id, options')
      .eq('id', pollId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!pollRow) return json(res, 404, { error: 'Poll not found' });

    const options = parseOptions((pollRow as { options?: unknown }).options).map((option, index) => {
      if (!option || typeof option !== 'object') return option;
      const candidate = option as { id?: unknown; votes?: unknown };
      const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : `opt_${index}`;
      const votes = Number(candidate.votes || 0);
      if (id !== optionId) {
        return { ...option, id, votes: Number.isFinite(votes) ? votes : 0 };
      }
      return { ...option, id, votes: (Number.isFinite(votes) ? votes : 0) + 1 };
    });

    const { error: updateError } = await supabase
      .from('polls')
      .update({ options })
      .eq('id', pollId);

    if (updateError) throw updateError;

    return json(res, 200, { ok: true, method: 'row-update' });
  } catch (err: unknown) {
    const raw = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message = typeof raw?.message === 'string' ? raw.message : (err instanceof Error ? err.message : String(err));
    const details = typeof raw?.details === 'string' ? raw.details : undefined;
    const hint = typeof raw?.hint === 'string' ? raw.hint : undefined;
    const code = typeof raw?.code === 'string' ? raw.code : undefined;
    console.error('polls error:', err);
    return json(res, 500, { error: message, details, hint, code });
  }
}
