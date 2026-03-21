import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';
import { Trophy, Bell, ArrowRight, Zap, Shield, Vote, Timer, Calendar, X } from 'lucide-react';
import Skeleton from '../../components/Skeleton/Skeleton';
import { useNews, News } from '../../hooks/useNews';
import { useStandings } from '../../hooks/useStandings';
import { usePolls } from '../../hooks/usePolls';
import { useMatches } from '../../hooks/useMatches';
import { useMatchEvents } from '../../hooks/useMatchEvents';
import type { Match } from '../../hooks/useMatches';
import { useTournamentConfig } from '../../hooks/useTournamentConfig';
import { Star, Goal, Handshake } from 'lucide-react';
import { useRankings } from '../../hooks/useRankings';

import { motion, AnimatePresence } from 'framer-motion';

const Home: React.FC = () => {
  const { config } = useTournamentConfig();
  const { news, loading: newsLoading, error: newsError, refresh: refreshNews } = useNews(3);
  const { standings, loading: standingsLoading } = useStandings();
  const { matches } = useMatches();
  const navigate = useNavigate();
  const { activePoll, loading: pollLoading, error: pollError, hasVoted, submitVote, refresh: refreshPoll } = usePolls();
  const { scorers, assistants, galeraRank, loading: rankingsLoading } = useRankings();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [selectedNews, setSelectedNews] = useState<News | null>(null);
  
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  const nextMatch = useMemo<Match | null>(() => {
    const scheduled = matches
      .filter(m => m.status === 'agendado' && new Date(m.match_date).getTime() > new Date().getTime())
      .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());
    return scheduled.length > 0 ? scheduled[0] : null;
  }, [matches]);

  const liveMatch = useMemo<Match | null>(() => matches.find(m => m.status === 'ao_vivo') || null, [matches]);
  const { events: liveEvents } = useMatchEvents(liveMatch?.id || '');
  const latestLiveEvent = liveEvents?.[0];

  const topTeams = standings.slice(0, 3);
  const totalVotes = activePoll?.options.reduce((acc, opt) => acc + opt.votes, 0) || 0;

  useEffect(() => {
    if (!nextMatch) return;

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const target = new Date(nextMatch.match_date).getTime();
      const difference = target - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60)
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [nextMatch]);

  const formatNewsDate = (value?: string) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR');
  };

  const newsCards = (() => {
    if (newsLoading) {
      return [1, 2, 3].map(i => (
        <div key={i} className="news-card-v2 glass" style={{ padding: '1rem' }}>
          <Skeleton width="100%" height="150px" borderRadius="12px" />
          <Skeleton width="60%" height="20px" className="mt-2" />
          <Skeleton width="90%" height="40px" className="mt-2" />
        </div>
      ));
    }

    if (newsError && news.length === 0) {
      return (
        <div className="news-card-v2 glass" style={{ padding: '1rem' }}>
          <div className="empty-state glass" style={{ margin: 0 }}>
            <p>Erro ao carregar os comunicados. Verifique sua conexão e tente novamente.</p>
            <button className="btn-read-more" onClick={() => refreshNews()}>
              Tentar novamente <ArrowRight size={14} />
            </button>
          </div>
        </div>
      );
    }

    return news.map((item, index) => (
      <article
        key={item.id}
        className={`news-card-v2 glass-hover glass ${index === 0 ? 'featured-news' : ''}`}
        onClick={() => setSelectedNews(item)}
      >
        <div className="news-card-img">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt=""
              width="320"
              height="180"
              loading="lazy"
              decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <Zap size={index === 0 ? 64 : 32} color="var(--text-muted)" />
          )}
          {index === 0 && <span className="news-badge">Destaque</span>}
        </div>
        <div className="news-card-body">
          <div className="news-meta">
            <span className="news-tag">COBERTURA</span>
            <span className="news-date">{formatNewsDate(item.published_at)}</span>
          </div>
          <h3>{item.title}</h3>
          <p>{item.summary}</p>
          <button className="btn-read-more">
            Ler Notícia Completa <ArrowRight size={14} />
          </button>
        </div>
      </article>
    ));
  })();

  const breakingItems = useMemo(() => {
    if (!news || news.length === 0) return [] as string[];
    return news.map(item => item.title).filter(Boolean).slice(0, 6);
  }, [news]);

  return (
    <div className="home-page-v2 animate-fade-in">
      {/* Widget Ao Vivo Flutuante - Premium */}
      <AnimatePresence>
        {liveMatch && (
          <motion.div 
            className="live-floating-widget glass"
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 100, opacity: 0 }}
            onClick={() => navigate('/central-da-partida')}
          >
            <div className="live-badge-mini">
              <div className="pulse-dot"></div>
              AO VIVO
            </div>

            <div className="live-widget-teams">
              <span>{liveMatch.teams_a?.name.substring(0, 3)}</span>
              <span className="live-widget-score">{liveMatch.team_a_score} - {liveMatch.team_b_score}</span>
              <span>{liveMatch.teams_b?.name.substring(0, 3)}</span>
            </div>
            
            {latestLiveEvent && (
              <div className="live-ticker">
                <span className="ticker-time">{latestLiveEvent.minute}'</span>
                <span className="ticker-text">
                  {latestLiveEvent.event_type === 'gol' ? '⚽ GOL!' : 
                   latestLiveEvent.event_type === 'amarelo' ? '🟨 Card' :
                   latestLiveEvent.event_type === 'vermelho' ? '🟥 Card' : '📢'} {latestLiveEvent.players?.name || ''}
                </span>
              </div>
            )}
            
            <ArrowRight size={14} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Breaking News Ticker - Premium Phase 2 */}
      {breakingItems.length > 0 && (
        <div className="breaking-news-ticker glass">
          <div className="ticker-label">
            <Zap size={14} fill="currentColor" />
            <span>BREAKING</span>
          </div>
          <div className="ticker-content">
            <div className="ticker-track">
              {breakingItems.map((item, index) => (
                <span key={`${item}-${index}`}>• {item}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Acontecendo Agora - Seção de Jogo ao Vivo Prioritária */}
      <AnimatePresence>
        {liveMatch && (
          <motion.section 
            className="live-now-banner glass animate-pulse-border"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="live-now-content">
              <div className="live-now-header">
                <div className="live-indicator-v2">
                  <div className="pulse-dot"></div>
                  <span>EM ANDAMENTO</span>
                </div>
                <span className="live-now-location">{liveMatch.location}</span>
              </div>
              
              <div className="live-now-main-score" onClick={() => navigate('/central-da-partida')}>
                <div className="live-team-a">
                   <span className="team-name-abbr">{liveMatch.teams_a?.name}</span>
                   <div className="team-shield-mini">
                     {liveMatch.teams_a?.badge_url ? <img src={liveMatch.teams_a.badge_url} alt="" /> : <Shield size={24} />}
                   </div>
                </div>
                
                <div className="live-score-display">
                  <span className="live-score-val">{liveMatch.team_a_score}</span>
                  <span className="live-score-sep">:</span>
                  <span className="live-score-val">{liveMatch.team_b_score}</span>
                </div>

                <div className="live-team-b">
                   <div className="team-shield-mini">
                     {liveMatch.teams_b?.badge_url ? <img src={liveMatch.teams_b.badge_url} alt="" /> : <Shield size={24} />}
                   </div>
                   <span className="team-name-abbr">{liveMatch.teams_b?.name}</span>
                </div>
              </div>

              <button className="btn-go-live" onClick={() => navigate('/central-da-partida')}>
                ENTRAR NA CENTRAL <ArrowRight size={16} />
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Cinematic Hero */}
      <section className="hero-cinematic">
        <div className="hero-glows">
          <div className="glow-red"></div>
          <div className="glow-blue"></div>
          <div className="glow-green"></div>
          <div className="glow-amber"></div>
        </div>
        
        <motion.div 
          className="hero-content"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div className="hero-badge-v2">
            <div className="badge-pulse"></div>
            <span>Temporada 2026 • Copa Unasp</span>
          </div>
          
          <h1 className="hero-title-v2">
            O PALCO DA <br />
            <span className="text-gradient">GLÓRIA SUPREMA</span>
          </h1>
          
          <p className="hero-desc-v2">
            Viva a intensidade do futsal universitário. Resultados ao vivo, 
            estatísticas detalhadas e a cobertura completa do maior torneio do Unasp.
          </p>
          
          <div className="hero-cta-group">
            <button className="btn-premium" onClick={() => navigate('/central-da-partida')}>
              Explorar Partidas <ArrowRight size={20} />
            </button>
            <button className="btn-secondary-glass" onClick={() => navigate('/classificacao')}>
              Classificação
            </button>
          </div>
        </motion.div>
      </section>

      {/* Destaques do Campeonato */}
      {!rankingsLoading && (scorers.length > 0 || assistants.length > 0 || galeraRank.length > 0) && (
        <motion.section 
          className="stats-highlights-section"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="section-head-v2">
            <Zap size={24} color="var(--secondary)" />
            <h2>Destaques do Torneio</h2>
            <button className="btn-view-all" onClick={() => navigate('/rankings')}>
              Ver Rankings <ArrowRight size={14} />
            </button>
          </div>
          
          <div className="highlights-grid">
            {scorers[0] && (
              <div className="highlight-card glass" onClick={() => navigate('/rankings')}>
                <div className="highlight-icon art-scorer"><Goal size={20} /></div>
                <div className="highlight-info">
                  <span className="highlight-label">Artilheiro</span>
                  <div className="highlight-player">
                    <strong>{scorers[0].name}</strong>
                    <span>{scorers[0].team_name}</span>
                  </div>
                </div>
                <div className="highlight-value">{scorers[0].goals_count} <small>gols</small></div>
              </div>
            )}
            
            {assistants[0] && (
              <div className="highlight-card glass" onClick={() => navigate('/rankings')}>
                <div className="highlight-icon art-assist"><Handshake size={20} /></div>
                <div className="highlight-info">
                  <span className="highlight-label">Garçom</span>
                  <div className="highlight-player">
                    <strong>{assistants[0].name}</strong>
                    <span>{assistants[0].team_name}</span>
                  </div>
                </div>
                <div className="highlight-value">{assistants[0].assists} <small>assist.</small></div>
              </div>
            )}

            {galeraRank[0] && (
              <div className="highlight-card glass" onClick={() => navigate('/rankings')}>
                <div className="highlight-icon art-mvp"><Star size={20} /></div>
                <div className="highlight-info">
                  <span className="highlight-label">Craque da Galera</span>
                  <div className="highlight-player">
                    <strong>{galeraRank[0].name}</strong>
                    <span>{galeraRank[0].team_name}</span>
                  </div>
                </div>
                <div className="highlight-value">{galeraRank[0].mvp_votes} <small>votos</small></div>
              </div>
            )}
          </div>
        </motion.section>
      )}

      {/* Match Countdown Banner */}
      {nextMatch && (
        <motion.section 
          className="match-countdown-banner glass"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="countdown-content">
            <div className="next-match-info">
              <div className="countdown-label">
                <Timer size={16} className="animate-pulse" />
                PRÓXIMO GRANDE JOGO
              </div>
              <div className="next-match-teams">
                <div className="mini-team">
                   {nextMatch.teams_a?.badge_url ? (
                     <img 
                       src={nextMatch.teams_a.badge_url} 
                       alt={nextMatch.teams_a.name} 
                       width="24" 
                       height="24" 
                       loading="lazy"
                       style={{ objectFit: 'contain' }} 
                     />
                   ) : (
                     <Shield size={24} color="var(--secondary)" />
                   )}
                   <span>{nextMatch.teams_a?.name}</span>
                </div>
                <span className="vs-text">VS</span>
                <div className="mini-team">
                   {nextMatch.teams_b?.badge_url ? (
                     <img 
                       src={nextMatch.teams_b.badge_url} 
                       alt={nextMatch.teams_b.name} 
                       width="24" 
                       height="24" 
                       loading="lazy"
                       style={{ objectFit: 'contain' }} 
                     />
                   ) : (
                     <Shield size={24} color="var(--primary)" />
                   )}
                   <span>{nextMatch.teams_b?.name}</span>
                </div>
              </div>
              <div className="match-detail-row">
                <Calendar size={14} />
                <span>{new Date(nextMatch.match_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="dot">•</span>
                <span>{nextMatch.location}</span>
              </div>
            </div>

            <div className="countdown-timer-grid">
              <div className="time-unit">
                <span className="time-val">{timeLeft.days.toString().padStart(2, '0')}</span>
                <span className="time-lab">DIAS</span>
              </div>
              <div className="time-sep">:</div>
              <div className="time-unit">
                <span className="time-val">{timeLeft.hours.toString().padStart(2, '0')}</span>
                <span className="time-lab">HRS</span>
              </div>
              <div className="time-sep">:</div>
              <div className="time-unit">
                <span className="time-val">{timeLeft.minutes.toString().padStart(2, '0')}</span>
                <span className="time-lab">MIN</span>
              </div>
              <div className="time-sep">:</div>
              <div className="time-unit">
                <span className="time-val">{timeLeft.seconds.toString().padStart(2, '0')}</span>
                <span className="time-lab">SEG</span>
              </div>
            </div>
            
            <button className="btn-remind" onClick={() => navigate('/central-da-partida')}>
              Ver Detalhes
            </button>
          </div>
        </motion.section>
      )}

      <main className="home-content-v2">
        {/* Podium Preview - Só mostrar se for Final */}
        {config.current_phase === 'final' && (
          <motion.section 
            className="podium-section"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
          <div className="section-head-v2">
             <Trophy size={24} color="var(--secondary)" />
             <h2>Líderes do Campeonato</h2>
          </div>
          
          <div className="podium-grid">
            {standingsLoading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="podium-card glass">
                  <Skeleton width="100%" height="200px" borderRadius="20px" />
                </div>
              ))
            ) : topTeams.map((team, i) => (
              <div key={team.team_id} className={`podium-card glass ${i === 0 ? 'gold' : ''}`} onClick={() => navigate('/classificacao')}>
                <div className="podium-rank">#{i + 1}</div>
                <div className="podium-badge-box">
                   {team.badge_url ? (
                     <img 
                       src={team.badge_url} 
                       alt={team.team_name} 
                       width="48" 
                       height="48" 
                       loading="lazy"
                       style={{ objectFit: 'contain', zIndex: 1 }} 
                     />
                   ) : (
                     <Shield size={48} color={i === 0 ? 'var(--secondary)' : 'var(--text-dim)'} style={{ zIndex: 1 }} />
                   )}
                   <div className="podium-badge-glow"></div>
                </div>
                <div className="podium-info">
                  <h3>{team.team_name}</h3>
                  <div className="podium-stats">
                     <span>{team.points} Pts</span>
                     <span className="dot">•</span>
                     <span>{team.wins}V</span>
                  </div>
                </div>
              </div>
            ))}
            </div>
          </motion.section>
        )}

        <div className="home-dual-layout">
          {/* News Stream */}
           <motion.section 
             className="news-stream"
             initial={{ opacity: 0, x: -30 }}
             whileInView={{ opacity: 1, x: 0 }}
             viewport={{ once: true }}
             transition={{ duration: 0.6 }}
           >
            <div className="section-head-v2">
               <Bell size={24} color="var(--primary)" />
               <h2>Últimos Comunicados</h2>
               <button className="btn-view-all" onClick={() => navigate('/')}>
                 Ver tudo <ArrowRight size={16} />
               </button>
            </div>
            
            <div className="news-stack-v2">
              {newsCards}
             </div>
          </motion.section>

          {/* News Modal */}
          <AnimatePresence>
            {selectedNews && (
              <motion.div 
                className="news-modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedNews(null)}
              >
                <motion.div 
                  className="news-modal-content glass"
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  onClick={e => e.stopPropagation()}
                >
                  <button className="news-modal-close" onClick={() => setSelectedNews(null)}><X size={24} /></button>
                  <div className="news-modal-hero">
                    {selectedNews.image_url ? (
                      <img src={selectedNews.image_url} alt={selectedNews.title} className="news-modal-img" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <div className="news-modal-img-placeholder"><Zap size={64} /></div>
                    )}
                    <span className="news-badge">Oficial</span>
                  </div>
                  <div className="news-modal-body">
                    <div className="news-meta">
                      <span className="news-tag">COBERTURA</span>
                      <span className="news-date">{formatNewsDate(selectedNews.published_at)}</span>
                    </div>
                    <h2>{selectedNews.title}</h2>
                    <div className="news-modal-text">
                      {selectedNews.content.split('\n').map((para, i) => (
                        <p key={i}>{para}</p>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Engagement Hub */}
          <motion.aside 
            className="engagement-hub"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="widget-premium glass">
              <div className="widget-header">
                <Vote size={22} color="var(--accent-blue)" />
                <h3>Quem será o Campeão?</h3>
              </div>
              <p className="widget-desc">Votação aberta para a torcida decidir o favorito.</p>
              
              <div className="poll-container-v2">
                {pollLoading ? (
                  <p>Carregando enquete...</p>
                ) : pollError ? (
                  <div className="error-state glass" style={{ padding: '12px', marginTop: '8px' }}>
                    <p style={{ marginBottom: '0.5rem' }}>Erro ao carregar enquete: {pollError}</p>
                    <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refreshPoll()}>
                      Tentar novamente
                    </button>
                  </div>
                ) : activePoll ? (
                  <>
                    <h4 style={{marginBottom: '1rem'}}>{activePoll.question}</h4>
                    {activePoll.options.map(opt => {
                      const percentage = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                      return (
                        <div 
                          key={opt.id} 
                          className={`poll-option-v2 ${selectedOption === opt.id ? 'selected' : ''}`}
                          onClick={() => !hasVoted && setSelectedOption(opt.id)}
                          style={{ cursor: hasVoted ? 'default' : 'pointer', opacity: (hasVoted || selectedOption === opt.id) ? 1 : 0.8 }}
                        >
                           <div className="poll-label">
                             <span>{opt.text}</span>
                             <span>{hasVoted ? `${percentage}%` : ''}</span>
                           </div>
                           <div className="poll-bar-bg">
                             <div className="poll-bar-fill" style={{ width: hasVoted ? `${percentage}%` : (selectedOption === opt.id ? '100%' : '0%') }}></div>
                           </div>
                        </div>
                      );
                    })}
                    {!hasVoted && (
                      <button 
                        className="btn-vote-now" 
                        disabled={!selectedOption} 
                        onClick={() => selectedOption && submitVote(selectedOption)}
                        style={{ opacity: selectedOption ? 1 : 0.5, marginTop: '1rem' }}
                      >
                         Registrar Meu Voto
                      </button>
                    )}
                    {hasVoted && (
                      <p style={{textAlign: 'center', marginTop: '10px', fontSize: '0.9rem', color: 'var(--text-muted)'}}>
                        Voto registrado! Total de votos: {totalVotes}
                      </p>
                    )}
                  </>
                ) : (
                  <p>Sem enquetes ativas no momento.</p>
                )}
              </div>
            </div>
          </motion.aside>
        </div>
      </main>
    </div>
  );
};

export default Home;
