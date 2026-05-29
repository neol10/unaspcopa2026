import React, { useEffect, useMemo, useState } from 'react';
import './Standings.css';
import { Download, Shield, LayoutGrid, List, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStandings, type Standing } from '../../hooks/useStandings';
import { useMatches } from '../../hooks/useMatches';
import { useTournamentConfig } from '../../hooks/useTournamentConfig';
import { useAuthContext } from '../../contexts/AuthContext';
import Skeleton, { SkeletonStandingsRow } from '../../components/Skeleton/Skeleton';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useGroupCVisibility } from '../../hooks/useGroupCVisibility';
import { KNOCKOUT_ROUND_LABELS } from '../../lib/tournamentRules';
import { deriveMatchStatus } from '../../lib/matchStatus';
import { downloadSocialGroupStandingCard, downloadSocialStandingsCard, downloadKnockoutTeiaCard } from '../../lib/socialCardExport';
import { KnockoutTeiaExport } from '../../components/KnockoutTeiaExport/KnockoutTeiaExport';
import '../Brackets/Brackets.css'; // reaproveitar o visual dos cards do chaveamento

const Standings: React.FC = () => {
  const { standings, loading, error, refresh, paused } = useStandings();
  const { matches, loading: matchesLoading, error: matchesError, refresh: refreshMatches } = useMatches();
  const { config } = useTournamentConfig();
  const { role } = useAuthContext();
  const { visibility } = useGroupCVisibility();
  const [showByGroup, setShowByGroup] = useState(true);
  const [showKnockoutPanel, setShowKnockoutPanel] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedKnockoutRound, setSelectedKnockoutRound] = useState<number | null>(null);
  const [downloadingGroupCard, setDownloadingGroupCard] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const isAdmin = role === 'admin';
  const isGroupPhase = config.current_phase === 'grupos';

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const effectiveLoading = showKnockoutPanel ? matchesLoading : loading;
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
      queueMicrotask(() => setShowKnockoutPanel(true));
    }
  }, [isGroupPhase]);

  const { containerRef, isPulling, pullDistance, isRefreshing } = usePullToRefresh({
    onRefresh: async () => {
      if (showKnockoutPanel) {
        await refreshMatches();
      } else if (isGroupPhase) {
        await refresh();
      } else {
        await refreshMatches();
      }
    }
  });

  const knockoutRoundCodes = useMemo(() => {
    return [1000, 1001, 1002, 1004, 1003];
  }, []);

  const phaseToRoundCode = (phase: string) => {
    if (phase === 'oitavas') return 1000;
    if (phase === 'quartas') return 1001;
    if (phase === 'semifinal') return 1002;
    if (phase === 'final') return 1003;
    return null;
  };

  useEffect(() => {
    if (!showKnockoutPanel && isGroupPhase) return;
    const preferred = phaseToRoundCode(config.current_phase);
    const next = (preferred && knockoutRoundCodes.includes(preferred))
      ? preferred
      : (knockoutRoundCodes[0] ?? null);
    queueMicrotask(() => setSelectedKnockoutRound((prev) => (prev === null || !knockoutRoundCodes.includes(prev) ? next : prev)));
  }, [isGroupPhase, showKnockoutPanel, config.current_phase, knockoutRoundCodes]);

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

  const selectedDownloadGroups = useMemo(() => {
    if (!showByGroup) return [];
    if (selectedGroup === 'all') return visibleGroups;
    return visibleGroups.filter(([groupName]) => groupName === selectedGroup);
  }, [selectedGroup, showByGroup, visibleGroups]);

  const selectedCode = selectedKnockoutRound ?? knockoutRoundCodes[0] ?? null;
  const selectedLabel = selectedCode ? (KNOCKOUT_ROUND_LABELS[selectedCode] || `Fase ${selectedCode}`) : 'Mata-mata';
  const phaseMatches = selectedCode
    ? matches
        .filter((m) => m.round === selectedCode)
        .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())
    : [];

  if (showKnockoutPanel && (stuck || (!navigator.onLine && effectiveLoading)) && matches.length === 0) {
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

  if (showKnockoutPanel && matchesError && matches.length === 0) {
    return (
      <div className="error-state glass" style={{ margin: '2rem auto', maxWidth: 720 }}>
        <p style={{ marginBottom: '0.75rem' }}>Erro ao carregar fases: {matchesError}</p>
        <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refreshMatches()}>
          Tentar novamente
        </button>
      </div>
    );
  }

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

  const handleDownloadVisibleGroups = async () => {
    if (!showByGroup || selectedDownloadGroups.length === 0) return;

    const scopeLabel = selectedGroup === 'all' ? 'todos-os-grupos' : `grupo-${selectedGroup}`;

    setDownloadingGroupCard(scopeLabel);
    try {
      if (selectedDownloadGroups.length === 1) {
        const [groupName, groupTeams] = selectedDownloadGroups[0];
        await downloadSocialGroupStandingCard({
          fileName: `classificacao-grupo-${groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          groupName,
          subtitle: 'Classificação oficial da fase de grupos',
          rows: groupTeams.map((team, index) => ({
            rank: index + 1,
            teamName: team.team_name,
            badgeUrl: team.badge_url,
            points: team.points,
            played: team.played,
            wins: team.wins,
            draws: team.draws,
            losses: team.losses,
            goalsFor: team.goals_for,
            goalsAgainst: team.goals_against,
            goalsDiff: team.goals_diff,
            percentage: team.percentage,
          })),
        });
      } else {
        await downloadSocialStandingsCard({
          fileName: 'classificacao-dos-grupos',
          title: 'Classificação dos grupos',
          subtitle: 'Classificação oficial da fase de grupos',
          groups: selectedDownloadGroups.map(([groupName, groupTeams]) => ({
            groupName,
            rows: groupTeams.map((team, index) => ({
              rank: index + 1,
              teamName: team.team_name,
              badgeUrl: team.badge_url,
              points: team.points,
              played: team.played,
              wins: team.wins,
              draws: team.draws,
              losses: team.losses,
              goalsFor: team.goals_for,
              goalsAgainst: team.goals_against,
              goalsDiff: team.goals_diff,
              percentage: team.percentage,
            })),
          })),
        });
      }

      toast.success(selectedGroup === 'all' ? 'Cards dos grupos baixados!' : `Card do grupo ${selectedGroup} baixado!`);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloadingGroupCard(null);
    }
  };

  const [downloadingTeia, setDownloadingTeia] = useState(false);
  const handleDownloadTeia = async () => {
    if (knockoutRoundCodes.length === 0) return;
    setDownloadingTeia(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await downloadKnockoutTeiaCard('teia-export-node', 'chaveamento-copa-unasp');
    } catch (err) {
      console.error(err);
    } finally {
      setDownloadingTeia(false);
    }
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
          <p>{showKnockoutPanel ? 'Agora por fases do mata-mata' : 'Acompanhe a corrida pelo título da Copa Unasp 2026'}</p>
        </div>
        <div className="header-actions">
          {!showKnockoutPanel ? (
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
              <button
                className="active"
                onClick={() => setShowKnockoutPanel(true)}
                title="Ver mata-mata"
                type="button"
              >
                <Trophy size={18} />
                <span>Mata-mata</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-download-group-card"
              onClick={() => setShowKnockoutPanel(false)}
            >
              <LayoutGrid size={16} />
              <span>Voltar aos grupos</span>
            </button>
          )}
          {showKnockoutPanel && (
            <div className="status-pill glass">
              <Trophy size={16} />
              {selectedLabel}
            </div>
          )}
          <div className="status-pill glass">
            <div className="live-dot"></div>
            Tempo Real
          </div>
        </div>
      </header>

      {showKnockoutPanel && knockoutRoundCodes.length > 0 && (
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
          
          <button
            type="button"
            className="btn-download-group-card"
            style={{ marginLeft: 'auto' }}
            onClick={() => void handleDownloadTeia()}
            disabled={downloadingTeia}
            aria-label="Baixar Chaveamento (Teia)"
          >
            <Download size={14} />
            <span>{downloadingTeia ? 'Gerando...' : 'Baixar Chaveamento'}</span>
          </button>
        </div>
      )}

      {!showKnockoutPanel && isGroupPhase && showByGroup && groupNames.length > 1 && (
        <div className="group-filter-row">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', alignItems: 'center' }}>
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
          <button
            type="button"
            className="btn-download-group-card btn-download-visible-groups"
            onClick={() => void handleDownloadVisibleGroups()}
            disabled={downloadingGroupCard !== null}
            aria-label={selectedGroup === 'all' ? 'Baixar card de todos os grupos' : `Baixar card do grupo ${selectedGroup}`}
          >
            <Download size={14} />
            <span>
              {downloadingGroupCard !== null
                ? 'Gerando...'
                : selectedGroup === 'all'
                  ? 'Baixar os 2 grupos'
                  : `Baixar grupo ${selectedGroup}`}
            </span>
          </button>
        </div>
      )}

      {showKnockoutPanel ? (
        <div className="group-section">
          <h3 className="group-title">
            <Trophy size={20} color="var(--secondary)" />
            {selectedLabel}
          </h3>
          <div className="bracket-round" style={{ maxWidth: '100%', minWidth: '100%', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', padding: '1rem 0' }}>
            {phaseMatches.map((match) => {
              const effectiveStatus = deriveMatchStatus(match, nowTs);
              const isTeamAWinner = effectiveStatus === 'finalizado' && (match.team_a_score ?? 0) > (match.team_b_score ?? 0);
              const isTeamBWinner = effectiveStatus === 'finalizado' && (match.team_b_score ?? 0) > (match.team_a_score ?? 0);
              const matchDateObj = new Date(match.match_date);
              
              let liveMinutes: number | null = null;
              if (effectiveStatus === 'ao_vivo' && match.status === 'ao_vivo' && match.current_period_start) {
                const diffMs = nowTs - new Date(match.current_period_start).getTime();
                liveMinutes = Math.floor(diffMs / 60000);
              }

              let countdown = '';
              if (effectiveStatus === 'agendado') {
                const diff = matchDateObj.getTime() - nowTs;
                if (diff > 0 && diff < 24 * 60 * 60 * 1000) {
                  const hrs = Math.floor(diff / (1000 * 60 * 60));
                  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                  countdown = `Em ${hrs}h ${mins}m`;
                } else if (diff <= 0) {
                  countdown = 'Atrasado';
                }
              }

              const outcomeLabel = matchDateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + matchDateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

              return (
                <div key={match.id} className="bracket-match">
                  <div className="match-box glass">
                    <div className="match-preview" style={{ justifyContent: 'space-between' }}>
                      <span className="match-round-chip">{KNOCKOUT_ROUND_LABELS[match.round as number] || 'Mata-mata'}</span>
                      <span className="match-meta">{effectiveStatus === 'agendado' && countdown ? countdown : effectiveStatus === 'ao_vivo' && liveMinutes !== null ? `${liveMinutes}' em andamento` : outcomeLabel}</span>
                    </div>

                    <div className="match-mini-timeline">
                      {effectiveStatus === 'ao_vivo' && (
                        <>
                          <span className="timeline-chip live">AO VIVO</span>
                          <span className="timeline-chip">Min {liveMinutes ?? 0}</span>
                        </>
                      )}
                      {effectiveStatus === 'agendado' && countdown && (
                        <>
                          <span className="timeline-chip soon">EM BREVE</span>
                          <span className="timeline-chip subtle">{countdown}</span>
                        </>
                      )}
                      {effectiveStatus === 'finalizado' && (
                        <>
                          <span className="timeline-chip final">ENCERRADO</span>
                          <span className="timeline-chip subtle">Placar final</span>
                          {!isTeamAWinner && !isTeamBWinner && (
                            <span className="timeline-chip draw">EMPATE</span>
                          )}
                        </>
                      )}
                    </div>
                    
                    <div className={`match-team ${isTeamAWinner ? 'winner' : ''}`}>
                      <div className="team-info">
                        {match.teams_a?.badge_url ? (
                          <img 
                            src={match.teams_a.badge_url} 
                            alt="" 
                            className="team-badge-mini" 
                            width="28" 
                            height="28" 
                            loading="lazy" 
                            decoding="async"
                          />
                        ) : <Shield size={28} color="var(--text-dim)" className="team-badge-mini" />}
                        <span className="team-name">{match.teams_a?.name || 'A definir'}</span>
                        {isTeamAWinner && (
                          <span className="winner-pill" title="Vencedor">
                            <Trophy size={12} />
                            Venceu
                          </span>
                        )}
                      </div>
                      <div className="team-score">{effectiveStatus !== 'agendado' ? match.team_a_score : '-'}</div>
                    </div>
                    
                    <div className={`match-team ${isTeamBWinner ? 'winner' : ''}`}>
                      <div className="team-info">
                        {match.teams_b?.badge_url ? (
                          <img 
                            src={match.teams_b.badge_url} 
                            alt="" 
                            className="team-badge-mini" 
                            width="28" 
                            height="28" 
                            loading="lazy" 
                            decoding="async"
                          />
                        ) : <Shield size={28} color="var(--text-dim)" className="team-badge-mini" />}
                        <span className="team-name">{match.teams_b?.name || 'A definir'}</span>
                        {isTeamBWinner && (
                          <span className="winner-pill" title="Vencedor">
                            <Trophy size={12} />
                            Venceu
                          </span>
                        )}
                      </div>
                      <div className="team-score">{effectiveStatus !== 'agendado' ? match.team_b_score : '-'}</div>
                    </div>
                  </div>
                </div>
              );
            })}

            {phaseMatches.length === 0 && (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-dim)', fontWeight: 700, gridColumn: '1 / -1' }}>
                Nenhum jogo cadastrado para esta fase.
              </div>
            )}
          </div>
        </div>
      ) : showByGroup ? (
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
      
      <div style={{ position: 'absolute', top: 0, left: '-9999px', zIndex: -100, opacity: 0, pointerEvents: 'none' }}>
        <KnockoutTeiaExport id="teia-export-node" matches={matches} knockoutRounds={knockoutRoundCodes} />
      </div>

    </div>
  );
};

export default Standings;
