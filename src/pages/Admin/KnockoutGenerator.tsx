import React, { useMemo, useState } from 'react';
import { useStandings } from '../../hooks/useStandings';

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

const KnockoutGenerator: React.FC = () => {
  const { standings, loading } = useStandings();
  const [advancePerGroup, setAdvancePerGroup] = useState<number>(2);
  const [includeThirdPlace, setIncludeThirdPlace] = useState<boolean>(false);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
    const seeds: SeedItem[] = [];
    const groupCount = groups.length;
    for (let pos = 1; pos <= advancePerGroup; pos++) {
      for (let gi = 0; gi < groupCount; gi++) {
        const g = groups[gi];
        const team = g?.teams?.[pos - 1];
        if (team) {
          seeds.push({ team_id: team.team_id, team_name: team.team_name, group: g.name, seedLabel: `${pos}${g.name}` });
        }
      }
    }
    return seeds;
  };

  const buildBracket = (seeds: SeedItem[]) => {
    const M = seeds.length;
    const matches: Array<{ teamA?: SeedItem; teamB?: SeedItem; round: number; idx: number }> = [];
    const pairs = Math.floor(M/2);
    for (let i = 0; i < pairs; i++) {
      const a = seeds[i];
      const b = seeds[M - 1 - i];
      matches.push({ teamA: a, teamB: b, round: 1, idx: i + 1 });
    }
    return matches;
  };

  const handlePreview = () => {
    const seeds = generateSeeds();
    const bracket = buildBracket(seeds);
    setPreview(bracket);
    setMessage(null);
  };

  const handleCreate = async () => {
    if (!preview || preview.length === 0) return;
    setCreating(true); setMessage(null);
    try {
      const body = preview.map((m) => ({ team_a_id: m.teamA?.team_id || null, team_b_id: m.teamB?.team_id || null }));
      const resp = await fetch('/api/generate-knockout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matches: body }) });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Erro ao criar partidas');
      setMessage('Partidas criadas com sucesso.');
    } catch (err: any) {
      setMessage(String(err?.message || err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="knockout-generator glass" style={{ marginTop: 16, padding: 12 }}>
      <h6>Gerar Mata-mata</h6>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ fontSize: 12 }}>Avançam por grupo:</label>
        <input type="number" min={1} max={8} value={advancePerGroup} onChange={e => setAdvancePerGroup(Math.max(1, Math.min(8, Number(e.target.value || 1))))} style={{ width: 72 }} />
        <label style={{ fontSize: 12 }}>
          <input type="checkbox" checked={includeThirdPlace} onChange={e => setIncludeThirdPlace(e.target.checked)} /> Incluir 3º lugar
        </label>
        <button className="btn-add" onClick={handlePreview} disabled={loading}>Gerar Visualização</button>
        <button className="btn-save" onClick={handleCreate} disabled={!preview || preview.length===0 || creating}>{creating ? 'Criando...' : 'Criar partidas'}</button>
      </div>

      {preview && (
        <div className="knockout-preview">
          {preview.map((m, i) => (
            <div key={i} style={{ padding: 8, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <strong>{m.teamA?.team_name || 'TBD'}</strong> vs <strong>{m.teamB?.team_name || 'TBD'}</strong>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>seed: {m.teamA?.seedLabel || '-'} x {m.teamB?.seedLabel || '-'}</div>
            </div>
          ))}
        </div>
      )}
      {message && <div style={{ marginTop: 8 }}>{message}</div>}
    </div>
  );
};

export default KnockoutGenerator;
