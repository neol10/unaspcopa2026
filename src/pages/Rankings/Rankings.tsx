import React, { useState } from 'react';
import './Rankings.css';
import { useRankings, RankingPlayer } from '../../hooks/useRankings';
import { Trophy, Activity, ShieldAlert, Zap, Medal, User } from 'lucide-react';
import PlayerProfileModal from '../Players/PlayerProfileModal';

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

  if (loading) return (
    <div className="rankings-loading animate-fade-in">
      <div className="spinner"></div>
      <p>Computando recordes...</p>
    </div>
  );

  const topScorer = scorers[0];
  const roundWinner = selectedRound ? roundMvps[selectedRound] : null;

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
                    <img src={roundWinner.photo_url} alt="" />
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

        {topScorer && (
          <div className="highlight-hero glass animate-fade-in" onClick={() => setSelectedPlayer(topScorer)}>
            <div className="hero-label">Chuteira de Ouro</div>
            <div className="hero-body">
              <div className="hero-player-icon">
                <Medal size={60} color="var(--secondary)" />
              </div>
              <div className="hero-player-info">
                <h2>{topScorer.name}</h2>
                <p>{topScorer.team_name}</p>
                <div className="hero-stats">
                  <div className="h-stat">
                    <strong>{topScorer.goals_count}</strong>
                    <span>Gols</span>
                  </div>
                  <div className="h-stat">
                    <strong>{topScorer.assists || 0}</strong>
                    <span>Assistências</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="hero-footer-text">Líder isolado da artilharia</div>
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
                <div className="rank-val">{p.assists} A</div>
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
