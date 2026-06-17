const fs = require('fs');
let code = fs.readFileSync('src/pages/Admin/Admin.tsx', 'utf8');

const funcAnchor = '  const handleFixNamesUppercase = async () => {';
const funcInsertion = `  const [syncingGkGoals, setSyncingGkGoals] = useState(false);

  const handleSyncGoalkeeperGoals = async () => {
    if (syncingGkGoals) return;
    if (loading) {
      toast.error('Aguarde terminar de carregar os dados.');
      return;
    }

    const ok = await confirmAction({
      title: 'Sincronizar Gols Sofridos',
      description: 'Isso vai recalcular os gols sofridos de TODOS os goleiros baseando-se nas partidas ja jogadas. Deseja continuar?',
      variant: 'warning',
    });
    if (!ok) return;

    setSyncingGkGoals(true);
    const loadingToast = toast.loading('Calculando gols sofridos...');

    try {
      const { data: matches, error: matchErr } = await supabase.from('matches').select('team_a_id, team_b_id, team_a_score, team_b_score, status').eq('division', division);
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
        if (!gk.team_id || teamsProcessed.has(gk.team_id)) continue;
        teamsProcessed.add(gk.team_id);
        const goals = teamGoalsAgainst[gk.team_id] || 0;
        
        promises.push(
          supabase.from('players').update({ goals_conceded: goals }).eq('id', gk.id)
            .then(({ error }) => { if (error) throw error; fixed++; })
        );
      }

      await Promise.all(promises);

      void queryClient.invalidateQueries({ queryKey: ['players', division] });
      void queryClient.invalidateQueries({ queryKey: ['rankings', division] });
      void refreshPlayers();
      toast.success('Sincronizados ' + fixed + ' goleiros!', { id: loadingToast });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Erro ao sincronizar goleiros'), { id: loadingToast });
    } finally {
      setSyncingGkGoals(false);
    }
  };

`;

const lines = code.split('\n');
const funcIdx = lines.findIndex(l => l.includes(funcAnchor));
if (funcIdx !== -1) {
  lines.splice(funcIdx, 0, funcInsertion);
}

const btnAnchor = 'Corrigir nomes (MAIÚSCULO)';
const btnIdx = lines.findIndex(l => l.includes(btnAnchor));
if (btnIdx !== -1) {
  lines.splice(btnIdx + 2, 0, '            <button className="btn-add" type="button" disabled={syncingGkGoals || loading} onClick={() => void handleSyncGoalkeeperGoals()}>{syncingGkGoals ? "Sincronizando..." : "Sincronizar Gols Sofridos"}</button>');
}

fs.writeFileSync('src/pages/Admin/Admin.tsx', lines.join('\n'), 'utf8');
console.log('Added handleSyncGoalkeeperGoals function and button');
