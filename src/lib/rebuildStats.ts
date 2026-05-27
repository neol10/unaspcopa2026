import { supabase } from './supabase';

export async function rebuildStatsClientSide() {
  const [{ data: players }, { data: matches }, { data: events }] = await Promise.all([
    supabase.from('players').select('id, team_id'),
    supabase.from('matches').select('id, team_a_id, team_b_id'),
    supabase.from('match_events').select('match_id, event_type, player_id, assistant_id, metadata')
  ]);

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
          const creditedTeam = isOwnGoal ? (scorerTeam === teams.a ? teams.b : teams.a) : scorerTeam;
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

  const resetIds = (players || []).map((p) => p.id).filter(Boolean) as string[];
  for (let i = 0; i < resetIds.length; i += 200) {
    const chunk = resetIds.slice(i, i + 200);
    await supabase
      .from('players')
      .update({ goals_count: 0, assists: 0, yellow_cards: 0, red_cards: 0 })
      .in('id', chunk);
  }

  const ids = Object.keys(counts);
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    await Promise.all(chunk.map((id) => {
      const c = counts[id];
      return supabase
        .from('players')
        .update({ goals_count: c.goals, assists: c.assists, yellow_cards: c.yellows, red_cards: c.reds })
        .eq('id', id);
    }));
  }

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

  return true;
}
