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
    const payload = req.body || {};
    const name = payload.name || 'Bracket';
    const matches = Array.isArray(payload.matches) ? payload.matches : [];
    if (matches.length === 0) return res.status(400).json({ error: 'No matches provided' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 1) create bracket
    const { data: bracketData, error: bracketError } = await supabase.from('brackets').insert([{ name, config: { created_by: 'admin', created_at: new Date().toISOString() } }]).select('id');
    if (bracketError) throw bracketError;
    const bracketId = bracketData?.[0]?.id;

    // 2) insert provided matches (assumed current round), attach bracket_id
    const rows = matches.map((m: any, idx: number) => ({ team_a_id: m.team_a_id || null, team_b_id: m.team_b_id || null, match_date: m.match_date || null, round: m.round || 1000, status: 'agendado', bracket_id: bracketId }));
    const { data: inserted, error: insertError } = await supabase.from('matches').insert(rows).select('id');
    if (insertError) throw insertError;

    // 3) create placeholder parent matches for next round and link children via next_match_id
    const childIds = (inserted || []).map((r: any) => r.id);
    const parentCount = Math.ceil(childIds.length / 2);
    const parentRows = new Array(parentCount).fill(null).map(() => ({ team_a_id: null, team_b_id: null, round: (rows[0].round || 1000) + 1, status: 'agendado', bracket_id: bracketId }));
    const { data: parents, error: parentError } = await supabase.from('matches').insert(parentRows).select('id');
    if (parentError) throw parentError;

    // 4) update children next_match_id mapping: pair children [0,1] -> parents[0], [2,3] -> parents[1], etc.
    const updates = [] as any[];
    for (let i = 0; i < childIds.length; i++) {
      const parentIndex = Math.floor(i / 2);
      const parentId = parents[parentIndex]?.id;
      if (parentId) updates.push({ id: childIds[i], next_match_id: parentId });
    }
    if (updates.length > 0) {
      // Supabase doesn't allow bulk updates by id array easily, do individual updates (simple but fine for admin tool)
      for (const u of updates) {
        await supabase.from('matches').update({ next_match_id: u.next_match_id }).eq('id', u.id);
      }
    }

    return res.status(200).json({ bracket_id: bracketId, created_matches: inserted?.length || 0, parent_matches: parents?.length || 0 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
}
