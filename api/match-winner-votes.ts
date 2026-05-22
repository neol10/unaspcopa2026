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
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json(res, 503, {
      error: 'Missing Supabase config',
      hint: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel project env',
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    if (req.method === 'GET') {
      const matchId = String(req.query.matchId || '').trim();
      if (!matchId) return json(res, 400, { error: 'matchId required' });

      const includeProfiles = String(req.query.includeProfiles || '').trim() === '1' || String(req.query.includeProfiles || '').trim().toLowerCase() === 'true';
      const userId = String(req.query.userId || '').trim();

      const { data, error } = await supabase.from('match_winner_votes').select('vote, user_id').eq('match_id', matchId);
      if (error) throw error;

      let responseData: unknown[] = data || [];
      if (includeProfiles && responseData.length > 0) {
        const userIds = Array.from(new Set(responseData.map((item) => String((item as { user_id?: string | null }).user_id || '')).filter(Boolean)));
        if (userIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase.from('profiles').select('id, email').in('id', userIds);
          if (profilesError) throw profilesError;
          responseData = responseData.map((item) => ({
            ...item,
            profiles: profilesData?.find((profile) => profile.id === (item as { user_id?: string | null }).user_id) || { email: 'Anônimo' },
          }));
        }
      }

      const userVote = userId
        ? (data || []).find((item) => String((item as { user_id?: string | null }).user_id || '') === userId)?.vote || null
        : null;

      return json(res, 200, { data: responseData, userVote });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const matchId = String(body.matchId || body.match_id || '').trim();
      const userId = String(body.userId || body.user_id || '').trim();
      const vote = String(body.vote || '').trim();

      if (!matchId || !userId || !vote) {
        return json(res, 400, { error: 'matchId, userId and vote required' });
      }

      const { error } = await supabase.from('match_winner_votes').upsert(
        {
          match_id: matchId,
          user_id: userId,
          vote,
        },
        { onConflict: 'match_id,user_id' }
      );

      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (err: unknown) {
    const raw = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message = typeof raw?.message === 'string' ? raw.message : (err instanceof Error ? err.message : String(err));
    const details = typeof raw?.details === 'string' ? raw.details : undefined;
    const hint = typeof raw?.hint === 'string' ? raw.hint : undefined;
    const code = typeof raw?.code === 'string' ? raw.code : undefined;
    console.error('match-winner-votes error:', err);
    return json(res, 500, { error: message, details, hint, code });
  }
}
