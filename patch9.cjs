const fs = require('fs');

let adminCode = fs.readFileSync('src/pages/Admin/Admin.tsx', 'utf8');

const syncSearch = `      const { data: matches, error: matchErr } = await supabase.from('matches').select('team_a_id, team_b_id, team_a_score, team_b_score, status').eq('division', division);
      if (matchErr) throw matchErr;

      const teamGoalsAgainst = {};
      matches?.forEach(m => {
        const scoreA = m.team_a_score || 0;
        const scoreB = m.team_b_score || 0;
        if (m.status !== 'finalizado' && m.status !== 'ao_vivo' && scoreA === 0 && scoreB === 0) return;
        teamGoalsAgainst[m.team_a_id] = (teamGoalsAgainst[m.team_a_id] || 0) + scoreB;
        teamGoalsAgainst[m.team_b_id] = (teamGoalsAgainst[m.team_b_id] || 0) + scoreA;
      });

      const list = Array.isArray(allPlayers) ? allPlayers : [];
      const gks = list.filter(p => {
        const pos = String(p.position || '').trim().toLowerCase();
        return pos === 'goleiro' || pos === 'gol' || pos === 'gk' || pos.includes('gole');
      });

      let fixed = 0;
      const promises = [];
      const teamsProcessed = new Set();

      for (const gk of gks) {
        if (!gk.team_id) continue;
        const goals = teamGoalsAgainst[gk.team_id] || 0;
        
        promises.push(
          supabase.from('players').update({ goals_conceded: goals }).eq('id', gk.id)
            .then(() => { fixed++; })
        );
      }`;

const syncReplace = `      const { data: matches, error: matchErr } = await supabase.from('matches').select('id, team_a_id, team_b_id, team_a_score, team_b_score, status').eq('division', division);
      if (matchErr) throw matchErr;

      const { data: allTitularEvents } = await supabase.from('match_events').select('match_id, player_id, metadata').eq('event_type', 'goleiro_titular');

      const list = Array.isArray(allPlayers) ? allPlayers : [];
      const gks = list.filter(p => {
        const pos = String(p.position || '').trim().toLowerCase();
        return pos === 'goleiro' || pos === 'gol' || pos === 'gk' || pos.includes('gole');
      });

      const gkGoalsAgainst: Record<string, number> = {};
      gks.forEach(gk => gkGoalsAgainst[gk.id] = 0);

      matches?.forEach(m => {
        const scoreA = m.team_a_score || 0;
        const scoreB = m.team_b_score || 0;
        if (m.status !== 'finalizado' && m.status !== 'ao_vivo' && scoreA === 0 && scoreB === 0) return;
        
        const titularA = allTitularEvents?.find(e => e.match_id === m.id && (e.metadata as any)?.team_side === 'a')?.player_id;
        const titularB = allTitularEvents?.find(e => e.match_id === m.id && (e.metadata as any)?.team_side === 'b')?.player_id;
        
        const gksA = gks.filter(gk => gk.team_id === m.team_a_id);
        const gksB = gks.filter(gk => gk.team_id === m.team_b_id);
        
        const actualGkA = titularA || (gksA.length > 0 ? gksA[0].id : null);
        const actualGkB = titularB || (gksB.length > 0 ? gksB[0].id : null);
        
        if (actualGkA && gkGoalsAgainst[actualGkA] !== undefined) gkGoalsAgainst[actualGkA] += scoreB;
        if (actualGkB && gkGoalsAgainst[actualGkB] !== undefined) gkGoalsAgainst[actualGkB] += scoreA;
      });

      let fixed = 0;
      const promises = [];

      for (const gk of gks) {
        const goals = gkGoalsAgainst[gk.id] || 0;
        promises.push(
          supabase.from('players').update({ goals_conceded: goals }).eq('id', gk.id)
            .then(() => { fixed++; })
        );
      }`;

if (adminCode.includes(syncSearch)) {
  adminCode = adminCode.replace(syncSearch, syncReplace);
}

fs.writeFileSync('src/pages/Admin/Admin.tsx', adminCode, 'utf8');
console.log('Patch 9 aplicado ao Admin.tsx!');
