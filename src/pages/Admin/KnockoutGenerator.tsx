import React, { useMemo, useState } from 'react';
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
  const { standings, loading } = useStandings();
  const [advancePerGroup, setAdvancePerGroup] = useState<number>(2);
  const [includeThirdPlace, setIncludeThirdPlace] = useState<boolean>(false);
  const [tournamentMode, setTournamentMode] = useState<boolean>(false);
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

  const generateSeeds = () : SeedItem[] => {
    // Tournament mode: advance all teams from standings in overall order, then pair 1xN, 2xN-1, ...
    if (tournamentMode) {
      // Use overall standings ordering so the top-ranked team faces the bottom-ranked team.
      const allTeams: SeedItem[] = (standings || []).map((s: any) => ({ team_id: s.team_id, team_name: s.team_name, group: s.group || 'Geral', seedLabel: `${s.team_name}` }));
      return allTeams;
    }

    // Produce arrays per finishing position: pos1 = [1A,1B,1C...], pos2 = [2A,2B,2C...]
    const positions: SeedItem[][] = [];
    for (let pos = 1; pos <= advancePerGroup; pos++) {
      const list: SeedItem[] = [];
      for (const g of groups) {
        const team = g?.teams?.[pos - 1];
        if (team) list.push({ team_id: team.team_id, team_name: team.team_name, group: g.name, seedLabel: `${pos}${g.name}` });
      }
      positions.push(list);
    }
    // Flatten by positions: [1A,1B,...,2A,2B,...]
    return positions.flat();
  };

  const buildBracketClassic = (seeds: SeedItem[]) => {
    // Classic mapping for advancePerGroup = 2: pair 1st placed against 2nd placed in reverse order
    const pairs: Array<{ teamA?: SeedItem; teamB?: SeedItem; round: number; idx: number }> = [];
    // Tournament mode: mirror pairing 1xN, 2xN-1, ...
    if (tournamentMode) {
      const M = seeds.length;
      const pairCount = Math.floor(M / 2);
      for (let i = 0; i < pairCount; i++) {
        const a = seeds[i];
        const b = seeds[M - 1 - i];
        pairs.push({ teamA: a, teamB: b, round: 1, idx: i + 1 });
      }
      // If odd number of teams, leave middle team as a bye (advances automatically)
      if (M % 2 === 1) {
        const mid = seeds[pairCount];
        pairs.push({ teamA: mid, teamB: undefined, round: 1, idx: pairCount + 1 });
      }
      return pairs;
    }
    if (advancePerGroup === 2) {
      const firsts = seeds.filter(s => s.seedLabel.startsWith('1'));
      const seconds = seeds.filter(s => s.seedLabel.startsWith('2'));
      const N = Math.min(firsts.length, seconds.length);
      for (let i = 0; i < N; i++) {
        const a = firsts[i];
        const b = seconds[N - 1 - i];
        pairs.push({ teamA: a, teamB: b, round: 1, idx: i + 1 });
      }
      return pairs;
    }

    // Fallback: simple mirror pairing
    const M = seeds.length;
    const pairCount = Math.floor(M/2);
    for (let i = 0; i < pairCount; i++) {
      const a = seeds[i];
      const b = seeds[M - 1 - i];
      pairs.push({ teamA: a, teamB: b, round: 1, idx: i + 1 });
    }
    return pairs;
  };

  const [autoDates, setAutoDates] = useState<boolean>(false);
  const [startDate, setStartDate] = useState<string>('');
  const [intervalMinutes, setIntervalMinutes] = useState<number>(60);

  const handlePreview = () => {
    const seeds = generateSeeds();
    const bracket = buildBracketClassic(seeds);
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

  const saveBracketToServer = async () => {
    if (!preview || preview.length === 0) return setMessage('Nada para salvar');
    try {
      const payload = { name: `Bracket ${new Date().toLocaleString()}`, matches: preview.map((m) => ({ team_a_id: m.teamA?.team_id || null, team_b_id: m.teamB?.team_id || null, match_date: (m as any).match_date || null, round: 1000 })) };
      const resp = await fetch('/api/save-bracket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Erro ao salvar chave no servidor');
      setMessage(`Chave salva no servidor (id: ${data.bracket_id})`);
    } catch (err: any) {
      setMessage(String(err?.message || err));
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
    if (!preview || preview.length === 0) return;
    setCreating(true); setMessage(null);
    try {
      // Automatically save bracket to server (uses /api/save-bracket to create bracket+matches+parents)
      await saveBracketToServer();
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
    <div className="knockout-generator glass" style={{ marginTop: 16, padding: 12 }}>
      <h6>Gerar Mata-mata</h6>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12 }}>Avançam por grupo:</label>
        <input type="number" min={1} max={8} value={advancePerGroup} onChange={e => setAdvancePerGroup(Math.max(1, Math.min(8, Number(e.target.value || 1))))} style={{ width: 72 }} />
        <label style={{ fontSize: 12, marginLeft: 8 }}>
          <input type="checkbox" checked={tournamentMode} onChange={e => setTournamentMode(e.target.checked)} /> Modo torneio (todas passam)
        </label>
        <label style={{ fontSize: 12 }}>
          <input type="checkbox" checked={includeThirdPlace} onChange={e => setIncludeThirdPlace(e.target.checked)} /> Incluir 3º lugar
        </label>
        <label style={{ fontSize: 12 }}>
          <input type="checkbox" checked={autoDates} onChange={e => setAutoDates(e.target.checked)} /> Atribuir datas automaticamente
        </label>
        {autoDates && (
          <>
            <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <label style={{ fontSize: 12 }}>Intervalo (min)</label>
            <input type="number" min={1} value={intervalMinutes} onChange={e => setIntervalMinutes(Math.max(1, Number(e.target.value || 60)))} style={{ width: 80 }} />
          </>
        )}
        <button className="btn-add" onClick={handlePreview} disabled={loading}>Gerar Visualização</button>
        <button className="btn-save" onClick={handleCreate} disabled={!preview || preview.length===0 || creating}>{creating ? 'Criando...' : 'Criar partidas'}</button>
        <button className="btn" onClick={saveBracketToLocal}>Salvar Chave</button>
        <button className="btn" onClick={loadBracketFromLocal}>Carregar Chave</button>
      </div>

      {preview && (
        <div className="knockout-preview">
          {preview.map((m, i) => (
            <div key={i} draggable onDragStart={(e) => onDragStart(e, i)} onDrop={(e) => onDrop(e, i)} onDragOver={onDragOver} style={{ padding: 8, borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'grab' }}>
              <div>
                <strong style={{ cursor: 'pointer' }} onClick={() => handleSwap(i)}>{m.teamA?.team_name || 'TBD'}</strong>
                <span style={{ margin: '0 8px' }}> vs </span>
                <strong style={{ cursor: 'pointer' }} onClick={() => handleSwap(i)}>{m.teamB?.team_name || 'TBD'}</strong>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>seed: {m.teamA?.seedLabel || '-'} x {m.teamB?.seedLabel || '-'}</div>
                {(m as any).match_date && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>data: {(new Date((m as any).match_date)).toLocaleString()}</div>}
              <div>
                <button className="btn-cancel" onClick={() => handleSwap(i)} style={{ marginLeft: 8 }}>Trocar lados</button>
                <button className="btn-add" onClick={() => handleAdvanceWinner(m.teamA?.team_id)} disabled={!m.teamA?.team_id}>Avançar {m.teamA?.team_name}</button>
                <button className="btn-add" onClick={() => handleAdvanceWinner(m.teamB?.team_id)} disabled={!m.teamB?.team_id}>Avançar {m.teamB?.team_name}</button>
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

