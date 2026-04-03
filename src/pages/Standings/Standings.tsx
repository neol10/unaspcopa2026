import React, { useEffect, useState } from 'react';
import './Standings.css';
import { Shield, Info, LayoutGrid, List, Trophy } from 'lucide-react';
import { useStandings } from '../../hooks/useStandings';
import { useAuthContext } from '../../contexts/AuthContext';
import Skeleton, { SkeletonStandingsRow } from '../../components/Skeleton/Skeleton';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';

const Standings: React.FC = () => {
  const { standings, loading, error, refresh, paused } = useStandings();
  const { role } = useAuthContext();
  const [showByGroup, setShowByGroup] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [stuck, setStuck] = useState(false);
  const isAdmin = role === 'admin';

  useEffect(() => {
    if (!loading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStuck(false);
      return;
    }
    const id = setTimeout(() => setStuck(true), 15000);
    return () => clearTimeout(id);
  }, [loading]);

  if ((paused || stuck) && standings.length === 0) {
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

  const { containerRef, isPulling, pullDistance, isRefreshing } = usePullToRefresh({
    onRefresh: async () => {
      await refresh();
    }
  });

  if (loading && standings.length === 0) return (
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
  
  if (error && standings.length === 0) {
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

  const getGroupRankColorClass = (index: number) => {
    if (index <= 2) return 'rank-green';
    if (index === 3) return 'rank-yellow';
    if (index === 4) return 'rank-red';
    return '';
  };

  const getOverallRankColorClass = (index: number) => {
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
          <div className="status-pill glass">
            <div className="live-dot"></div>
            Tempo Real
          </div>
        </div>
      </header>

      {showByGroup && groupNames.length > 1 && (
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
                    <tr key={team.team_id} className={`row-animate group-rank ${getGroupRankColorClass(index)}`}>
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
                  <tr key={team.team_id} className={`row-animate overall-rank ${getOverallRankColorClass(index)}`}>
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

      <footer className="standings-footer glass">
        <div className="legend">
          {showByGroup ? (
            <>
              <div className="legend-item">
                <span className="box-green"></span>
                <span>1º, 2º e 3º colocados</span>
              </div>
              <div className="legend-item">
                <span className="box-yellow"></span>
                <span>4º colocado</span>
              </div>
              <div className="legend-item">
                <span className="box-red"></span>
                <span>5º colocado</span>
              </div>
            </>
          ) : (
            <>
              <div className="legend-item">
                <span className="box-green"></span>
                <span>1º, 2º e 3º colocados</span>
              </div>
              <div className="legend-item">
                <span className="box-blue"></span>
                <span>4º, 5º e 6º colocados</span>
              </div>
              <div className="legend-item">
                <span className="box-yellow"></span>
                <span>7º, 8º e 9º colocados</span>
              </div>
              <div className="legend-item">
                <span className="box-red"></span>
                <span>10º colocado</span>
              </div>
            </>
          )}
        </div>
        <div className="standings-tip">
          <Info size={14} />
          <span>Critérios de desempate: 1. Vitórias | 2. Saldo de Gols | 3. Gols Pró</span>
        </div>
      </footer>
    </div>
  );
};

export default Standings;
