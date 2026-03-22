import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMatches } from '../../hooks/useMatches';
import { useMatchEvents, type MatchEvent } from '../../hooks/useMatchEvents';
import { usePlayers } from '../../hooks/usePlayers';
import { useMvpVoting } from '../../hooks/useMvpVoting';
import Skeleton from '../../components/Skeleton/Skeleton';
import { useTournamentConfig } from '../../hooks/useTournamentConfig';
import { useAuthContext } from '../../contexts/AuthContext';
import { useStandings } from '../../hooks/useStandings';
import { supabase } from '../../lib/supabase';
import { Shield, Timer, Award, Zap, History, Download, Trophy, ArrowRightLeft, TrendingUp, HelpCircle, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import ShareCard, { useShareCard } from '../../components/ShareCard/ShareCard';
import { useMatchWinnerVoting } from '../../hooks/useMatchWinnerVoting';
import './MatchCenter.css';

const MatchCenter: React.FC = () => {
  const { matches, loading: matchesLoading, error: matchesError } = useMatches();
  const [searchParams] = useSearchParams();
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [showGoalOverlay, setShowGoalOverlay] = useState<{ team: string, player: string } | null>(null);

  useEffect(() => {
    const matchIdFromUrl = searchParams.get('id');
    if (matchIdFromUrl && !selectedMatchId) {
      setSelectedMatchId(matchIdFromUrl);
    }
  }, [searchParams, selectedMatchId]);
  
  const activeMatch = selectedMatchId 
    ? matches.find(m => m.id === selectedMatchId) 
    : matches.find(m => m.status === 'ao_vivo') || matches[0];

  const activeMatchRoundText = activeMatch ? String(activeMatch.round ?? '').toLowerCase() : '';

  const [elapsedTime, setElapsedTime] = useState('00:00');

  const { players } = usePlayers();
  const { standings } = useStandings();

  const handleNewEvent = (event: MatchEvent) => {
    // Only show toasts if the event is from the active match
    if (event.match_id !== activeMatch?.id) return;

    if (event.event_type === 'gol') {
      const playerName = event.players?.name || 'Desconhecido';
      const teamName = event.player_id && players.find(p => p.id === event.player_id)?.team_id === activeMatch?.team_a_id 
        ? activeMatch?.teams_a?.name 
        : activeMatch?.teams_b?.name;
        
      toast.success(`⚽ GOOOOL! ${playerName}`);
      
      // Trigger Premium Overlay
      setShowGoalOverlay({ team: teamName || 'GOL!', player: playerName });
      setTimeout(() => setShowGoalOverlay(null), 5000);

    } else if (event.event_type === 'amarelo') {
      toast(`🟨 Cartão Amarelo para ${event.players?.name || ''}`, { icon: '🟨' });
    } else if (event.event_type === 'vermelho') {
      toast.error(`🟥 Cartão Vermelho para ${event.players?.name || ''}`);
    } else if (event.event_type === 'substituicao') {
      const playerIn = event.assistant_id
        ? players.find(p => p.id === event.assistant_id)?.name
        : undefined;
      toast(`🔄 Substituição: Sai ${event.players?.name || ''}, Entra ${playerIn || 'jogador'}`, { icon: '🔄' });
    } else if (event.event_type === 'momento') {
      const text = event.commentary || 'Momento importante!';
      toast(`🔥 ${text}`, { icon: '🔥' });
    }
  };

  const { events, loading: eventsLoading, error: eventsError, refresh: refreshEvents } = useMatchEvents(activeMatch?.id || '', handleNewEvent);
  const { user } = useAuthContext();
  const { config } = useTournamentConfig();
  const { voteCounts: roundVotes, userVote: roundUserVote, vote: castRoundVote, loading: roundMvpLoading, error: roundMvpError, refresh: refreshRoundMvp } = useMvpVoting(String(config.current_round));
  
  const { votes: winnerVotes, userVote: winnerUserVote, vote: castWinnerVote, error: winnerVotesError } = useMatchWinnerVoting(activeMatch?.id || '');

  const getPollQuestion = () => {
    if (!activeMatch) return 'Quem vence?';
    const roundStr = String(activeMatch.round).toLowerCase();
    if (roundStr.includes('final')) return 'Quem levará a taça? 🏆';
    if (roundStr.includes('semi') || roundStr.includes('quarta') || roundStr.includes('oitava')) return 'Quem passará de fase? 🚀';
    return 'Quem vence este duelo? ⚽';
  };
  
  const { cardRef, downloadCard } = useShareCard();
  const [isExporting, setIsExporting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSendingComment, setIsSendingComment] = useState(false);

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim() || !activeMatch) return;

    setIsSendingComment(true);
    try {
      const { error } = await supabase.from('match_events').insert({
        match_id: activeMatch.id,
        event_type: 'comentario',
        commentary: newComment.trim(),
        minute: elapsedTime === 'Fim' || elapsedTime === 'Pré-jogo' ? 0 : parseInt(elapsedTime.split(':')[0]) || 0,
        player_id: null
      });

      if (error) throw error;
      setNewComment('');
      toast.success('Comentário enviado!');
    } catch (err: unknown) {
      const message =
        typeof (err as { message?: unknown })?.message === 'string'
          ? String((err as { message: string }).message)
          : null;
      toast.error(message ? `Erro ao enviar comentário: ${message}` : 'Erro ao enviar comentário');
    } finally {
      setIsSendingComment(false);
    }
  };

  // Lógica do Cronômetro em Tempo Real (Sincronizado)
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const updateTimer = () => {
      if (!activeMatch) return;

      if (activeMatch.status === 'ao_vivo') {
        if (activeMatch.is_timer_running && activeMatch.timer_started_at) {
          const start = new Date(activeMatch.timer_started_at).getTime();
          const now = Date.now();
          const diff = Math.floor((now - start) / 1000);
          const totalSeconds = activeMatch.timer_offset_seconds + diff;
          
          const mins = Math.floor(totalSeconds / 60);
          const secs = totalSeconds % 60;
          setElapsedTime(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
        } else {
          const totalSeconds = activeMatch.timer_offset_seconds || 0;
          const mins = Math.floor(totalSeconds / 60);
          const secs = totalSeconds % 60;
          setElapsedTime(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
        }
      } else {
        setElapsedTime(activeMatch.status === 'finalizado' ? 'Fim' : 'Pré-jogo');
      }
    };

    updateTimer(); // Atualização imediata
    
    if (activeMatch?.status === 'ao_vivo' && activeMatch.is_timer_running) {
      interval = setInterval(updateTimer, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
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

  const handleCopySummary = async () => {
    if (!activeMatch) return;
    try {
      const teamA = activeMatch.teams_a?.name || 'Equipe A';
      const teamB = activeMatch.teams_b?.name || 'Equipe B';
      const scoreA = activeMatch.team_a_score ?? 0;
      const scoreB = activeMatch.team_b_score ?? 0;
      const roundText = activeMatch.round ? ` • Rodada ${activeMatch.round}` : '';
      const dateText = activeMatch.match_date ? ` • ${new Date(activeMatch.match_date).toLocaleDateString('pt-BR')}` : '';
      const text = `${teamA} ${scoreA}x${scoreB} ${teamB}${roundText}${dateText}`;

      await navigator.clipboard.writeText(text);
      toast.success('Resumo copiado!');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

    if (matchesLoading && matches.length === 0) return (
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

  if (matchesError && matches.length === 0) {
    return (
      <div className="match-center animate-fade-in" style={{ padding: '2rem' }}>
        <div className="empty-state glass">
          Erro ao carregar as partidas. Verifique sua conexão e tente novamente.
        </div>
      </div>
    );
  }
  
  if (!activeMatch) return <div className="empty-state glass">Nenhuma partida programada.</div>;

  return (
    <div className="match-center animate-fade-in">
      {/* Premium Goal Overlay */}
      <AnimatePresence>
        {showGoalOverlay && (
          <motion.div 
            className="goal-overlay-premium"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ type: "spring", damping: 12 }}
          >
            <motion.div 
              className="goal-announcement"
              animate={{ y: [0, -20, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <div className="goal-icon-container">
                <span className="goal-ball-emoji">⚽</span>
              </div>
              <h1 className="goal-text">GOOOOOOOL!</h1>
              <div className="goal-details">
                <span className="goal-team">{showGoalOverlay.team}</span>
                <span className="goal-player">{showGoalOverlay.player}</span>
              </div>
            </motion.div>
            <div className="confetti-container">
              {[...Array(20)].map((_, i) => (
                <motion.div 
                  key={i}
                  className="confetti-piece"
                  initial={{ y: -100, x: Math.random() * 400 - 200, opacity: 1 }}
                  animate={{ y: 800, rotate: 360 }}
                  transition={{ duration: Math.random() * 2 + 1, repeat: Infinity }}
                  style={{ 
                    backgroundColor: i % 2 === 0 ? 'var(--secondary)' : 'var(--primary)',
                    left: `${Math.random() * 100}%`
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seletor de Partidas */}
      <div className="match-selector-bar glass">
        <div className="selector-header-row">
          <div className="selector-title">
            <Zap size={16} color="var(--secondary)" />
            <span className="desktop-only">Rodada Atual</span>
            <span className="mobile-only">Partidas</span>
          </div>
          <div className="live-status-badge">
            <div className="pulse-dot"></div>
            <span>Auto-Sync</span>
          </div>
        </div>

        {/* Mobile Dropdown Selector */}
        <div className="mobile-selector-container mobile-only">
          <select 
            className="match-select-mobile"
            value={activeMatch.id}
            onChange={(e) => setSelectedMatchId(e.target.value)}
          >
            {matches.map(m => (
              <option key={m.id} value={m.id}>
                {m.status === 'ao_vivo' ? '🔴 ' : ''}
                {m.teams_a?.name.substring(0,10)} x {m.teams_b?.name.substring(0,10)}
              </option>
            ))}
          </select>
        </div>

        {/* Desktop Pills Selector */}
        <div className="selector-list desktop-only">
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
                    <img 
                      src={activeMatch.teams_a.badge_url} 
                      alt="" 
                      width="48" 
                      height="48" 
                      loading="lazy"
                      style={{ objectFit: 'contain', padding: '4px' }} 
                    />
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
                    <img 
                      src={activeMatch.teams_b.badge_url} 
                      alt="" 
                      width="48" 
                      height="48" 
                      loading="lazy"
                      style={{ objectFit: 'contain', padding: '4px' }} 
                    />
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

            {/* Craque do Jogo (Opcional) */}
            {activeMatch.match_mvp_player_id && (
              <div className="match-mvp-badge glass animate-slide-up">
                <Award size={20} className="glow-icon" />
                <div className="mvp-details">
                  <span className="mvp-label">CRAQUE DO JOGO</span>
                  <span className="mvp-name">
                    {players.find(p => p.id === activeMatch.match_mvp_player_id)?.name}
                  </span>
                  {activeMatch.match_mvp_description && (
                    <p className="mvp-desc">"{activeMatch.match_mvp_description}"</p>
                  )}
                </div>
              </div>
            )}

            <div className="scoreboard-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button 
                className="btn-share-result" 
                onClick={handleDownloadCard}
                disabled={isExporting}
              >
                {isExporting ? <div className="spinner-mini"></div> : <Download size={18} />}
                Baixar Card de Resultado
              </button>

              <button className="btn-share-result" onClick={handleCopySummary}>
                <Copy size={18} />
                Copiar Resumo
              </button>
            </div>
          </section>

          {/* Enquete Dinâmica: Quem Vence? */}
          <div className="match-winner-poll glass animate-slide-up">
            <div className="poll-header-v2">
              <HelpCircle size={20} color="var(--secondary)" />
              <div className="poll-titles">
                <h3>{getPollQuestion()}</h3>
                <span className="poll-subtitle">{winnerVotes.total} votos registrados</span>
              </div>
            </div>
            
            <div className="winner-options-v2">
              {winnerVotesError ? (
                <div className="empty-state glass" style={{ padding: '12px' }}>
                  Erro ao carregar enquete: {winnerVotesError}
                </div>
              ) : (
                <>
                  <button 
                    className={`w-opt-v2 ${winnerUserVote === 'team_a' ? 'selected' : ''}`}
                    onClick={() => {
                      if (navigator.vibrate) navigator.vibrate(50);
                      castWinnerVote('team_a');
                    }}
                    disabled={!!winnerUserVote}
                  >
                    <div className="w-label-group">
                      <span className="w-name">{activeMatch.teams_a?.name}</span>
                      {winnerUserVote && (
                        <span className="w-perc">
                          {winnerVotes.total > 0 ? Math.round((winnerVotes.team_a / winnerVotes.total) * 100) : 0}%
                        </span>
                      )}
                    </div>
                    {winnerUserVote && (
                      <div className="w-bar-container">
                        <motion.div 
                          className="w-bar" 
                          initial={{ width: 0 }}
                          animate={{ width: `${winnerVotes.total > 0 ? (winnerVotes.team_a / winnerVotes.total) * 100 : 0}%` }}
                        />
                      </div>
                    )}
                  </button>

                  {/* Só mostra Empate se NÃO for Final/Mata-Mata (opcional, ajustável ao torneio) */}
                  {!activeMatchRoundText.includes('final') && 
                   !activeMatchRoundText.includes('semi') && 
                   !activeMatchRoundText.includes('quarta') && (
                    <button 
                      className={`w-opt-v2 draw ${winnerUserVote === 'draw' ? 'selected' : ''}`}
                      onClick={() => {
                        if (navigator.vibrate) navigator.vibrate(50);
                        castWinnerVote('draw');
                      }}
                      disabled={!!winnerUserVote}
                    >
                      <div className="w-label-group">
                        <span className="w-name">Empate</span>
                        {winnerUserVote && (
                          <span className="w-perc">
                            {winnerVotes.total > 0 ? Math.round((winnerVotes.draw / winnerVotes.total) * 100) : 0}%
                          </span>
                        )}
                      </div>
                      {winnerUserVote && (
                        <div className="w-bar-container">
                          <motion.div 
                            className="w-bar" 
                            initial={{ width: 0 }}
                            animate={{ width: `${winnerVotes.total > 0 ? (winnerVotes.draw / winnerVotes.total) * 100 : 0}%` }}
                          />
                        </div>
                      )}
                    </button>
                  )}

                  <button 
                    className={`w-opt-v2 ${winnerUserVote === 'team_b' ? 'selected' : ''}`}
                    onClick={() => {
                      if (navigator.vibrate) navigator.vibrate(50);
                      castWinnerVote('team_b');
                    }}
                    disabled={!!winnerUserVote}
                  >
                    <div className="w-label-group">
                      <span className="w-name">{activeMatch.teams_b?.name}</span>
                      {winnerUserVote && (
                        <span className="w-perc">
                          {winnerVotes.total > 0 ? Math.round((winnerVotes.team_b / winnerVotes.total) * 100) : 0}%
                        </span>
                      )}
                    </div>
                    {winnerUserVote && (
                      <div className="w-bar-container">
                        <motion.div 
                          className="w-bar" 
                          initial={{ width: 0 }}
                          animate={{ width: `${winnerVotes.total > 0 ? (winnerVotes.team_b / winnerVotes.total) * 100 : 0}%` }}
                        />
                      </div>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ShareCard Template */}
          <ShareCard 
            match={activeMatch} 
            mvpPlayer={players.find(p => p.id === activeMatch.match_mvp_player_id)} 
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
              ) : eventsError ? (
                <div className="empty-state glass" style={{ padding: '12px' }}>
                  <p style={{ marginBottom: '0.75rem' }}>Erro ao carregar lances: {eventsError}</p>
                  <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refreshEvents()}>
                    Tentar novamente
                  </button>
                </div>
              ) : events.length > 0 ? (
                events.map((event) => (
                  <div key={event.id} className="t-event animate-fade-in">
                    <div className="t-time">{event.minute}'</div>
                    <div className="t-icon-box">
                      {event.event_type === 'gol' && <Trophy size={14} color="var(--secondary)" />}
                      {event.event_type === 'amarelo' && <div className="card-yellow"></div>}
                      {event.event_type === 'vermelho' && <div className="card-red"></div>}
                      {event.event_type === 'substituicao' && <ArrowRightLeft size={14} color="#fff" />}
                      {(event.event_type === 'comentario' || event.event_type === 'momento') && <Zap size={14} color="var(--accent-blue)" />}
                    </div>
                    <div className="t-content glass">
                      <div className="t-header">
                        <span className="t-type">
                          {event.event_type === 'gol' ? 'GOL!' : 
                           event.event_type === 'amarelo' ? 'Cartão Amarelo' :
                           event.event_type === 'vermelho' ? 'Cartão Vermelho' :
                           event.event_type === 'substituicao' ? 'Substituição' :
                           event.event_type === 'momento' ? 'Momento' : 'Informação'}
                        </span>
                      </div>
                      <p>
                        <strong>{event.players?.name}</strong>
                        {event.event_type === 'gol' && event.assistant_id && (
                          <span className="assistant">
                             Assistência: {players.find(p => p.id === event.assistant_id)?.name}
                          </span>
                        )}
                        {event.event_type === 'substituicao' && (
                          <span className="assistant" style={{ color: '#94a3b8' }}>
                            <ArrowRightLeft size={12} style={{ display: 'inline', marginRight: 4 }} />
                            Entra: {players.find(p => p.id === event.assistant_id)?.name}
                          </span>
                        )}
                        {(event.event_type === 'comentario' || event.event_type === 'momento') && event.commentary}
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
                {events.filter(e => e.event_type === 'comentario' || e.event_type === 'momento').map(ev => (
                  <div key={ev.id} className="comment-bubble animate-slide-up">
                    <span className="comment-time">{ev.minute}'</span>
                    <p className="commentary-text">{ev.commentary}</p>
                  </div>
                ))}
                {events.filter(e => e.event_type === 'comentario' || e.event_type === 'momento').length === 0 && (
                  <p className="empty-feed">Aguardando lances da partida...</p>
                )}
              </div>
              
              <div className="comment-input-area">
                {user ? (
                  <form className="comment-form" onSubmit={handleSendComment}>
                    <input 
                      type="text" 
                      placeholder="Escreva um comentário..." 
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      disabled={isSendingComment}
                    />
                    <button type="submit" disabled={isSendingComment || !newComment.trim()}>
                      {isSendingComment ? <div className="spinner-mini"></div> : <Zap size={16} />}
                    </button>
                  </form>
                ) : (
                  <div className="login-to-comment">
                    <p>Faça login para participar dos comentários ao vivo!</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="match-side">
          {/* Impacto na Tabela (Real-time Standings) */}
          {activeMatch?.status === 'ao_vivo' && (
            <div className="standings-impact-widget glass">
              <div className="side-header">
                <TrendingUp size={18} color="var(--secondary)" />
                <h3>Impacto na Tabela</h3>
              </div>
              <div className="impact-container">
                {[activeMatch.team_a_id, activeMatch.team_b_id].map(teamId => {
                  const teamStanding = standings.find(s => s.team_id === teamId);
                  if (!teamStanding) return null;
                  
                  // Calcular pontos virtuais
                  let virtualPoints = teamStanding.points;
                  const isTeamA = teamId === activeMatch.team_a_id;
                  const teamScore = isTeamA ? activeMatch.team_a_score : activeMatch.team_b_score;
                  const oppScore = isTeamA ? activeMatch.team_b_score : activeMatch.team_a_score;
                  
                  if (teamScore > oppScore) virtualPoints += 3;
                  else if (teamScore === oppScore) virtualPoints += 1;

                  return (
                    <div key={teamId} className="impact-row">
                      <span className="impact-team-name">{teamStanding.team_name}</span>
                      <div className="impact-points">
                        <span className="current-pts">{teamStanding.points}</span>
                        <ArrowRightLeft size={12} />
                        <span className="virtual-pts">{virtualPoints} pts</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="impact-note">* Pontuação baseada no placar atual.</p>
            </div>
          )}

          <div className="round-mvp-widget glass">
            <div className="side-header">
              <Award size={18} color="var(--secondary)" />
              <h3>Ranking: Craque da Rodada</h3>
            </div>
            <div className="mvp-ranking-list">
              {roundMvpLoading ? (
                <div className="mini-spinner"></div>
              ) : roundMvpError ? (
                <div className="empty-state glass" style={{ padding: '12px' }}>
                  <p style={{ marginBottom: '0.75rem' }}>Erro ao carregar ranking da rodada: {roundMvpError}</p>
                  <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refreshRoundMvp()}>
                    Tentar novamente
                  </button>
                </div>
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
