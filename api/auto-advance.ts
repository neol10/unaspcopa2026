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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Missing Supabase config' });
  try {
    const { match_id, winner_team_id, current_round } = req.body || {};
    if (!winner_team_id || !current_round) return res.status(400).json({ error: 'Missing winner_team_id or current_round' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    // Determine next round code: if current_round >= 1000, increment by 1; else default to 1000
    const nextRound = (typeof current_round === 'number' && current_round >= 1000) ? current_round + 1 : 1000;

    const row = {
      team_a_id: winner_team_id,
      team_b_id: null,
      round: nextRound,
      status: 'agendado',
    };
    const { data, error } = await supabase.from('matches').insert([row]).select('id, round, team_a_id');
    if (error) throw error;
    return res.status(200).json({ created: data?.length || 0, rows: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
}
