import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlayers, Player } from '../../hooks/usePlayers';
import { useTeams } from '../../hooks/useTeams';
import { Shield, ChevronLeft, User, Star, Search, Users } from 'lucide-react';
import PlayerProfileModal from './PlayerProfileModal';
import './Players.css';

const Players: React.FC = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { players, loading: playersLoading, error: playersError } = usePlayers(teamId);
  const { teams } = useTeams();
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const team = teams.find(t => t.id === teamId);
  const isGlobalView = !teamId;

  const filteredPlayers = players.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.position.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (playersLoading) return (
    <div className="players-loading">
      <div className="spinner"></div>
      <p>Convocando atletas...</p>
    </div>
  );
  
  if (playersError) return <div className="error-state glass">Erro: {playersError}</div>;

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
            ) : team?.badge_url ? (
              <img src={team.badge_url} alt={team.name} className="profile-badge-img" />
            ) : (
              <Shield size={64} color="var(--secondary)" />
            )}
          </div>
          <div className="profile-info-group">
            <h1>{isGlobalView ? 'Hub de Atletas' : (team?.name || 'Equipe')}</h1>
            <div className="profile-tags">
               {isGlobalView ? (
                 <span className="profile-tag group">Copa Unasp 2026</span>
               ) : (
                 <>
                   <span className="profile-tag group">{team?.group}</span>
                   <span className="profile-tag captain">Líder: {team?.leader}</span>
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
              const playerTeam = teams.find(t => t.id === player.team_id);
              return (
                <div 
                  key={player.id} 
                  className="player-card-v2 glass" 
                  onClick={() => setSelectedPlayer(player)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="p-header">
                    <div className="p-num-box">
                      <span className="p-num">#{player.number}</span>
                      <div className="p-num-glow"></div>
                    </div>
                    <div className="p-position">{player.position}</div>
                  </div>
                  
                  <div className="p-photo-wrapper">
                    {player.photo_url ? (
                      <img src={player.photo_url} alt={player.name} className="p-photo" />
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
                         {playerTeam?.name || 'Time não encontrado'}
                       </div>
                     )}
                  </div>
                  
                  <div className="p-stats-v2">
                    <div className="p-stat-box">
                       <Star size={14} color="var(--secondary)" />
                       <strong>{player.goals_count}</strong>
                       <span>Gols</span>
                    </div>
                    <div className="p-stat-box">
                       <strong>{player.assists}</strong>
                       <span>Ast</span>
                    </div>
                    <div className="p-cards">
                      {player.yellow_cards > 0 && <span className="p-card-mini yellow">{player.yellow_cards}</span>}
                      {player.red_cards > 0 && <span className="p-card-mini red">{player.red_cards}</span>}
                      {(player.red_cards > 0 || player.yellow_cards >= 3) && (
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
        teamName={teams.find(t => t.id === selectedPlayer?.team_id)?.name}
      />
    </div>
  );
};

export default Players;
