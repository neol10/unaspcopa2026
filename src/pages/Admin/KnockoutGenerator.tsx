import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStandings } from '../../hooks/useStandings';
import { supabase } from '../../lib/supabase';

type SeedItem = {
  team_id: string;
  team_name: string;
  group: string;
  seedLabel: string; // e.g. 1A
};

const groupBy = (arr: any[], key: string) => arr.reduce((acc: Record<string, any[]>, cur) => {
  (acc[cur[key]] = acc[cur[key]] || []).push(cur);
  return acc;
}, {});

const KnockoutGenerator: React.FC<{ enableAutoAdvance?: boolean }> = ({ enableAutoAdvance = false }) => {
  const queryClient = useQueryClient();
  const { standings, loading } = useStandings();
  const [pairingMode, setPairingMode] = useState<'classic' | 'overall' | 'cross_all' | 'cross_drop_last' | 'intra_group' | 'grouped_normal'>('intra_group');
  const [targetRound, setTargetRound] = useState<number>(1000);
  const [advancePerGroup, setAdvancePerGroup] = useState<number>(2);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const BRACKET_STORE_KEY = 'knockout_bracket_config_v1';

  const groups = useMemo(() => {
    const map = groupBy(standings || [], 'group');
    // sort group keys for deterministic ordering
    const keys = Object.keys(map).sort();
    return keys.map(k => ({ name: k, teams: (map[k] || []).slice().sort((a,b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.goals_diff !== a.goals_diff) return b.goals_diff - a.goals_diff;
      return b.goals_for - a.goals_for;
    }) }));
  }, [standings]);

  const generateBracket = () => {
    if (pairingMode === 'overall') {
      const allTeams: SeedItem[] = (standings || []).map((s: any) => ({ team_id: s.team_id, team_name: s.team_name, group: s.group || 'Geral', seedLabel: `${s.team_name}` }));
      const M = allTeams.length;
      const pairCount = Math.floor(M / 2);
      const pairs: any[] = [];
      for (let i = 0; i < pairCount; i++) {
        const a = allTeams[i];
        const b = allTeams[M - 1 - i];
        pairs.push({ teamA: a, teamB: b, round: 1, idx: i + 1 });
      }
      if (M % 2 === 1) {
        pairs.push({ teamA: allTeams[pairCount], teamB: undefined, round: 1, idx: pairCount + 1 });
      }
      return pairs;
    }

    if (pairingMode === 'intra_group') {
      const pairs: any[] = [];
      let pairIdx = 1;
      for (const g of groups) {
        const teams = g.teams;
        const maxPair = Math.floor(teams.length / 2);
        for (let i = 0; i < maxPair; i++) {
          const a = teams[i];
          const b = teams[teams.length - 1 - i];
          pairs.push({
            teamA: a ? { team_id: a.team_id, team_name: a.team_name, group: g.name, seedLabel: `${i + 1}${g.name}` } : undefined,
            teamB: b ? { team_id: b.team_id, team_name: b.team_name, group: g.name, seedLabel: `${teams.length - i}${g.name}` } : undefined,
            round: 1,
            idx: pairIdx++
          });
        }
        if (teams.length % 2 === 1) {
          const mid = teams[Math.floor(teams.length / 2)];
          pairs.push({
            teamA: mid ? { team_id: mid.team_id, team_name: mid.team_name, group: g.name, seedLabel: `${Math.floor(teams.length / 2) + 1}${g.name}` } : undefined,
            teamB: undefined,
            round: 1,
            idx: pairIdx++
          });
        }
      }
      return pairs;
    }

    if (pairingMode === 'grouped_normal') {
      const seeds: SeedItem[] = [];
      for (const g of groups) {
        g.teams.forEach((team, idx) => {
          seeds.push({ team_id: team.team_id, team_name: team.team_name, group: g.name, seedLabel: `${idx + 1}${g.name}` });
        });
      }

      const pairs: any[] = [];
      const M = seeds.length;
      const pairCount = Math.floor(M / 2);
      for (let i = 0; i < pairCount; i++) {
        pairs.push({ teamA: seeds[i], teamB: seeds[M - 1 - i], round: 1, idx: i + 1 });
      }
      if (M % 2 === 1) {
        pairs.push({ teamA: seeds[pairCount], teamB: undefined, round: 1, idx: pairCount + 1 });
      }
      return pairs;
    }

    if (pairingMode === 'cross_all' || pairingMode === 'cross_drop_last') {
      const pairs: any[] = [];
      let pairIdx = 1;
      
      for (let gIdx = 0; gIdx < groups.length; gIdx += 2) {
        const g1 = groups[gIdx];
        const g2 = groups[gIdx + 1];
        
        let teams1 = g1.teams;
        let teams2 = g2 ? g2.teams : [...g1.teams].reverse(); // fallback if odd number of groups

        if (pairingMode === 'cross_drop_last') {
          if (teams1.length > 1) teams1 = teams1.slice(0, -1);
          if (teams2.length > 1) teams2 = teams2.slice(0, -1);
        }

        const maxLen = Math.max(teams1.length, teams2.length);
        for (let i = 0; i < maxLen; i++) {
          const a = teams1[i];
          const b = teams2[teams2.length - 1 - i];
          
          pairs.push({
            teamA: a ? { team_id: a.team_id, team_name: a.team_name, group: g1.name, seedLabel: `${i + 1}${g1.name}` } : undefined,
            teamB: b ? { team_id: b.team_id, team_name: b.team_name, group: g2 ? g2.name : g1.name, seedLabel: `${teams2.length - i}${g2 ? g2.name : g1.name}` } : undefined,
            round: 1,
            idx: pairIdx++
          });
        }
      }
      return pairs;
    }

    // Classic Mode
    const positions: SeedItem[][] = [];
    for (let pos = 1; pos <= advancePerGroup; pos++) {
      const list: SeedItem[] = [];
      for (const g of groups) {
        const team = g?.teams?.[pos - 1];
        if (team) list.push({ team_id: team.team_id, team_name: team.team_name, group: g.name, seedLabel: `${pos}${g.name}` });
      }
      positions.push(list);
    }
    const seeds = positions.flat();
    
    const pairs: any[] = [];
    if (advancePerGroup === 2) {
      const firsts = seeds.filter(s => s.seedLabel.startsWith('1'));
      const seconds = seeds.filter(s => s.seedLabel.startsWith('2'));
      const N = Math.min(firsts.length, seconds.length);
      for (let i = 0; i < N; i++) {
        pairs.push({ teamA: firsts[i], teamB: seconds[N - 1 - i], round: 1, idx: i + 1 });
      }
      return pairs;
    }

    const M = seeds.length;
    const pairCount = Math.floor(M / 2);
    for (let i = 0; i < pairCount; i++) {
      pairs.push({ teamA: seeds[i], teamB: seeds[M - 1 - i], round: 1, idx: i + 1 });
    }
    return pairs;
  };

  const [autoDates, setAutoDates] = useState<boolean>(false);
  const [startDate, setStartDate] = useState<string>('');
  const [intervalMinutes, setIntervalMinutes] = useState<number>(60);

  const handlePreview = () => {
    const bracket = generateBracket();
    // If autoDates and startDate provided, assign match_date sequentially
    if (autoDates && startDate) {
      const start = new Date(startDate);
      bracket.forEach((m, i) => {
        const d = new Date(start.getTime() + i * intervalMinutes * 60 * 1000);
        (m as any).match_date = d.toISOString();
      });
    }
    setPreview(bracket);
    setMessage(null);
  };

  const saveBracketToLocal = () => {
    if (!preview) return setMessage('Nada para salvar');
    try {
      localStorage.setItem(BRACKET_STORE_KEY, JSON.stringify(preview));
      setMessage('Chave salva localmente');
    } catch {
      setMessage('Falha ao salvar');
    }
  };

  const loadBracketFromLocal = () => {
    try {
      const raw = localStorage.getItem(BRACKET_STORE_KEY);
      if (!raw) return setMessage('Nenhuma chave salva');
      const parsed = JSON.parse(raw);
      setPreview(parsed);
      setMessage('Chave carregada');
    } catch {
      setMessage('Falha ao carregar');
    }
  };

  const onDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
  };

  const onDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (isNaN(from) || !preview) return;
    const copy = preview.slice();
    const [m] = copy.splice(from, 1);
    copy.splice(index, 0, m);
    setPreview(copy);
  };

  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  const saveMatchesToDatabase = async () => {
    if (!preview || preview.length === 0) return setMessage('Nada para salvar');
    try {
      const rows = preview.map((m) => ({
        team_a_id: m.teamA?.team_id || null,
        team_b_id: m.teamB?.team_id || null,
        match_date: (m as any).match_date || new Date().toISOString(),
        round: targetRound,
        status: 'agendado'
      }));

      const { error } = await supabase.from('matches').insert(rows);
      if (error) throw error;
      
      setMessage(`Sucesso! Foram criadas ${rows.length} partidas no Mata-Mata.`);
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    } catch (err: any) {
      setMessage(`Erro ao salvar: ${String(err?.message || err)}`);
    }
  };

  const handleSwap = (idx: number) => {
    if (!preview) return;
    const copy = preview.slice();
    const m = copy[idx];
    const a = m.teamA;
    copy[idx] = { ...m, teamA: m.teamB, teamB: a };
    setPreview(copy);
  };

  const handleCreate = async () => {
    if (!preview || preview.length === 0) {
      return setMessage('Por favor, clique em "Gerar Visualização" primeiro para confirmar os jogos.');
    }
    setCreating(true); setMessage(null);
    try {
      // Save matches directly into the matches table
      await saveMatchesToDatabase();
    } catch (err: any) {
      setMessage(String(err?.message || err));
    } finally {
      setCreating(false);
    }
  };

  const handleAdvanceWinner = async (teamId?: string) => {
    if (!teamId) return;
    try {
      const resp = await fetch('/api/advance-winner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ winner_team_id: teamId }) });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Erro ao avançar vencedor');
      setMessage('Vencedor avançado (partida criada).');
    } catch (err: any) {
      setMessage(String(err?.message || err));
    }
  };

  // Subscribe to matches changes to auto-advance winners when matches finalize
  // Only subscribe when explicitly enabled to avoid interfering with live phase
  React.useEffect(() => {
    if (!enableAutoAdvance) return;
    const channel = supabase
      .channel('public:auto_advance')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, async (payload) => {
        try {
          const oldStatus = (payload.old as any)?.status;
          const newStatus = (payload.new as any)?.status;
          if (oldStatus !== 'finalizado' && newStatus === 'finalizado') {
            const m = payload.new as any;
            const a = m.team_a_id;
            const b = m.team_b_id;
            const aScore = m.team_a_score ?? 0;
            const bScore = m.team_b_score ?? 0;
            const winner = aScore > bScore ? a : (bScore > aScore ? b : null);
            if (winner) {
              await fetch('/api/auto-advance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ match_id: m.id, winner_team_id: winner, current_round: m.round }) });
            }
          }
        } catch (err) {
          // ignore
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enableAutoAdvance]);

  return (
    <div className="knockout-generator admin-form glass" style={{ marginTop: '2rem', padding: '1.5rem', borderRadius: '16px' }}>
      <h6 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        <span style={{ color: 'var(--secondary)' }}>🏆</span> Gerador Automático de Mata-mata
      </h6>
      
      <div className="form-grid-full" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="form-group">
          <label>Modo de Geração</label>
          <select value={pairingMode} onChange={(e) => setPairingMode(e.target.value as any)} className="admin-input">
            <option value="intra_group">Intra-Grupo (1º x Último, 2º x Penúltimo do grupo)</option>
            <option value="cross_drop_last">Cruzar sem o Último (Passa todos menos pior, cruza os grupos)</option>
            <option value="classic">Clássico (N primeiros de cada grupo)</option>
            <option value="grouped_normal">Todos passam (chave normal mantendo grupos)</option>
            <option value="cross_all">Cruzar Todos (1º Grupo A x Último B)</option>
            <option value="overall">Ranking Geral (1º Geral x Último Geral)</option>
          </select>
        </div>
        
        <div className="form-group">
          <label>Gerar para qual Fase?</label>
          <select value={targetRound} onChange={(e) => setTargetRound(Number(e.target.value))} className="admin-input">
            <option value={1000}>Oitavas de Final</option>
            <option value={1001}>Quartas de Final</option>
            <option value={1002}>Semifinal</option>
            <option value={1003}>Final</option>
            <option value={1004}>3º Lugar</option>
          </select>
        </div>

        {pairingMode === 'classic' && (
          <div className="form-group">
            <label>Avançam por grupo</label>
            <input type="number" min={1} max={8} value={advancePerGroup} onChange={e => setAdvancePerGroup(Math.max(1, Math.min(8, Number(e.target.value || 1))))} className="admin-input" />
          </div>
        )}
      </div>

      <div className="form-group" style={{ marginBottom: '1.5rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: autoDates ? '1rem' : '0' }}>
          <input type="checkbox" checked={autoDates} onChange={e => setAutoDates(e.target.checked)} /> 
          Atribuir datas e horários automaticamente
        </label>
        {autoDates && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Data de Início (1º Jogo)</label>
              <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="admin-input" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Intervalo entre jogos (minutos)</label>
              <input type="number" min={1} value={intervalMinutes} onChange={e => setIntervalMinutes(Math.max(1, Number(e.target.value || 60)))} className="admin-input" />
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <button className="btn-secondary" onClick={handlePreview} disabled={loading} style={{ flex: 1, minWidth: '200px', padding: '0.75rem' }}>
          Gerar Pré-visualização
        </button>
        <button className="btn-save" onClick={handleCreate} disabled={creating} style={{ flex: 1, minWidth: '200px', padding: '0.75rem' }}>
          {creating ? 'Criando Partidas...' : 'Salvar Partidas no App'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem', justifyContent: 'center' }}>
        <button className="btn-cancel" onClick={saveBracketToLocal} style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}>Salvar Preset na Memória</button>
        <button className="btn-cancel" onClick={loadBracketFromLocal} style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}>Carregar Preset</button>
      </div>

      {preview && (
        <div className="knockout-preview" style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h4 style={{ marginBottom: '1rem', color: 'var(--text-dim)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Pré-visualização dos Confrontos</h4>
          {preview.map((m, i) => (
            <div key={i} className="glass" draggable onDragStart={(e) => onDragStart(e, i)} onDrop={(e) => onDrop(e, i)} onDragOver={onDragOver} style={{ padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '0.5rem', cursor: 'grab' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--text-main)', cursor: 'pointer', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} onClick={() => handleSwap(i)}>{m.teamA?.team_name || 'TBD'}</strong>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>vs</span>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--text-main)', cursor: 'pointer', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} onClick={() => handleSwap(i)}>{m.teamB?.team_name || 'TBD'}</strong>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Sementes: {m.teamA?.seedLabel || '-'} x {m.teamB?.seedLabel || '-'}</div>
                  {(m as any).match_date && <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginTop: '0.25rem' }}>Data: {(new Date((m as any).match_date)).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
                  <button className="btn-cancel" onClick={() => handleSwap(i)} style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}>⇄ Trocar Lados</button>
                  <button className="btn-secondary" onClick={() => handleAdvanceWinner(m.teamA?.team_id)} disabled={!m.teamA?.team_id} style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}>Avançar {m.teamA?.team_name?.split(' ')[0]}</button>
                  <button className="btn-secondary" onClick={() => handleAdvanceWinner(m.teamB?.team_id)} disabled={!m.teamB?.team_id} style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}>Avançar {m.teamB?.team_name?.split(' ')[0]}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {message && <div style={{ marginTop: 8 }}>{message}</div>}
    </div>
  );
};

export default KnockoutGenerator;

