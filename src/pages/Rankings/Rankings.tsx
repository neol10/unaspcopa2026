import React, { useState } from 'react';
import { motion } from 'framer-motion';
import './Rankings.css';
import { useRankings, RankingPlayer } from '../../hooks/useRankings';
import { Trophy, Activity, ShieldAlert, Zap, Medal, User } from 'lucide-react';
import PlayerProfileModal from '../Players/PlayerProfileModal';
import Skeleton from '../../components/Skeleton/Skeleton';

const Rankings: React.FC = () => {
  const { scorers, assistants, goalkeepers, galeraRank, disciplined, roundMvps, availableRounds, loading } = useRankings();
  const [selectedPlayer, setSelectedPlayer] = useState<RankingPlayer | null>(null);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);

  // Set default round once available
  React.useEffect(() => {
    if (!selectedRound && availableRounds.length > 0) {
      setSelectedRound(availableRounds[availableRounds.length - 1]);
    }
  }, [availableRounds, selectedRound]);

  if (loading && scorers.length === 0) return (
    <div className="rankings-container animate-fade-in">
      <header className="rankings-header">
        <div className="header-info">
          <Skeleton width="200px" height="40px" className="mb-2" />
          <Skeleton width="300px" height="20px" />
        </div>
      </header>
      <div className="rankings-featured-grid">
        <Skeleton width="100%" height="200px" borderRadius="16px" />
        <Skeleton width="100%" height="200px" borderRadius="16px" />
      </div>
      <div className="rankings-grid">
        <Skeleton width="100%" height="400px" />
        <Skeleton width="100%" height="400px" />
      </div>
    </div>
  );

  const top3Scorers = scorers.slice(0, 3);
  const roundWinner = selectedRound ? roundMvps[selectedRound] : null;

  // Podium order: 2nd, 1st, 3rd
  const podiumOrder = [
    top3Scorers[1] || null,
    top3Scorers[0] || null,
    top3Scorers[2] || null
  ];

  return (
    <div className="rankings-container animate-fade-in">
      <header className="rankings-header">
        <div className="header-info">
          <h1 className="text-gradient">Rankings & Stats</h1>
          <p>Os maiores talentos da Copa Unasp em números</p>
        </div>
        <div className="stat-summary-pill glass">
          <Activity size={16} color="var(--primary)" />
          {scorers.length + assistants.length + goalkeepers.length} Recordistas
        </div>
      </header>

      <div className="rankings-featured-grid">
        {/* Craque da Rodada - NOVO */}
        <section className="round-mvp-highlight glass animate-slide-up">
          <div className="panel-header-v2">
            <div className="header-title-group">
               <Trophy size={18} color="var(--secondary)" />
               <h3>Craque da Rodada</h3>
            </div>
            
            <div className="round-selector-tabs">
              {availableRounds.map(r => (
                <button 
                  key={r} 
                  className={`round-tab ${selectedRound === r ? 'active' : ''}`}
                  onClick={() => setSelectedRound(r)}
                >
                  {r}ª R
                </button>
              ))}
            </div>
          </div>

          {roundWinner ? (
            <div className="round-winner-card" onClick={() => setSelectedPlayer(roundWinner)}>
               <div className="winner-avatar-box">
                  {roundWinner.photo_url ? (
                    <img 
                      src={roundWinner.photo_url} 
                      alt="" 
                      width="64" 
                      height="64" 
                      loading="lazy" 
                    />
                  ) : (
                    <User size={32} />
                  )}
                  <div className="winner-badge">#1</div>
               </div>
               <div className="winner-details">
                  <h4>{roundWinner.name}</h4>
                  <span className="winner-team">{roundWinner.team_name}</span>
                  <p className="winner-reason">Destaque estatístico da {selectedRound}ª rodada.</p>
               </div>
            </div>
          ) : (
            <div className="round-empty-state">
               <Zap size={24} opacity={0.3} />
               <p>Selecione uma rodada finalizada.</p>
            </div>
          )}
        </section>

        {/* Podium for Top 3 Scorers */}
        <div className="scorers-podium glass animate-fade-in">
          {podiumOrder.map((player, idx) => {
            if (!player) return <div key={idx} className="podium-item empty"></div>;
            
            const isFirst = player.id === top3Scorers[0]?.id;
            const isSecond = player.id === top3Scorers[1]?.id;
            const positionClass = isFirst ? 'first-place' : isSecond ? 'second-place' : 'third-place';
            const rankLabel = isFirst ? '1º' : isSecond ? '2º' : '3º';

            return (
              <motion.div 
                key={player.id} 
                className={`podium-item ${positionClass}`}
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: idx * 0.15 }}
                onClick={() => setSelectedPlayer(player)}
              >
                <div className="podium-player-box glass">
                  <div className="podium-avatar-wrapper">
                    {player.photo_url ? (
                      <img src={player.photo_url} alt={player.name} className="podium-avatar" />
                    ) : (
                      <div className="podium-avatar" style={{ background: 'var(--bg-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <User size={isFirst ? 48 : 32} />
                      </div>
                    )}
                    <div className="podium-rank-badge">{rankLabel}</div>
                  </div>
                  <div className="podium-player-name">{player.name.split(' ')[0]}</div>
                  <div className="podium-player-team">{player.team_name}</div>
                  <div className="podium-stat-bubble">{player.goals_count} G</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="rankings-grid">
        {/* Artilharia */}
        <section className="rank-panel glass">
          <div className="panel-header">
            <Trophy size={20} color="#facc15" />
            <h3>Artilharia do Torneio</h3>
          </div>
          <div className="rank-rows">
            {scorers.map((p, i) => (
              <div key={p.id} className="rank-row-item glass-hover" onClick={() => setSelectedPlayer(p)}>
                <div className="rank-idx">{i + 1}º</div>
                <div className="rank-avatar">
                  {p.photo_url ? (
                    <img 
                      src={p.photo_url} 
                      alt={p.name} 
                      width="32" 
                      height="32" 
                      loading="lazy" 
                    />
                  ) : <div className="avatar-dummy"><User size={14} /></div>}
                </div>
                <div className="rank-player">
                  <div className="player-name-wrapper">
                    <strong>{p.name}</strong>
                    <div className="team-mini-info">
                      {p.team_badge_url && (
                        <img 
                          src={p.team_badge_url} 
                          alt="" 
                          className="mini-badge" 
                          width="16" 
                          height="16" 
                          loading="lazy" 
                        />
                      )}
                      <span>{p.team_name}</span>
                    </div>
                  </div>
                </div>
                <div className="rank-val">{p.goals_count} G</div>
              </div>
            ))}
            {scorers.length === 0 && <p className="empty-rank">Nenhum gol registrado.</p>}
          </div>
        </section>

        {/* Luva de Ouro */}
        <section className="rank-panel glass highlighted-gold">
          <div className="panel-header">
            <ShieldAlert size={20} color="#facc15" />
            <h3>Luva de Ouro</h3>
          </div>
          <div className="rank-rows">
            {goalkeepers.map((p, i) => (
              <div key={p.id} className="rank-row-item glass-hover" onClick={() => setSelectedPlayer(p)}>
                <div className="rank-idx">{i + 1}º</div>
                <div className="rank-avatar">
                   {p.photo_url ? <img src={p.photo_url} alt={p.name} /> : <div className="avatar-dummy"><User size={14} /></div>}
                </div>
                <div className="rank-player">
                   <div className="player-name-wrapper">
                     <strong>{p.name}</strong>
                     <div className="team-mini-info">
                        {p.team_badge_url && <img src={p.team_badge_url} alt="" className="mini-badge" />}
                        <span>{p.team_name}</span>
                     </div>
                   </div>
                </div>
                <div className="rank-val">{p.clean_sheets || 0} Clean Sheets</div>
              </div>
            ))}
            {goalkeepers.length === 0 && <p className="empty-rank">Aguardando súmulas...</p>}
          </div>
        </section>

        {/* Craque da Galera */}
        <section className="rank-panel glass highlighted-purple">
          <div className="panel-header">
            <Medal size={20} color="#a855f7" />
            <div className="header-text-stacked">
              <h3>Craque da Galera</h3>
              <small>Prêmio final de encerramento</small>
            </div>
          </div>
          <div className="rank-rows">
            {galeraRank.map((p, i) => (
              <div key={p.id} className="rank-row-item glass-hover" onClick={() => setSelectedPlayer(p)}>
                <div className="rank-idx">{i + 1}º</div>
                <div className="rank-avatar">
                   {p.photo_url ? <img src={p.photo_url} alt={p.name} /> : <div className="avatar-dummy"><User size={14} /></div>}
                </div>
                <div className="rank-player">
                   <div className="player-name-wrapper">
                     <strong>{p.name}</strong>
                     <div className="team-mini-info">
                        {p.team_badge_url && <img src={p.team_badge_url} alt="" className="mini-badge" />}
                        <span>{p.team_name}</span>
                     </div>
                   </div>
                </div>
                <div className="rank-val">{p.mvp_votes} Votos</div>
              </div>
            ))}
            {galeraRank.length === 0 && <p className="empty-rank">Sem votações abertas.</p>}
          </div>
        </section>

        {/* Assistências */}
        <section className="rank-panel glass">
          <div className="panel-header">
            <Zap size={20} color="var(--accent-blue)" />
            <h3>Garçons da Copa</h3>
          </div>
          <div className="rank-rows">
            {assistants.map((p, i) => (
              <div key={p.id} className="rank-row-item glass-hover" onClick={() => setSelectedPlayer(p)}>
                <div className="rank-idx">{i + 1}º</div>
                <div className="rank-avatar">
                  {p.photo_url ? (
                    <img 
                      src={p.photo_url} 
                      alt={p.name} 
                      width="32" 
                      height="32" 
                      loading="lazy" 
                    />
                  ) : <div className="avatar-dummy"><User size={14} /></div>}
                </div>
                <div className="rank-player">
                  <div className="player-name-wrapper">
                    <strong>{p.name}</strong>
                    <div className="team-mini-info">
                      {p.team_badge_url && (
                        <img 
                          src={p.team_badge_url} 
                          alt="" 
                          className="mini-badge" 
                          width="16" 
                          height="16" 
                          loading="lazy" 
                        />
                      )}
                      <span>{p.team_name}</span>
                    </div>
                  </div>
                </div>
                <div className="rank-val">{p.assists} ASS</div>
              </div>
            ))}
            {assistants.length === 0 && <p className="empty-rank">Nenhuma assistência.</p>}
          </div>
        </section>

        {/* Disciplina */}
        <section className="rank-panel glass">
          <div className="panel-header">
            <ShieldAlert size={20} color="var(--primary)" />
            <h3>Fair Play / Cartões</h3>
          </div>
          <div className="rank-rows">
            {disciplined.map((p, i) => (
              <div key={p.id} className="rank-row-item glass-hover" onClick={() => setSelectedPlayer(p)}>
                <div className="rank-idx">{i + 1}º</div>
                <div className="rank-avatar">
                  {p.photo_url ? (
                    <img 
                      src={p.photo_url} 
                      alt={p.name} 
                      width="32" 
                      height="32" 
                      loading="lazy" 
                    />
                  ) : <div className="avatar-dummy"><User size={14} /></div>}
                </div>
                <div className="rank-player">
                  <div className="player-name-wrapper">
                    <strong>{p.name}</strong>
                    <div className="team-mini-info">
                      {p.team_badge_url && (
                        <img 
                          src={p.team_badge_url} 
                          alt="" 
                          className="mini-badge" 
                          width="16" 
                          height="16" 
                          loading="lazy" 
                        />
                      )}
                      <span>{p.team_name}</span>
                    </div>
                  </div>
                </div>
                <div className="rank-cards">
                  {p.yellow_cards > 0 && <span className="p-card-new yellow">{p.yellow_cards}</span>}
                  {p.red_cards > 0 && <span className="p-card-new red">{p.red_cards}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <PlayerProfileModal 
        player={selectedPlayer} 
        onClose={() => setSelectedPlayer(null)} 
      />
    </div>
  );
};

export default Rankings;
