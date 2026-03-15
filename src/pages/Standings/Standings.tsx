import React, { useState } from 'react';
import './Standings.css';
import { Shield, Info, LayoutGrid, List, Trophy } from 'lucide-react';
import { useStandings } from '../../hooks/useStandings';

const Standings: React.FC = () => {
  const { standings, loading, error } = useStandings();
  const [showByGroup, setShowByGroup] = useState(true);

  if (loading) return (
    <div className="standings-loading animate-fade-in">
      <div className="spinner"></div>
      <p>Processando estatísticas...</p>
    </div>
  );
  
  if (error) return <div className="error-state glass">Erro: {error}</div>;

  // Agrupar equipes por grupo
  const groupedStandings = standings.reduce((acc: Record<string, typeof standings>, team) => {
    const groupName = team.group || 'Geral';
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(team);
    return acc;
  }, {});

  return (
    <div className="standings-container animate-fade-in">
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

      {showByGroup ? (
        Object.entries(groupedStandings).map(([groupName, groupTeams]) => (
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
                  </tr>
                </thead>
                <tbody>
                  {groupTeams.map((team, index) => (
                    <tr key={team.team_id} className={`row-animate ${index < 4 ? 'zone-up' : index >= groupTeams.length - 2 ? 'zone-down' : ''}`}>
                      <td className="col-rank">
                        <span className="rank-num">{index + 1}</span>
                      </td>
                      <td className="col-name">
                        <div className="team-cell">
                          <div className="team-shield">
                            <Shield size={18} color={index === 0 ? 'var(--secondary)' : 'var(--text-dim)'} />
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
                    </tr>
                  ))}
                </tbody>
              </table>
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
                </tr>
              </thead>
              <tbody>
                {standings.map((team, index) => (
                  <tr key={team.team_id} className={`row-animate ${index < 8 ? 'zone-up' : index >= standings.length - 4 ? 'zone-down' : ''}`}>
                    <td className="col-rank">
                      <span className="rank-num">{index + 1}</span>
                    </td>
                    <td className="col-name">
                      <div className="team-cell">
                        <div className="team-shield">
                          <Shield size={18} color={index === 0 ? 'var(--secondary)' : 'var(--text-dim)'} />
                        </div>
                        <div className="team-info-v2">
                          <strong>{team.team_name}</strong>
                          <span className="team-group-tag">{team.group}</span>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <footer className="standings-footer glass">
        <div className="legend">
          <div className="legend-item">
            <span className="box-green"></span>
            <span>G4 - Classificação Direta</span>
          </div>
          <div className="legend-item">
            <span className="box-red"></span>
            <span>Zona de Risco</span>
          </div>
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
