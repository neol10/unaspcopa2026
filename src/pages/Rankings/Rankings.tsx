import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import './Rankings.css';
import { useRankings, RankingPlayer } from '../../hooks/useRankings';
import { Trophy, Activity, ShieldAlert, Zap, User } from 'lucide-react';
import PlayerProfileModal from '../Players/PlayerProfileModal';
import Skeleton, { SkeletonRankingRow } from '../../components/Skeleton/Skeleton';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';

const Rankings: React.FC = () => {
  const { scorers, assistants, goalkeepers, disciplined, roundMvps, availableRounds, loading, error, refresh } = useRankings();
  const [selectedPlayer, setSelectedPlayer] = useState<RankingPlayer | null>(null);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!loading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStuck(false);
      return;
    }
    const id = setTimeout(() => setStuck(true), 15000);
    return () => clearTimeout(id);
  }, [loading]);

  // Set default round once available
  React.useEffect(() => {
    if (!selectedRound && availableRounds.length > 0) {
      setSelectedRound(availableRounds[availableRounds.length - 1]);
    }
  }, [availableRounds, selectedRound]);

  if ((stuck || (!navigator.onLine && loading)) && scorers.length === 0 && assistants.length === 0 && goalkeepers.length === 0) {
    return (
      <div className="rankings-container animate-fade-in">
        <div className="empty-state glass">
          <p style={{ marginBottom: '0.75rem' }}>
            {!navigator.onLine
              ? 'Sem conexão no momento. Os rankings vão carregar assim que a internet voltar.'
              : 'Demorou muito para carregar os rankings.'}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refresh()}>
              Tentar novamente
            </button>
            <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => window.location.reload()}>
              Recarregar página
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error && scorers.length === 0 && assistants.length === 0 && goalkeepers.length === 0) {
    return (
      <div className="rankings-container animate-fade-in">
        <div className="empty-state glass">
          <p>Erro ao carregar os rankings. Verifique sua conexão e tente novamente.</p>
        </div>
      </div>
    );
  }

  const { containerRef, isPulling, pullDistance, isRefreshing } = usePullToRefresh({
    onRefresh: async () => {
      await refresh();
    }
  });

  if (loading && scorers.length === 0) return (
    <div className="rankings-container animate-fade-in" style={{ overflowY: 'auto', height: '100%' }}>
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
        <div className="rank-panel glass">
          <div className="panel-header">
            <Skeleton width="150px" height="24px" />
          </div>
          <div className="rank-rows">
            {[1, 2, 3].map(i => <SkeletonRankingRow key={i} />)}
          </div>
        </div>
        <div className="rank-panel glass">
          <div className="panel-header">
            <Skeleton width="150px" height="24px" />
          </div>
          <div className="rank-rows">
            {[1, 2, 3].map(i => <SkeletonRankingRow key={i} />)}
          </div>
        </div>
      </div>
    </div>
  );

  const hasScorers = scorers.length > 0;
  const top3Scorers = scorers.slice(0, 3);
  const roundWinner = selectedRound ? roundMvps[selectedRound] : null;

  // Podium order: 2nd, 1st, 3rd
  const podiumOrder = [
    top3Scorers[1] || null,
    top3Scorers[0] || null,
    top3Scorers[2] || null
  ];

  return (
    <div className="rankings-container animate-fade-in" ref={containerRef} style={{ overflowY: 'auto', height: '100%' }}>
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

      <header className="rankings-header">
        <div className="header-info">
          <h1 className="text-gradient">Rankings & Stats</h1>
          <p>Os maiores talentos da Copa Unasp em números</p>
        </div>
        <div className="stat-summary-pill glass">
          <Activity size={16} color="var(--primary)" />
          {scorers.length + assistants.length + goalkeepers.length} Destaques da Copa
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
                  type="button"
                  aria-pressed={selectedRound === r}
                >
                  {r}ª R
                </button>
              ))}
            </div>
          </div>

          {roundWinner ? (
            <div
              className="round-winner-card"
              onClick={() => setSelectedPlayer(roundWinner)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedPlayer(roundWinner);
                }
              }}
            >
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
        {hasScorers ? (
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
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedPlayer(player);
                    }
                  }}
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
        ) : (
          <div className="scorers-podium glass animate-fade-in podium-empty">
            <Zap size={22} opacity={0.35} />
            <p>Sem dados de artilharia no momento.</p>
          </div>
        )}
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
                <div className="rank-val">{p.goals_conceded || 0} Gols Sofridos</div>
              </div>
            ))}
            {goalkeepers.length === 0 && <p className="empty-rank">Aguardando súmulas...</p>}
          </div>
        </section>

        {/* Assistências */}
        <section className="rank-panel glass">
          <div className="panel-header">
            <Zap size={20} color="var(--accent-blue)" />
            <h3>Assistências da Copa</h3>
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
                  <span className="p-card-new yellow">{p.yellow_cards || 0}</span>
                  <span className="p-card-new red">{p.red_cards || 0}</span>
                </div>
                <div className="rank-val">{p.fair_play_points || 0} pts</div>
              </div>
            ))}
            {disciplined.length === 0 && <p className="empty-rank">Sem dados de cartões.</p>}
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
