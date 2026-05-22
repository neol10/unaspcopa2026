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
const ADMIN_TOKEN = process.env.ADMIN_REBUILD_TOKEN || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Missing Supabase config' });
  if (ADMIN_TOKEN && req.headers['x-admin-token'] !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: players, error: playersErr } = await supabase
      .from('players')
      .select('id, team_id');
    if (playersErr) throw playersErr;

    const { data: matches, error: matchesErr } = await supabase
      .from('matches')
      .select('id, team_a_id, team_b_id');
    if (matchesErr) throw matchesErr;

    const { data: events, error: eventsErr } = await supabase
      .from('match_events')
      .select('match_id, event_type, player_id, assistant_id, metadata');
    if (eventsErr) throw eventsErr;

    const playerTeam: Record<string, string> = {};
    (players || []).forEach((p) => {
      if (p?.id) playerTeam[String(p.id)] = String(p.team_id || '');
    });

    const matchTeams: Record<string, { a: string; b: string }> = {};
    (matches || []).forEach((m) => {
      if (m?.id) matchTeams[String(m.id)] = { a: String(m.team_a_id), b: String(m.team_b_id) };
    });

    const counts: Record<string, { goals: number; assists: number; yellows: number; reds: number }> = {};
    const matchScores: Record<string, { a: number; b: number }> = {};

    (events || []).forEach((ev) => {
      const matchId = ev.match_id ? String(ev.match_id) : '';
      if (matchId && !matchScores[matchId]) matchScores[matchId] = { a: 0, b: 0 };

      const meta = (ev.metadata && typeof ev.metadata === 'object') ? ev.metadata as any : {};
      const goalType = meta?.goal_type;
      const isOwnGoal = goalType === 'contra';
      const isPenalty = goalType === 'penalti';

      if (ev.event_type === 'gol') {
        if (ev.player_id && !isOwnGoal) {
          const pid = String(ev.player_id);
          if (!counts[pid]) counts[pid] = { goals: 0, assists: 0, yellows: 0, reds: 0 };
          counts[pid].goals += 1;
        }

        if (ev.assistant_id && !isOwnGoal && !isPenalty) {
          const aid = String(ev.assistant_id);
          if (!counts[aid]) counts[aid] = { goals: 0, assists: 0, yellows: 0, reds: 0 };
          counts[aid].assists += 1;
        }

        // rebuild match scores
        if (matchId && matchScores[matchId]) {
          const teams = matchTeams[matchId];
          if (!teams) return;
          let scorerTeam = '';
          if (ev.player_id) scorerTeam = playerTeam[String(ev.player_id)] || '';
          const teamSide = meta?.team_side;

          if (!scorerTeam && (teamSide === 'a' || teamSide === 'b')) {
            scorerTeam = teamSide === 'a' ? teams.a : teams.b;
          }

          if (scorerTeam) {
            const creditedTeam = isOwnGoal
              ? (scorerTeam === teams.a ? teams.b : teams.a)
              : scorerTeam;
            if (creditedTeam === teams.a) matchScores[matchId].a += 1;
            if (creditedTeam === teams.b) matchScores[matchId].b += 1;
          }
        }
      }

      if (ev.event_type === 'amarelo' && ev.player_id) {
        const pid = String(ev.player_id);
        if (!counts[pid]) counts[pid] = { goals: 0, assists: 0, yellows: 0, reds: 0 };
        counts[pid].yellows += 1;
      }

      if (ev.event_type === 'vermelho' && ev.player_id) {
        const pid = String(ev.player_id);
        if (!counts[pid]) counts[pid] = { goals: 0, assists: 0, yellows: 0, reds: 0 };
        counts[pid].reds += 1;
      }
    });

    // reset players to zero
    const resetIds = (players || []).map((p) => p.id).filter(Boolean) as string[];
    for (let i = 0; i < resetIds.length; i += 200) {
      const chunk = resetIds.slice(i, i + 200);
      await supabase
        .from('players')
        .update({ goals_count: 0, assists: 0, yellow_cards: 0, red_cards: 0 })
        .in('id', chunk);
    }

    const ids = Object.keys(counts);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      await Promise.all(chunk.map((id) => {
        const c = counts[id];
        return supabase
          .from('players')
          .update({ goals_count: c.goals, assists: c.assists, yellow_cards: c.yellows, red_cards: c.reds })
          .eq('id', id);
      }));
    }

    // update match scores
    const matchIds = Object.keys(matchScores);
    for (let i = 0; i < matchIds.length; i += 100) {
      const chunk = matchIds.slice(i, i + 100);
      await Promise.all(chunk.map((mid) => {
        const score = matchScores[mid];
        return supabase
          .from('matches')
          .update({ team_a_score: score.a, team_b_score: score.b })
          .eq('id', mid);
      }));
    }

    return res.status(200).json({ ok: true, players: ids.length, matches: matchIds.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('rebuild-player-stats error:', err);
    return res.status(500).json({ error: msg });
  }
}
