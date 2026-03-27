import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlayers, Player } from '../../hooks/usePlayers';
import { useTeams } from '../../hooks/useTeams';
import { Shield, ChevronLeft, User, Search, Users, Goal, Footprints } from 'lucide-react';
import PlayerProfileModal from './PlayerProfileModal';
import { getSuspensionFromCards } from '../../lib/discipline';
import './Players.css';

const Players: React.FC = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { players, loading: playersLoading, error: playersError, refresh: refreshPlayers } = usePlayers(teamId);
  const { teams } = useTeams();
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stuck, setStuck] = useState(false);
  const [brokenImageMap, setBrokenImageMap] = useState<Record<string, true>>({});

  const normalizeImageSrc = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
    try {
      return encodeURI(trimmed);
    } catch {
      return trimmed;
    }
  };

  const markImageBroken = (key: string) => {
    setBrokenImageMap((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  };

  useEffect(() => {
    if (!playersLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStuck(false);
      return;
    }
    const id = setTimeout(() => setStuck(true), 15000);
    return () => clearTimeout(id);
  }, [playersLoading]);
  
  const team = teams.find(t => t.id === teamId);
  const teamFromPlayers = useMemo(() => {
    if (!teamId || players.length === 0) return null;
    const first = players[0];
    return {
      name: first.team_name,
      badge_url: first.team_badge_url,
      group: first.team_group,
      leader: first.team_leader,
    };
  }, [teamId, players]);

  const resolvedTeamName = team?.name || teamFromPlayers?.name || 'Equipe';
  const resolvedTeamBadge = team?.badge_url || teamFromPlayers?.badge_url || '';
  const resolvedTeamGroup = team?.group || teamFromPlayers?.group || '';
  const resolvedTeamLeader = team?.leader || teamFromPlayers?.leader || '';
  const isGlobalView = !teamId;
  const teamBadgeKey = teamId ? `team-badge-${teamId}` : 'team-badge-global';

  const filteredPlayers = players.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.position.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if ((stuck || (!navigator.onLine && playersLoading)) && players.length === 0) {
    return (
      <div className="error-state glass" style={{ margin: '2rem auto', maxWidth: 720 }}>
        <p style={{ marginBottom: '0.75rem' }}>
          {!navigator.onLine
            ? 'Sem conexão no momento. Os jogadores vão carregar assim que a internet voltar.'
            : 'Demorou muito para carregar os jogadores.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refreshPlayers()}>
            Tentar novamente
          </button>
          <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => window.location.reload()}>
            Recarregar página
          </button>
        </div>
      </div>
    );
  }

  if (playersLoading && players.length === 0) return (
    <div className="players-loading">
      <div className="spinner"></div>
      <p>Convocando atletas...</p>
    </div>
  );
  
  if (playersError && players.length === 0) {
    return (
      <div className="error-state glass" style={{ margin: '2rem auto', maxWidth: 720 }}>
        <p style={{ marginBottom: '0.75rem' }}>Erro ao carregar jogadores: {playersError}</p>
        <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refreshPlayers()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="players-page animate-fade-in">
      {teamId && (
        <button className="btn-back-v2 glass" onClick={() => navigate('/equipes')}>
          <ChevronLeft size={18} /> 
          <span>Voltar para Arena</span>
        </button>
      )}

      <header className={`team-profile-header glass ${isGlobalView ? 'global-hub' : ''}`}>
        <div className="profile-branding">
          <div className="profile-badge-box">
            {isGlobalView ? (
              <Users size={64} color="var(--secondary)" />
            ) : resolvedTeamBadge && !brokenImageMap[teamBadgeKey] ? (
              <img 
                src={normalizeImageSrc(resolvedTeamBadge)} 
                alt={resolvedTeamName} 
                className="profile-badge-img" 
                width="64" 
                height="64" 
                loading="lazy" 
                decoding="async" 
                onError={() => markImageBroken(teamBadgeKey)}
              />
            ) : (
              <Shield size={64} color="var(--secondary)" />
            )}
          </div>
          <div className="profile-info-group">
            <h1>{isGlobalView ? 'Central de Atletas' : resolvedTeamName}</h1>
            <div className="profile-tags">
               {isGlobalView ? (
                 <span className="profile-tag group">Copa Unasp 2026</span>
               ) : (
                 <>
                   <span className="profile-tag group">{resolvedTeamGroup}</span>
                   <span className="profile-tag captain">Líder: {resolvedTeamLeader}</span>
                 </>
               )}
            </div>
          </div>
        </div>

        <div className="search-players-box glass">
          <Search size={18} color="var(--text-dim)" />
          <input 
            type="text" 
            placeholder="Pesquisar atleta ou posição..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="profile-highlights glass">
          <div className="h-stat">
            <strong>{filteredPlayers.length}</strong>
            <span>{searchTerm ? 'Encontrados' : 'Atletas'}</span>
          </div>
        </div>
      </header>

      <section className="roster-grid-section">
        <div className="roster-header">
           <User size={20} color="var(--secondary)" />
           <h2>Elenco Oficial</h2>
        </div>
        
        <div className="players-v2-grid">
          {filteredPlayers.length > 0 ? (
            filteredPlayers.map((player) => {
              const playerImageKey = `player-photo-${player.id}`;
              const hasValidPhoto = Boolean(player.photo_url && !brokenImageMap[playerImageKey]);
              return (
                <div 
                  key={player.id} 
                  className="player-card-v2 glass" 
                  onClick={() => setSelectedPlayer(player)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="p-header">
                    <div className="p-team-badge-chip" title={player.team_name || 'Equipe'}>
                      {player.team_badge_url && !brokenImageMap[`team-chip-${player.team_id}`] ? (
                        <img
                          src={normalizeImageSrc(player.team_badge_url)}
                          alt={player.team_name || 'Equipe'}
                          className="p-team-badge-img"
                          width="22"
                          height="22"
                          loading="lazy"
                          decoding="async"
                          onError={() => markImageBroken(`team-chip-${player.team_id}`)}
                        />
                      ) : (
                        <Shield size={16} color="var(--secondary)" />
                      )}
                    </div>
                    <div className="p-position">{player.position}</div>
                  </div>
                  
                  <div className="p-photo-wrapper">
                    {hasValidPhoto ? (
                      <img 
                        src={normalizeImageSrc(player.photo_url || '')} 
                        alt={player.name} 
                        className="p-photo" 
                        width="120" 
                        height="120" 
                        loading="lazy" 
                        decoding="async" 
                        onError={() => markImageBroken(playerImageKey)}
                      />
                    ) : (
                      <div className="p-photo-placeholder">
                        <User size={32} color="rgba(255,255,255,0.15)" />
                      </div>
                    )}
                  </div>
                  
                  <div className="p-info">
                     <h3>{player.name}</h3>
                     {isGlobalView && (
                       <div className="p-team-name">
                         {player.team_name || 'Time não encontrado'}
                       </div>
                     )}
                  </div>
                  
                  <div className="p-stats-v2">
                    <div className="p-stat-box">
                       <div className="p-stat-icon-wrap goal">
                         <Goal size={14} color="var(--secondary)" className="p-stat-icon" />
                       </div>
                       <strong>{player.goals_count}</strong>
                        <span>G</span>
                    </div>
                    <div className="p-stat-box">
                       <div className="p-stat-icon-wrap assist">
                         <Footprints size={14} color="#00b0ff" className="p-stat-icon" />
                       </div>
                       <strong>{player.assists}</strong>
                        <span>A</span>
                    </div>
                    <div className="p-stat-box">
                        <div className="p-stat-icon-wrap yellow-card">
                         <div className="p-card-icon yellow" />
                        </div>
                       <strong>{player.yellow_cards}</strong>
                        <span>C/A</span>
                    </div>
                    <div className="p-stat-box">
                        <div className="p-stat-icon-wrap red-card">
                         <div className="p-card-icon red" />
                        </div>
                       <strong>{player.red_cards}</strong>
                        <span>C/V</span>
                    </div>
                    <div className="p-cards">
                      {getSuspensionFromCards(player).isSuspended && (
                        <span className="p-suspension-badge">SUSPENSO</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-elenco glass">
              <p>{searchTerm ? 'Nenhum atleta encontrado com esse nome.' : 'O vestiário está vazio. Nenhum atleta cadastrado.'}</p>
            </div>
          )}
        </div>
      </section>

      <PlayerProfileModal 
        player={selectedPlayer} 
        onClose={() => setSelectedPlayer(null)} 
        teamName={selectedPlayer?.team_name || teams.find(t => t.id === selectedPlayer?.team_id)?.name}
      />
    </div>
  );
};

export default Players;
