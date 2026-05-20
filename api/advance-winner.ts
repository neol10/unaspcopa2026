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
    const { winner_team_id, source_match_id } = req.body || {};
    if (!winner_team_id) return res.status(400).json({ error: 'Missing winner_team_id' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const row = { team_a_id: winner_team_id, team_b_id: null, status: 'agendado' };
    const { data, error } = await supabase.from('matches').insert([row]).select('id, team_a_id');
    if (error) throw error;
    return res.status(200).json({ created: data?.length || 0, rows: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
}
