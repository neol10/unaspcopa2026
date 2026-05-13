import React, { useEffect, useMemo, useState } from 'react';
import './Standings.css';
import { Shield, LayoutGrid, List, Trophy } from 'lucide-react';
import { useStandings } from '../../hooks/useStandings';
import { useMatches } from '../../hooks/useMatches';
import { useTournamentConfig } from '../../hooks/useTournamentConfig';
import { useAuthContext } from '../../contexts/AuthContext';
import Skeleton, { SkeletonStandingsRow } from '../../components/Skeleton/Skeleton';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useGroupCVisibility } from '../../hooks/useGroupCVisibility';
import { KNOCKOUT_ROUND_LABELS } from '../../lib/tournamentRules';
import { deriveMatchStatus } from '../../lib/matchStatus';

const Standings: React.FC = () => {
  const { standings, loading, error, refresh, paused } = useStandings();
  const { matches, loading: matchesLoading, error: matchesError, refresh: refreshMatches } = useMatches();
  const { config } = useTournamentConfig();
  const { role } = useAuthContext();
  const { visibility } = useGroupCVisibility();
  const [showByGroup, setShowByGroup] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedKnockoutRound, setSelectedKnockoutRound] = useState<number | null>(null);
  const [stuck, setStuck] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const isAdmin = role === 'admin';
  const isGroupPhase = config.current_phase === 'grupos';

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const effectiveLoading = isGroupPhase ? loading : matchesLoading;
  useEffect(() => {
    let cancelled = false;

    if (!effectiveLoading) {
      queueMicrotask(() => {
        if (cancelled) return;
        setStuck(false);
      });
      return () => {
        cancelled = true;
      };
    }

    const id = window.setTimeout(() => {
      if (cancelled) return;
      setStuck(true);
    }, 15000);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [effectiveLoading]);

  useEffect(() => {
    if (!isGroupPhase) {
      queueMicrotask(() => setShowByGroup(false));
    }
  }, [isGroupPhase]);

  const { containerRef, isPulling, pullDistance, isRefreshing } = usePullToRefresh({
    onRefresh: async () => {
      if (isGroupPhase) {
        await refresh();
      } else {
        await refreshMatches();
      }
    }
  });

  const knockoutRoundCodes = useMemo(() => {
    if (isGroupPhase) return [];

    const codes = new Set<number>();
    for (const m of matches) {
      if (typeof m.round === 'number' && m.round >= 1000 && m.round <= 1004) {
        codes.add(m.round);
      }
    }

    return Array.from(codes).sort((a, b) => a - b);
  }, [isGroupPhase, matches]);

  const phaseToRoundCode = (phase: string) => {
    if (phase === 'oitavas') return 1000;
    if (phase === 'quartas') return 1001;
    if (phase === 'semifinal') return 1002;
    if (phase === 'final') return 1003;
    return null;
  };

  useEffect(() => {
    if (isGroupPhase) return;
    const preferred = phaseToRoundCode(config.current_phase);
    const next = (preferred && knockoutRoundCodes.includes(preferred))
      ? preferred
      : (knockoutRoundCodes[0] ?? null);
    queueMicrotask(() => setSelectedKnockoutRound((prev) => (prev === null || !knockoutRoundCodes.includes(prev) ? next : prev)));
  }, [isGroupPhase, config.current_phase, knockoutRoundCodes]);

  if (isGroupPhase && (paused || stuck) && standings.length === 0) {
    return (
      <div className="error-state glass" style={{ margin: '2rem auto', maxWidth: 720 }}>
        <p style={{ marginBottom: '0.75rem' }}>
          {paused
            ? 'Sem conexão no momento. A classificação vai carregar assim que a internet voltar.'
            : 'Demorou muito para carregar a classificação.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refresh()}>
            Tentar novamente
          </button>
          <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => window.location.reload()}>
            Recarregar página
          </button>
        </div>
      </div>
    );
  }

  if (isGroupPhase && loading && standings.length === 0) return (
    <div className="standings-container animate-fade-in">
      <header className="standings-header">
        <div className="header-info">
          <Skeleton width="200px" height="40px" className="mb-2" />
          <Skeleton width="300px" height="20px" />
        </div>
      </header>
      <div className="group-section">
        <Skeleton width="150px" height="24px" className="mb-4" />
        <div className="table-container glass" style={{ display: 'flex', flexDirection: 'column' }}>
          {[1, 2, 3, 4, 5].map(i => <SkeletonStandingsRow key={i} />)}
        </div>
      </div>
    </div>
  );
  
  if (isGroupPhase && error && standings.length === 0) {
    return (
      <div className="error-state glass" style={{ margin: '2rem auto', maxWidth: 720 }}>
        <p style={{ marginBottom: '0.75rem' }}>Erro ao carregar classificação: {error}</p>
        <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refresh()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!isGroupPhase) {
    if ((stuck || (!navigator.onLine && effectiveLoading)) && matches.length === 0) {
      return (
        <div className="error-state glass" style={{ margin: '2rem auto', maxWidth: 720 }}>
          <p style={{ marginBottom: '0.75rem' }}>
            {!navigator.onLine
              ? 'Sem conexão no momento. As fases vão carregar assim que a internet voltar.'
              : 'Demorou muito para carregar as fases.'}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refreshMatches()}>
              Tentar novamente
            </button>
            <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => window.location.reload()}>
              Recarregar página
            </button>
          </div>
        </div>
      );
    }

    if (matchesError && matches.length === 0) {
      return (
        <div className="error-state glass" style={{ margin: '2rem auto', maxWidth: 720 }}>
          <p style={{ marginBottom: '0.75rem' }}>Erro ao carregar fases: {matchesError}</p>
          <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refreshMatches()}>
            Tentar novamente
          </button>
        </div>
      );
    }

    const selectedCode = selectedKnockoutRound ?? knockoutRoundCodes[0] ?? null;
    const selectedLabel = selectedCode ? (KNOCKOUT_ROUND_LABELS[selectedCode] || `Fase ${selectedCode}`) : 'Mata-mata';
    const phaseMatches = selectedCode
      ? matches
          .filter((m) => m.round === selectedCode)
          .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())
      : [];

    return (
      <div className="standings-container animate-fade-in" ref={containerRef}>
        <header className="standings-header">
          <div className="header-info">
            <h1 className="text-gradient">Classificação</h1>
            <p>Agora por fases do mata-mata</p>
          </div>
          <div className="header-actions">
            <div className="status-pill glass">
              <Trophy size={16} />
              {selectedLabel}
            </div>
            <div className="status-pill glass">
              <div className="live-dot"></div>
              Tempo Real
            </div>
          </div>
        </header>

        {knockoutRoundCodes.length > 0 && (
          <div className="group-filter-row" aria-label="Seletor de fases">
            {knockoutRoundCodes.map((code) => {
              const label = KNOCKOUT_ROUND_LABELS[code] || `Fase ${code}`;
              const isActive = selectedKnockoutRound === code || (selectedKnockoutRound === null && code === selectedCode);
              return (
                <button
                  key={code}
                  type="button"
                  className={`group-filter-chip ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedKnockoutRound(code)}
                  aria-pressed={isActive}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        <div className="group-section">
          <h3 className="group-title">
            <Trophy size={20} color="var(--secondary)" />
            {selectedLabel}
          </h3>
          <div className="table-container glass">
            <table className="standings-table-new" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Jogo</th>
                  <th>Placar</th>
                  <th className="hide-mobile">Data</th>
                  <th className="hide-mobile">Local</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {phaseMatches.map((m) => {
                  const effective = deriveMatchStatus(m, nowTs);
                  const teamA = m.teams_a?.name || 'A definir';
                  const teamB = m.teams_b?.name || 'A definir';
                  const score = effective === 'agendado' ? '-' : `${m.team_a_score} x ${m.team_b_score}`;
                  const dateLabel = new Date(m.match_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                  const timeLabel = new Date(m.match_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                  const statusLabel = effective === 'ao_vivo' ? 'AO VIVO' : effective === 'finalizado' ? 'FIM' : 'PREVISTO';

                  return (
                    <tr key={m.id} className="row-animate">
                      <td style={{ textAlign: 'left' }}>
                        <div className="team-cell" style={{ gap: '0.9rem' }}>
                          <div className="team-shield" style={{ width: 36, height: 36 }}>
                            {m.teams_a?.badge_url ? (
                              <img
                                src={m.teams_a.badge_url}
                                alt=""
                                width="22"
                                height="22"
                                loading="lazy"
                                decoding="async"
                                style={{ objectFit: 'contain', padding: '2px' }}
                              />
                            ) : (
                              <Shield size={18} color="var(--text-dim)" />
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <strong style={{ color: 'var(--text-main)' }}>{teamA} x {teamB}</strong>
                            <span style={{ color: 'var(--text-dim)', fontSize: '0.82rem', fontWeight: 700 }}>
                              {m.location || 'Local a definir'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="pts-cell" style={{ fontSize: '1rem' }}>{score}</td>
                      <td className="hide-mobile">{dateLabel} • {timeLabel}</td>
                      <td className="hide-mobile">{m.location || '—'}</td>
                      <td>
                        <span className="rank-num" style={{ opacity: 1 }}>{statusLabel}</span>
                      </td>
                    </tr>
                  );
                })}

                {phaseMatches.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '1.25rem 1rem', color: 'var(--text-dim)', fontWeight: 700 }}>
                      Nenhum jogo cadastrado para esta fase.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="table-swipe-hint">Arraste para os lados para ver todas as colunas.</p>
          </div>
        </div>
      </div>
    );
  }

  // Agrupar equipes por grupo
  const isTestGroup = (groupName?: string | null) => {
    const clean = (groupName || '').trim().toUpperCase().replace(/\s+/g, '');
    return clean === 'C' || clean === 'GRUPOC';
  };

  const visibleStandings = isAdmin
    ? standings
    : visibility.standings
    ? standings
    : standings.filter((team) => !isTestGroup(team.group));

  const groupedStandings = visibleStandings.reduce((acc: Record<string, typeof standings>, team) => {
    const groupName = team.group || 'Geral';
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(team);
    return acc;
  }, {});

  const groupNames = Object.keys(groupedStandings);
  const visibleGroups = showByGroup
    ? Object.entries(groupedStandings).filter(([groupName]) => selectedGroup === 'all' || groupName === selectedGroup)
    : [];

  const getGroupRankColorClass = (index: number, groupSize: number) => {
    if (groupSize === 4) {
      if (index <= 1) return 'rank-green';
      if (index === 2) return 'rank-yellow';
      if (index === 3) return 'rank-red';
      return '';
    }

    if (index <= 2) return 'rank-green';
    if (index === 3) return 'rank-yellow';
    if (index === 4) return 'rank-red';
    return '';
  };

  const getOverallRankColorClass = (index: number, total: number) => {
    if (total === 4) {
      if (index <= 1) return 'rank-green';
      if (index === 2) return 'rank-yellow';
      if (index === 3) return 'rank-red';
      return '';
    }

    if (index <= 2) return 'rank-green';
    if (index <= 5) return 'rank-blue';
    if (index <= 8) return 'rank-yellow';
    if (index === 9) return 'rank-red';
    return '';
  };

  return (
    <div className="standings-container animate-fade-in" ref={containerRef}>
      {/* Pull To Refresh Indicator */}
      {(isPulling || isRefreshing) && (
        <div className="pull-to-refresh-indicator" style={{ height: `${Math.max(40, pullDistance)}px` }}>
          {isRefreshing ? (
            <>
              <div className="pull-spinner"></div>
              <span>Atualizando...</span>
            </>
          ) : (
             <span>{pullDistance > 60 ? 'Solte para atualizar' : 'Puxe para atualizar'}</span>
          )}
        </div>
      )}

      <header className="standings-header">
        <div className="header-info">
          <h1 className="text-gradient">Classificação</h1>
          <p>Acompanhe a corrida pelo título da Copa Unasp 2026</p>
        </div>
        <div className="header-actions">
          {isGroupPhase ? (
            <div className="view-toggle glass">
              <button 
                className={showByGroup ? 'active' : ''} 
                onClick={() => setShowByGroup(true)}
                title="Ver por Grupos"
              >
                <LayoutGrid size={18} />
                <span>Grupos</span>
              </button>
              <button 
                className={!showByGroup ? 'active' : ''} 
                onClick={() => setShowByGroup(false)}
                title="Ver Geral"
              >
                <List size={18} />
                <span>Geral</span>
              </button>
            </div>
          ) : (
            <div className="status-pill glass">
              <Trophy size={16} />
              Mata-mata
            </div>
          )}
          <div className="status-pill glass">
            <div className="live-dot"></div>
            Tempo Real
          </div>
        </div>
      </header>

      {isGroupPhase && showByGroup && groupNames.length > 1 && (
        <div className="group-filter-row">
          <button
            type="button"
            className={`group-filter-chip ${selectedGroup === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedGroup('all')}
          >
            Todos os grupos
          </button>
          {groupNames.map((groupName) => (
            <button
              key={groupName}
              type="button"
              className={`group-filter-chip ${selectedGroup === groupName ? 'active' : ''}`}
              onClick={() => setSelectedGroup(groupName)}
            >
              {groupName}
            </button>
          ))}
        </div>
      )}

      {showByGroup ? (
        visibleGroups.map(([groupName, groupTeams]) => (
          <div key={groupName} className="group-section">
            <h3 className="group-title">
              <Shield size={20} color="var(--secondary)" />
              {groupName}
            </h3>
            <div className="table-container glass">
              <table className="standings-table-new">
                <thead>
                  <tr>
                    <th className="col-rank">#</th>
                    <th className="col-name">Equipe</th>
                    <th>P</th>
                    <th>J</th>
                    <th>V</th>
                    <th>E</th>
                    <th>D</th>
                    <th className="hide-mobile">GP</th>
                    <th className="hide-mobile">GC</th>
                    <th>SG</th>
                    <th className="hide-mobile">%</th>
                    <th className="col-form hide-mobile">Forma</th>
                  </tr>
                </thead>
                <tbody>
                  {groupTeams.map((team, index) => (
                    <tr key={team.team_id} className={`row-animate group-rank ${getGroupRankColorClass(index, groupTeams.length)}`}>
                      <td className="col-rank">
                        <span className="rank-num">{index + 1}</span>
                      </td>
                      <td className="col-name">
                        <div className="team-cell">
                          <div className="team-shield">
                            {team.badge_url ? (
                              <img 
                                src={team.badge_url} 
                                alt={team.team_name} 
                                width="24" 
                                height="24" 
                                loading="lazy"
                                decoding="async"
                                style={{ objectFit: 'contain', padding: '2px' }} 
                              />
                            ) : (
                              <Shield size={24} color={index === 0 ? 'var(--secondary)' : 'var(--text-dim)'} />
                            )}
                          </div>
                          <strong>{team.team_name}</strong>
                        </div>
                      </td>
                      <td className="pts-cell">{team.points}</td>
                      <td>{team.played}</td>
                      <td>{team.wins}</td>
                      <td>{team.draws}</td>
                      <td>{team.losses}</td>
                      <td className="hide-mobile">{team.goals_for}</td>
                      <td className="hide-mobile">{team.goals_against}</td>
                      <td className={team.goals_diff >= 0 ? 'sg-pos' : 'sg-neg'}>
                        {team.goals_diff > 0 ? `+${team.goals_diff}` : team.goals_diff}
                      </td>
                      <td className="hide-mobile">{team.percentage.toFixed(0)}%</td>
                      <td className="hide-mobile">
                        <div className="form-dots">
                          {[...team.form].reverse().map((res, i) => (
                            <span key={i} className={`form-dot ${res.toLowerCase()}`} title={res === 'V' ? 'Vitória' : res === 'E' ? 'Empate' : 'Derrota'}>
                              {res}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="table-swipe-hint">Arraste para os lados para ver todas as colunas.</p>
            </div>
          </div>
        ))
      ) : (
        <div className="group-section">
          <h3 className="group-title">
            <Trophy size={20} color="var(--secondary)" />
            Classificação Geral
          </h3>
          <div className="table-container glass">
            <table className="standings-table-new">
              <thead>
                <tr>
                  <th className="col-rank">#</th>
                  <th className="col-name">Equipe</th>
                  <th>P</th>
                  <th>J</th>
                  <th>V</th>
                  <th>E</th>
                  <th>D</th>
                  <th className="hide-mobile">GP</th>
                  <th className="hide-mobile">GC</th>
                  <th>SG</th>
                  <th className="hide-mobile">%</th>
                  <th className="col-form hide-mobile">Forma</th>
                </tr>
              </thead>
              <tbody>
                {visibleStandings.map((team, index) => (
                  <tr key={team.team_id} className={`row-animate overall-rank ${getOverallRankColorClass(index, visibleStandings.length)}`}>
                    <td className="col-rank">
                      <span className="rank-num">{index + 1}</span>
                    </td>
                    <td className="col-name">
                      <div className="team-cell">
                        <div className="team-shield">
                          {team.badge_url ? (
                            <img 
                              src={team.badge_url} 
                              alt={team.team_name} 
                              width="24" 
                              height="24" 
                              loading="lazy"
                              decoding="async"
                              style={{ objectFit: 'contain', padding: '2px' }} 
                            />
                          ) : (
                            <Shield size={24} color={index === 0 ? 'var(--secondary)' : 'var(--text-dim)'} />
                          )}
                        </div>
                        <div className="team-info-v2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong>{team.team_name}</strong>
                          <span className="team-group-tag" style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', letterSpacing: '1px' }}>
                            {team.group}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="pts-cell">{team.points}</td>
                    <td>{team.played}</td>
                    <td>{team.wins}</td>
                    <td>{team.draws}</td>
                    <td>{team.losses}</td>
                    <td className="hide-mobile">{team.goals_for}</td>
                    <td className="hide-mobile">{team.goals_against}</td>
                    <td className={team.goals_diff >= 0 ? 'sg-pos' : 'sg-neg'}>
                      {team.goals_diff > 0 ? `+${team.goals_diff}` : team.goals_diff}
                    </td>
                    <td className="hide-mobile">{team.percentage.toFixed(0)}%</td>
                    <td className="hide-mobile">
                      <div className="form-dots">
                        {[...team.form].reverse().map((res, i) => (
                          <span key={i} className={`form-dot ${res.toLowerCase()}`} title={res === 'V' ? 'Vitória' : res === 'E' ? 'Empate' : 'Derrota'}>
                            {res}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="table-swipe-hint">Arraste para os lados para ver todas as colunas.</p>
          </div>
        </div>
      )}

    </div>
  );
};

export default Standings;
