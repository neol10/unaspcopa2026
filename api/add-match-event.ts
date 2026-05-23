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
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    });
    const body = req.body || {};
    const {
      match_id,
      event_type,
      minute,
      player_id = null,
      assistant_id = null,
      commentary = null,
      metadata = null,
      team,
      goal_type = 'normal',
    } = body;

    if (!match_id || !event_type) return res.status(400).json({ error: 'match_id and event_type required' });

    const baseMeta = (metadata && typeof metadata === 'object') ? { ...metadata } : {};
    if (team && !(baseMeta as any).team_side) {
      (baseMeta as any).team_side = team;
    }

    // Idempotency: avoid duplicate insert if same event was just registered
    // IMPORTANTE: .eq('col', null) não funciona no Supabase — deve-se usar .is('col', null)
    let idempotencyQ = supabase
      .from('match_events')
      .select('id, created_at')
      .eq('match_id', match_id)
      .eq('event_type', event_type)
      .eq('minute', Number(minute) || 1);

    if (player_id) {
      idempotencyQ = idempotencyQ.eq('player_id', player_id);
    } else {
      idempotencyQ = idempotencyQ.is('player_id', null);
    }

    if (assistant_id) {
      idempotencyQ = idempotencyQ.eq('assistant_id', assistant_id);
    } else {
      idempotencyQ = idempotencyQ.is('assistant_id', null);
    }

    const { data: recent, error: recentErr } = await idempotencyQ
      .order('created_at', { ascending: false })
      .limit(1);
    if (recentErr) throw recentErr;
    if (recent && recent.length > 0) {
      const last = recent[0];
      if (last?.created_at && (Date.now() - new Date(String(last.created_at)).getTime()) < 2500) {
        return res.status(200).json({ event: last, match: null, players: [], duplicate: true });
      }
    }

    // Insert event
    const insertPayload: Record<string, unknown> = {
      match_id,
      event_type,
      minute: Number(minute) || 1,
      player_id: player_id || null,
      assistant_id: assistant_id || null,
      commentary: commentary || null,
      metadata: Object.keys(baseMeta).length > 0 ? baseMeta : null,
    };

    const { data: inserted, error: insertError } = await supabase.from('match_events').insert([insertPayload]).select('*').single();
    if (insertError) throw insertError;

    let updatedMatch: any = null;
    // Update match scores if needed
    if (event_type === 'gol') {
      // fetch current match scores
      const { data: matchRow, error: matchErr } = await supabase.from('matches').select('team_a_score,team_b_score,team_a_id,team_b_id').eq('id', match_id).single();
      if (matchErr) throw matchErr;

      let updates: Record<string, unknown> = {};
      if (goal_type === 'contra') {
        // credit opposite team
        const creditedIsA = team === 'b';
        updates = creditedIsA ? { team_a_score: (matchRow.team_a_score || 0) + 1 } : { team_b_score: (matchRow.team_b_score || 0) + 1 };
      } else {
        updates = team === 'a' ? { team_a_score: (matchRow.team_a_score || 0) + 1 } : { team_b_score: (matchRow.team_b_score || 0) + 1 };
      }

      const { data: matchUpdated, error: updateMatchErr } = await supabase.from('matches').update(updates).eq('id', match_id).select('*').single();
      if (updateMatchErr) throw updateMatchErr;
      updatedMatch = matchUpdated;
    }

    // Update player stats
    const updatedPlayers: Record<string, unknown>[] = [];
    if (event_type === 'gol' && goal_type !== 'contra' && player_id) {
      const { data: p } = await supabase.from('players').select('goals_count').eq('id', player_id).single();
      await supabase.from('players').update({ goals_count: (p?.goals_count || 0) + 1 }).eq('id', player_id);
      updatedPlayers.push({ id: player_id, goals_count: (p?.goals_count || 0) + 1 });
    }

    if (event_type === 'gol' && assistant_id) {
      const { data: ast } = await supabase.from('players').select('assists').eq('id', assistant_id).single();
      await supabase.from('players').update({ assists: (ast?.assists || 0) + 1 }).eq('id', assistant_id);
      updatedPlayers.push({ id: assistant_id, assists: (ast?.assists || 0) + 1 });
    }

    if (event_type === 'amarelo' && player_id) {
      const { data: p } = await supabase.from('players').select('yellow_cards').eq('id', player_id).single();
      await supabase.from('players').update({ yellow_cards: (p?.yellow_cards || 0) + 1 }).eq('id', player_id);
      updatedPlayers.push({ id: player_id, yellow_cards: (p?.yellow_cards || 0) + 1 });
    }

    if (event_type === 'vermelho' && player_id) {
      const { data: p } = await supabase.from('players').select('red_cards').eq('id', player_id).single();
      await supabase.from('players').update({ red_cards: (p?.red_cards || 0) + 1 }).eq('id', player_id);
      updatedPlayers.push({ id: player_id, red_cards: (p?.red_cards || 0) + 1 });
    }

    return res.status(200).json({ event: inserted, match: updatedMatch, players: updatedPlayers });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('add-match-event error:', err);
    return res.status(500).json({ error: msg });
  }
}
