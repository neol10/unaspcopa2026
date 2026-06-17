const fs = require('fs');

let adminCode = fs.readFileSync('src/pages/Admin/Admin.tsx', 'utf8');

// 1. Add states around line 1603 (near viewingVotesMatch)
const stateSearch = `  const [viewingVotesMatch, setViewingVotesMatch] = useState<Match | null>(null);`;
const stateReplace = `  const [viewingVotesMatch, setViewingVotesMatch] = useState<Match | null>(null);
  const [startingMatch, setStartingMatch] = useState<Match | null>(null);
  const [startingGkA, setStartingGkA] = useState<string>('');
  const [startingGkB, setStartingGkB] = useState<string>('');`;

if (adminCode.includes(stateSearch)) {
  adminCode = adminCode.replace(stateSearch, stateReplace);
}

// 2. Add handleStartMatchClick and confirmStartMatch before updateStatus
const updateStatusSearch = `  const updateStatus = async (id: string, status: Match['status'], match?: Match) => {`;
const updateStatusReplace = `  const handleStartMatchClick = (match: Match) => {
    const playersA = Array.isArray(allPlayers) ? allPlayers.filter(p => p.team_id === match.team_a_id) : [];
    const playersB = Array.isArray(allPlayers) ? allPlayers.filter(p => p.team_id === match.team_b_id) : [];
    
    const getGks = (players: any[]) => players.filter(p => {
      const pos = String(p.position || '').trim().toLowerCase();
      return pos === 'goleiro' || pos === 'gol' || pos === 'gk' || pos.includes('gole');
    });

    const gksA = getGks(playersA);
    const gksB = getGks(playersB);

    if (gksA.length > 1 || gksB.length > 1) {
      setStartingGkA(gksA.length === 1 ? gksA[0].id : '');
      setStartingGkB(gksB.length === 1 ? gksB[0].id : '');
      setStartingMatch(match);
    } else {
      const tasks: Promise<any>[] = [];
      if (gksA.length === 1) {
        tasks.push(supabase.from('match_events').insert([{ match_id: match.id, event_type: 'goleiro_titular', player_id: gksA[0].id, minute: 0, metadata: { team_side: 'a' } }]));
      }
      if (gksB.length === 1) {
        tasks.push(supabase.from('match_events').insert([{ match_id: match.id, event_type: 'goleiro_titular', player_id: gksB[0].id, minute: 0, metadata: { team_side: 'b' } }]));
      }
      Promise.all(tasks).catch(() => {}).finally(() => {
        updateStatus(match.id, 'ao_vivo', match);
      });
    }
  };

  const confirmStartMatch = async () => {
    if (!startingMatch) return;
    const tasks: Promise<any>[] = [];
    if (startingGkA) {
      tasks.push(supabase.from('match_events').insert([{ match_id: startingMatch.id, event_type: 'goleiro_titular', player_id: startingGkA, minute: 0, metadata: { team_side: 'a' } }]));
    }
    if (startingGkB) {
      tasks.push(supabase.from('match_events').insert([{ match_id: startingMatch.id, event_type: 'goleiro_titular', player_id: startingGkB, minute: 0, metadata: { team_side: 'b' } }]));
    }
    
    const promise = Promise.all(tasks).catch(() => {}).finally(() => {
      updateStatus(startingMatch.id, 'ao_vivo', startingMatch);
      setStartingMatch(null);
    });
    toast.promise(promise, {
      loading: 'Iniciando partida...',
      success: 'Partida iniciada!',
      error: 'Erro ao iniciar partida'
    });
  };

  const updateStatus = async (id: string, status: Match['status'], match?: Match) => {`;

if (adminCode.includes(updateStatusSearch)) {
  adminCode = adminCode.replace(updateStatusSearch, updateStatusReplace);
}

// 3. Replace onClick for Play button
const playBtnSearch = `<button className="btn-icon play" title="Começar Jogo" onClick={() => { vibrate(60); updateStatus(match.id, 'ao_vivo', match); }}><Play size={18} /></button>`;
const playBtnReplace = `<button className="btn-icon play" title="Começar Jogo" onClick={() => { vibrate(60); handleStartMatchClick(match); }}><Play size={18} /></button>`;
if (adminCode.includes(playBtnSearch)) {
  adminCode = adminCode.replace(playBtnSearch, playBtnReplace);
}

// 4. Update goal conceded attribution in handleAddEvent
const goalAttributionSearch = `          if (candidateGks.length > 0) {
             const bestGk = candidateGks[0];
             tasks.push(
               supabase.from('players').select('goals_conceded').eq('id', bestGk.id).single()
                 .then(({ data: gk }) => supabase.from('players').update({ goals_conceded: (gk?.goals_conceded || 0) + 1 }).eq('id', bestGk.id))
             );
          }`;
const goalAttributionReplace = `          if (candidateGks.length > 0) {
             const { data: titularEvents } = await supabase.from('match_events').select('player_id, metadata').eq('match_id', match.id).eq('event_type', 'goleiro_titular');
             const titularEvent = (titularEvents || []).find(e => (e.metadata as any)?.team_side === concededTeamSide);
             const titularGkId = titularEvent?.player_id;
             const bestGk = titularGkId ? candidateGks.find(p => p.id === titularGkId) || candidateGks[0] : candidateGks[0];
             
             tasks.push(
               supabase.from('players').select('goals_conceded').eq('id', bestGk.id).single()
                 .then(({ data: gk }) => supabase.from('players').update({ goals_conceded: (gk?.goals_conceded || 0) + 1 }).eq('id', bestGk.id))
             );
          }`;
if (adminCode.includes(goalAttributionSearch)) {
  adminCode = adminCode.replace(goalAttributionSearch, goalAttributionReplace);
}

// 5. Render Modal
const modalSearch = `      {ConfirmElement}
    </div>
  );
};`;
const modalReplace = `      {startingMatch && (
        <div className="modal-overlay active" onClick={() => setStartingMatch(null)}>
          <div className="modal-content admin-modal glass" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Selecione os Goleiros Titulares</h3>
              <button className="btn-icon close-button" onClick={() => setStartingMatch(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p>Esta partida tem times com mais de um goleiro. Selecione o titular para atribuir os gols sofridos corretamente.</p>
              
              <div className="form-group">
                <label>{startingMatch.teams_a?.name || 'Equipe A'}</label>
                <select value={startingGkA} onChange={(e) => setStartingGkA(e.target.value)} className="form-select">
                  <option value="">Selecione o Goleiro...</option>
                  {(Array.isArray(allPlayers) ? allPlayers : [])
                    .filter(p => p.team_id === startingMatch.team_a_id)
                    .filter(p => {
                      const pos = String(p.position || '').trim().toLowerCase();
                      return pos === 'goleiro' || pos === 'gol' || pos === 'gk' || pos.includes('gole');
                    }).map(gk => (
                      <option key={gk.id} value={gk.id}>{gk.name} ({gk.number})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>{startingMatch.teams_b?.name || 'Equipe B'}</label>
                <select value={startingGkB} onChange={(e) => setStartingGkB(e.target.value)} className="form-select">
                  <option value="">Selecione o Goleiro...</option>
                  {(Array.isArray(allPlayers) ? allPlayers : [])
                    .filter(p => p.team_id === startingMatch.team_b_id)
                    .filter(p => {
                      const pos = String(p.position || '').trim().toLowerCase();
                      return pos === 'goleiro' || pos === 'gol' || pos === 'gk' || pos.includes('gole');
                    }).map(gk => (
                      <option key={gk.id} value={gk.id}>{gk.name} ({gk.number})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn-cancel" onClick={() => setStartingMatch(null)}>Cancelar</button>
              <button className="btn-primary" onClick={confirmStartMatch}>Confirmar e Iniciar</button>
            </div>
          </div>
        </div>
      )}

      {ConfirmElement}
    </div>
  );
};`;
if (adminCode.includes(modalSearch)) {
  adminCode = adminCode.replace(modalSearch, modalReplace);
}

fs.writeFileSync('src/pages/Admin/Admin.tsx', adminCode, 'utf8');
console.log('Patch 8 aplicado ao Admin.tsx!');
