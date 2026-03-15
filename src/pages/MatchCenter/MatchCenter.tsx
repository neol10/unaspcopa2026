import React, { useState, useEffect } from 'react';
import { useMatches } from '../../hooks/useMatches';
import { useMatchEvents } from '../../hooks/useMatchEvents';
import { usePlayers } from '../../hooks/usePlayers';
import { useMvpVoting } from '../../hooks/useMvpVoting';
import { useMatchMvpVoting } from '../../hooks/useMatchMvpVoting';
import Skeleton from '../../components/Skeleton/Skeleton';
import { useTournamentConfig } from '../../hooks/useTournamentConfig';
import { useAuthContext } from '../../contexts/AuthContext';
import { Shield, Timer, Award, Zap, History, Target, Square, Vote, Download, Trophy } from 'lucide-react';
import ShareCard, { useShareCard } from '../../components/ShareCard/ShareCard';
import './MatchCenter.css';

const MatchCenter: React.FC = () => {
  const { matches, loading: matchesLoading } = useMatches();
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  
  const activeMatch = selectedMatchId 
    ? matches.find(m => m.id === selectedMatchId) 
    : matches.find(m => m.status === 'ao_vivo') || matches[0];

  const [elapsedTime, setElapsedTime] = useState('00:00');

  const { events, loading: eventsLoading } = useMatchEvents(activeMatch?.id || '');
  const { players } = usePlayers();
  const { user } = useAuthContext();
  const { config } = useTournamentConfig();
  const { voteCounts: roundVotes, userVote: roundUserVote, vote: castRoundVote, loading: roundMvpLoading } = useMvpVoting(String(config.current_round));
  const { voteCounts: matchVotes, userVote: matchUserVote, vote: castMatchVote, loading: matchMvpLoading } = useMatchMvpVoting(activeMatch?.id || '');
  
  const { cardRef, downloadCard } = useShareCard();
  const [isExporting, setIsExporting] = useState(false);

  // Lógica do Cronômetro em Tempo Real
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeMatch?.status === 'ao_vivo') {
      interval = setInterval(() => {
        const start = new Date(activeMatch.match_date).getTime();
        const now = new Date().getTime();
        const seconds = Math.floor((now - start) / 1000);
        
        if (seconds > 0) {
          const mins = Math.floor(seconds / 60);
          const secs = seconds % 60;
          setElapsedTime(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
        } else {
          setElapsedTime('00:00');
        }
      }, 1000);
    } else {
      setElapsedTime(activeMatch?.status === 'finalizado' ? 'Fim' : 'Pré-jogo');
    }
    return () => clearInterval(interval);
  }, [activeMatch]);

  // Histórico H2H
  const h2hMatches = matches.filter(m => 
    m.status === 'finalizado' &&
    ((m.team_a_id === activeMatch?.team_a_id && m.team_b_id === activeMatch?.team_b_id) ||
     (m.team_a_id === activeMatch?.team_b_id && m.team_b_id === activeMatch?.team_a_id))
  ).slice(0, 3);

  const handleDownloadCard = async () => {
    if (!activeMatch) return;
    setIsExporting(true);
    await downloadCard(activeMatch.id);
    setIsExporting(false);
  };

  if (matchesLoading) return (
    <div className="match-center animate-fade-in" style={{ padding: '2rem' }}>
       <Skeleton width="100%" height="80px" borderRadius="16px" className="mb-4" />
       <div className="match-layout">
          <div className="match-primary">
             <Skeleton width="100%" height="400px" borderRadius="16px" />
             <Skeleton width="100%" height="200px" borderRadius="16px" className="mt-4" />
          </div>
          <aside className="match-side">
             <Skeleton width="100%" height="300px" borderRadius="16px" />
          </aside>
       </div>
    </div>
  );
  
  if (!activeMatch) return <div className="empty-state glass">Nenhuma partida programada.</div>;

  return (
    <div className="match-center animate-fade-in">
      {/* Seletor de Partidas */}
      <div className="match-selector-bar glass">
        <div className="selector-header-row">
          <div className="selector-title">
            <Zap size={16} color="var(--secondary)" />
            Rodada Atual
          </div>
          <div className="live-status-badge">
            <div className="pulse-dot"></div>
            <span>Sincronização Ativa</span>
          </div>
        </div>
        <div className="selector-list">
          {matches.map(m => (
            <button 
              key={m.id} 
              className={`match-pill ${activeMatch.id === m.id ? 'active' : ''}`}
              onClick={() => setSelectedMatchId(m.id)}
            >
              <span className="pill-teams">{m.teams_a?.name.substring(0,3)} x {m.teams_b?.name.substring(0,3)}</span>
              {m.status === 'ao_vivo' && <span className="live-dot-mini"></span>}
            </button>
          ))}
        </div>
      </div>

      <div className="match-layout">
        <div className="match-primary">
          {/* Scoreboard */}
          <section className="live-scoreboard glass">
            <div className="scoreboard-top">
              <span className="location">{activeMatch.location}</span>
              <div className={`match-badge ${activeMatch.status}`}>
                {activeMatch.status === 'ao_vivo' ? 'AO VIVO' : activeMatch.status.toUpperCase()}
              </div>
            </div>

            <div className="scoreboard-main">
              <div className="sb-team">
                <div className="sb-shield glass">
                  {activeMatch.teams_a?.badge_url ? (
                    <img src={activeMatch.teams_a.badge_url} alt="" />
                  ) : <Shield size={48} color="var(--secondary)" />}
                </div>
                <h3>{activeMatch.teams_a?.name}</h3>
              </div>

              <div className="sb-score">
                <div className="score-numbers">
                  <span className="num">{activeMatch.team_a_score}</span>
                  <span className="vs">:</span>
                  <span className="num">{activeMatch.team_b_score}</span>
                </div>
                <div className="sb-timer active">
                  <Timer size={14} className={activeMatch.status === 'ao_vivo' ? 'animate-pulse' : ''} />
                  <span>{elapsedTime}</span>
                </div>
              </div>

              <div className="sb-team">
                <div className="sb-shield glass">
                  {activeMatch.teams_b?.badge_url ? (
                    <img src={activeMatch.teams_b.badge_url} alt="" />
                  ) : <Shield size={48} color="var(--primary)" />}
                </div>
                <h3>{activeMatch.teams_b?.name}</h3>
              </div>
            </div>
            
            <div className="scoreboard-bottom">
              <div className="live-progress">
                <div className="progress-bar" style={{ width: activeMatch.status === 'ao_vivo' ? '50%' : '100%' }}></div>
              </div>
            </div>

            {/* Craque do Jogo */}
            {(activeMatch as any).match_mvp_player_id && (
              <div className="match-mvp-badge glass animate-slide-up">
                <Award size={20} className="glow-icon" />
                <div className="mvp-details">
                  <span className="mvp-label">CRAQUE DO JOGO</span>
                  <span className="mvp-name">
                    {players.find(p => p.id === (activeMatch as any).match_mvp_player_id)?.name}
                  </span>
                  {(activeMatch as any).match_mvp_description && (
                    <p className="mvp-desc">"{(activeMatch as any).match_mvp_description}"</p>
                  )}
                </div>
              </div>
            )}

            <div className="scoreboard-actions">
              <button 
                className="btn-share-result" 
                onClick={handleDownloadCard}
                disabled={isExporting}
              >
                {isExporting ? <div className="spinner-mini"></div> : <Download size={18} />}
                Baixar Card de Resultado
              </button>
            </div>

            {/* Craque da Galera (Votação Pública) - Quando Finalizado */}
            {activeMatch.status === 'finalizado' && matchVotes.length > 0 && (
              <div className="match-public-mvp glass animate-slide-up">
                <Vote size={20} color="var(--accent-blue)" />
                <div className="mvp-details">
                  <span className="mvp-label">CRAQUE DA GALERA (VOTADO)</span>
                  <span className="mvp-name">{matchVotes[0].player_name}</span>
                  <span className="mvp-vote-info">{matchVotes[0].vote_count} votos da torcida</span>
                </div>
              </div>
            )}
          </section>

          {/* ShareCard Template */}
          <ShareCard 
            match={activeMatch} 
            mvpPlayer={players.find(p => p.id === (activeMatch as any).match_mvp_player_id)} 
            innerRef={cardRef} 
          />

          {/* Timeline de Lances */}
          <section className="match-timeline-v2 glass">
            <div className="section-header">
              <History size={20} color="var(--secondary)" />
              <h2>Lances da Partida</h2>
            </div>
            
            <div className="timeline-v2-list">
              {eventsLoading ? (
                <div className="mini-spinner"></div>
              ) : events.length > 0 ? (
                events.map((event) => (
                  <div key={event.id} className="t-event animate-fade-in">
                    <div className="t-time">{event.minute}'</div>
                    <div className="t-icon-box">
                      {event.event_type === 'gol' && <Trophy size={14} color="var(--secondary)" />}
                      {event.event_type === 'amarelo' && <div className="card-yellow"></div>}
                      {event.event_type === 'vermelho' && <div className="card-red"></div>}
                      {event.event_type === 'comentario' && <Zap size={14} color="var(--accent-blue)" />}
                    </div>
                    <div className="t-content glass">
                      <div className="t-header">
                        <span className="t-type">
                          {event.event_type === 'gol' ? 'GOL!' : 
                           event.event_type === 'amarelo' ? 'Cartão Amarelo' :
                           event.event_type === 'vermelho' ? 'Cartão Vermelho' : 'Informação'}
                        </span>
                      </div>
                      <p>
                        <strong>{event.players?.name}</strong>
                        {event.event_type === 'gol' && event.assistant_id && (
                          <span className="assistant">
                             Assistência: {players.find(p => p.id === event.assistant_id)?.name}
                          </span>
                        )}
                        {event.event_type === 'comentario' && event.commentary}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="empty-msg">Nenhum lance importante registrado.</p>
              )}
            </div>

            <div className="live-commentary-feed glass">
              <div className="feed-header">
                <div className="live-indicator"></div>
                <h3>Comentários ao Vivo</h3>
              </div>
              <div className="feed-content">
                {events.filter(e => e.event_type === 'comentario').map(ev => (
                  <div key={ev.id} className="comment-bubble animate-slide-up">
                    <span className="comment-time">{ev.minute}'</span>
                    <p className="commentary-text">{ev.commentary}</p>
                  </div>
                ))}
                {events.filter(e => e.event_type === 'comentario').length === 0 && (
                  <p className="empty-feed">Aguardando lances da partida...</p>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="match-side">
          {/* Estatísticas */}
          <div className="match-stats-preview glass">
              <div className="side-header">
                <Award size={18} color="var(--secondary)" />
                <h3>Estatísticas da Partida</h3>
              </div>
              <div className="mini-stats">
                <div className="m-stat-card duel-mode">
                  <div className="stat-duel-header">
                    <span className="val-a">{activeMatch.team_a_score}</span>
                    <div className="stat-label-centered">
                      <Target size={14} className="stat-icon-goal" />
                      <span>GOLS</span>
                    </div>
                    <span className="val-b">{activeMatch.team_b_score}</span>
                  </div>
                  <div className="m-stat-bar-wrapper">
                    <div className="m-stat-bar team-a" style={{ width: `${(activeMatch.team_a_score / (activeMatch.team_a_score + activeMatch.team_b_score || 1)) * 100}%` }}></div>
                    <div className="m-stat-bar team-b" style={{ width: `${(activeMatch.team_b_score / (activeMatch.team_a_score + activeMatch.team_b_score || 1)) * 100}%` }}></div>
                  </div>
                </div>

                {(() => {
                  const yellowA = events.filter(e => e.event_type === 'amarelo' && players.find(p => p.id === e.player_id)?.team_id === activeMatch.team_a_id).length;
                  const yellowB = events.filter(e => e.event_type === 'amarelo' && players.find(p => p.id === e.player_id)?.team_id === activeMatch.team_b_id).length;
                  const totalYellow = yellowA + yellowB || 1;
                  return (
                    <div className="m-stat-card duel-mode">
                      <div className="stat-duel-header">
                        <span className="val-a">{yellowA}</span>
                        <div className="stat-label-centered">
                          <Square size={14} fill="#fbbf24" stroke="#fbbf24" style={{ borderRadius: '2px' }} />
                          <span>AMARELOS</span>
                        </div>
                        <span className="val-b">{yellowB}</span>
                      </div>
                      <div className="m-stat-bar-wrapper">
                        <div className="m-stat-bar yellow-a" style={{ width: `${(yellowA / totalYellow) * 100}%` }}></div>
                        <div className="m-stat-bar yellow-b" style={{ width: `${(yellowB / totalYellow) * 100}%` }}></div>
                      </div>
                    </div>
                  );
                })()}

                {(() => {
                  const redA = events.filter(e => e.event_type === 'vermelho' && players.find(p => p.id === e.player_id)?.team_id === activeMatch.team_a_id).length;
                  const redB = events.filter(e => e.event_type === 'vermelho' && players.find(p => p.id === e.player_id)?.team_id === activeMatch.team_b_id).length;
                  const totalRed = redA + redB || 1;
                  return (
                    <div className="m-stat-card duel-mode">
                      <div className="stat-duel-header">
                        <span className="val-a">{redA}</span>
                        <div className="stat-label-centered">
                          <Square size={14} fill="#ef4444" stroke="#ef4444" style={{ borderRadius: '2px' }} />
                          <span>VERMELHOS</span>
                        </div>
                        <span className="val-b">{redB}</span>
                      </div>
                      <div className="m-stat-bar-wrapper">
                        <div className="m-stat-bar red-a" style={{ width: `${(redA / totalRed) * 100}%` }}></div>
                        <div className="m-stat-bar red-b" style={{ width: `${(redB / totalRed) * 100}%` }}></div>
                      </div>
                    </div>
                  );
                })()}
              </div>
          </div>

          {/* Votação MVP: Craque da Galera */}
          <div className="vote-widget glass">
            <div className="side-header">
              <Vote size={18} color="var(--accent-blue)" />
              <h3>Votação: Craque da Galera</h3>
            </div>
            <div className="poll-minimal">
              {activeMatch.status === 'ao_vivo' ? (
                matchMvpLoading ? (
                  <p className="loading-msg">Carregando votação...</p>
                ) : (
                  <>
                    <p className="poll-question">Quem está brilhando nesta partida?</p>
                    <div className="vote-options-grid">
                      {[...players.filter(p => p.team_id === activeMatch.team_a_id || p.team_id === activeMatch.team_b_id)].map(player => {
                        const totalVotes = matchVotes.reduce((acc, v) => acc + v.vote_count, 0) || 0;
                        const playerVotes = matchVotes.find(v => v.player_id === player.id)?.vote_count || 0;
                        const percentage = totalVotes > 0 ? Math.round((playerVotes / totalVotes) * 100) : 0;
                        
                        return (
                          <button 
                            key={player.id} 
                            className={`vote-player-btn ${matchUserVote === player.id ? 'voted' : ''}`}
                            onClick={() => !matchUserVote && castMatchVote(player.id)}
                            disabled={!!matchUserVote && matchUserVote !== player.id}
                          >
                            <div className="v-player-info">
                              <span className="v-name">{player.name}</span>
                              <span className="v-team">
                                {player.team_id === activeMatch.team_a_id 
                                  ? activeMatch.teams_a?.name.substring(0,3) 
                                  : activeMatch.teams_b?.name.substring(0,3)}
                              </span>
                            </div>
                            {matchUserVote && <span className="v-perc">{percentage}%</span>}
                          </button>
                        );
                      })}
                    </div>
                    {matchUserVote && <p className="voted-msg">Você já votou nesta partida! ✨</p>}
                  </>
                )
              ) : (
                <p className="empty-msg">
                  {activeMatch.status === 'finalizado' 
                    ? 'Votação encerrada. Confira o vencedor acima!' 
                    : 'Aguarde o início do jogo para votar!'}
                </p>
              )}
            </div>
          </div>

          <div className="round-mvp-widget glass">
            <div className="side-header">
              <Award size={18} color="var(--secondary)" />
              <h3>Ranking: Craque da Rodada</h3>
            </div>
            <div className="mvp-ranking-list">
              {roundMvpLoading ? (
                <div className="mini-spinner"></div>
              ) : roundVotes.length > 0 ? (
                roundVotes.slice(0, 3).map((mvp, idx) => (
                  <div key={mvp.player_id} className={`mvp-rank-item ${idx === 0 ? 'top-1' : ''}`}>
                    <div className="rank-number">#{idx + 1}</div>
                    <div className="rank-info">
                      <span className="rank-name">{mvp.player_name}</span>
                      <span className="rank-team">{mvp.team_name}</span>
                    </div>
                    <div className="rank-votes">
                      <span className="count">{mvp.vote_count}</span>
                      <span className="label">votos</span>
                    </div>
                    {!roundUserVote && user && (
                      <button className="btn-vote-mini" onClick={() => castRoundVote(mvp.player_id)}>votar</button>
                    )}
                  </div>
                ))
              ) : (
                <p className="empty-msg">Nenhum voto computado nesta rodada.</p>
              )}
            </div>
            {!user && <p className="login-to-vote-msg">Faça login para votar!</p>}
          </div>

          <div className="h2h-history glass">
            <div className="side-header">
              <History size={18} color="var(--accent-blue)" />
              <h3>Histórico do Confronto</h3>
            </div>
            <div className="h2h-list">
              {h2hMatches.length > 0 ? h2hMatches.map(m => (
                <div key={m.id} className="h2h-item">
                  <span className="h2h-date">{new Date(m.match_date).toLocaleDateString('pt-BR')}</span>
                  <div className="h2h-score-row">
                    <span>{m.teams_a?.name.substring(0,3)}</span>
                    <div className="h2h-result">{m.team_a_score} - {m.team_b_score}</div>
                    <span>{m.teams_b?.name.substring(0,3)}</span>
                  </div>
                </div>
              )) : <p className="empty-h2h">Primeiro encontro oficial.</p>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default MatchCenter;
