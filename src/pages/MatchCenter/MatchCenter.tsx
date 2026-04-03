import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMatches } from '../../hooks/useMatches';
import { useMatchEvents, type MatchEvent } from '../../hooks/useMatchEvents';
import { usePlayers } from '../../hooks/usePlayers';
import { useMvpVoting } from '../../hooks/useMvpVoting';
import Skeleton from '../../components/Skeleton/Skeleton';
import { useTournamentConfig } from '../../hooks/useTournamentConfig';
import { useAuthContext } from '../../contexts/AuthContext';
import AuthModal from '../../components/Auth/AuthModal';
import { useStandings } from '../../hooks/useStandings';
import { supabase } from '../../lib/supabase';
import { Shield, Timer, Award, Zap, History, Download, Trophy, ArrowRightLeft, TrendingUp, HelpCircle, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import ShareCard, { useShareCard } from '../../components/ShareCard/ShareCard';
import { useMatchWinnerVoting } from '../../hooks/useMatchWinnerVoting';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { emitGoalOverlay } from '../../lib/goalOverlay';
import './MatchCenter.css';

const MatchCenter: React.FC = () => {
  const { matches, loading: matchesLoading, error: matchesError, refresh: refreshMatches } = useMatches();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  // Sincroniza o estado interno com a URL quando a URL muda
  useEffect(() => {
    const matchIdFromUrl = searchParams.get('id');
    if (matchIdFromUrl && matchIdFromUrl !== selectedMatchId) {
      setSelectedMatchId(matchIdFromUrl);
    } else if (!matchIdFromUrl && selectedMatchId !== null) {
      // Se não houver ID na URL, mas houver no estado, decidimos se resetamos ou mantemos (mantemos para evitar o bug de reset)
      // O reset só ocorreria se o usuário navegasse explicitamente para a URL sem ID.
    }
  }, [searchParams, selectedMatchId]);

  const handleSelectMatch = (id: string) => {
    setSelectedMatchId(id);
    setSearchParams({ id });
  };
  
  const activeMatch = selectedMatchId 
    ? matches.find(m => m.id === selectedMatchId) 
    : matches.find(m => m.status === 'ao_vivo') || matches[0];

  const activeMatchRoundText = activeMatch ? String(activeMatch.round ?? '').toLowerCase() : '';
  const liveMatchId = matches.find(m => m.status === 'ao_vivo')?.id;
  const liveCount = matches.filter(m => m.status === 'ao_vivo').length;
  const upcomingCount = matches.filter(m => m.status === 'agendado').length;
  const finishedCount = matches.filter(m => m.status === 'finalizado').length;

  const getTeamLabel = (name: string | null | undefined, fallback: string) => {
    const trimmed = (name || '').trim();
    return trimmed ? trimmed : fallback;
  };

  const getTeamShortName = (name: string | null | undefined, fallback: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return fallback;
    return trimmed.replace(/\s+/g, '').slice(0, 3).toUpperCase();
  };

  const [elapsedTime, setElapsedTime] = useState('00:00');

  const { players } = usePlayers();
  const { standings } = useStandings();

  const handleNewEvent = (event: MatchEvent) => {
    // Só processa notificações de eventos da partida ativa
    if (event.match_id !== activeMatch?.id) return;

    // Trava de segurança: ignorar eventos com mais de 60 segundos (útil para reconexões)
    if (event.created_at) {
      const eventTime = new Date(event.created_at).getTime();
      if ((Date.now() - eventTime) / 1000 > 60) return;
    }

    if (event.event_type === 'gol') {
      const playerName = event.players?.name || 'Desconhecido';
      const playerPhotoUrl = event.player_id
        ? players.find(p => p.id === event.player_id)?.photo_url
        : undefined;
      const teamName = event.player_id && players.find(p => p.id === event.player_id)?.team_id === activeMatch?.team_a_id 
        ? activeMatch?.teams_a?.name 
        : activeMatch?.teams_b?.name;
        
      toast.success(`⚽ GOOOOL! ${playerName}`);
      
      // Trigger Global Premium Overlay
      emitGoalOverlay({ team: teamName || 'GOL!', player: playerName, playerPhotoUrl });

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

  const matchPeriod = useMemo(() => {
    if (!activeMatch || activeMatch.status !== 'ao_vivo') return null;
    const hasEndedFirstHalf = events.some(e => e.event_type === 'comentario' && e.commentary?.includes('Fim do 1º Tempo'));
    const hasStartedSecondHalf = events.some(e => e.event_type === 'comentario' && e.commentary?.includes('Início do 2º Tempo'));
    
    if (hasStartedSecondHalf) return '2º Tempo';
    if (hasEndedFirstHalf) return 'Intervalo';
    return '1º Tempo';
  }, [activeMatch, events]);
  const { user, role: authRole } = useAuthContext();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { config } = useTournamentConfig();
  const { voteCounts: roundVotes, userVote: roundUserVote, vote: castRoundVote, loading: roundMvpLoading, error: roundMvpError, refresh: refreshRoundMvp } = useMvpVoting(String(config.current_round));
  
  const { votes: winnerVotes, userVote: winnerUserVote, vote: castWinnerVote, error: winnerVotesError } = useMatchWinnerVoting(activeMatch?.id || '');
  const { cardRef, downloadCard } = useShareCard();
  const [isExporting, setIsExporting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSendingComment, setIsSendingComment] = useState(false);

  const getPollQuestion = useCallback(() => {
    if (!activeMatch) return 'Quem vence?';
    if (activeMatch.status === 'finalizado') return 'Quem foi o vencedor?';
    if (activeMatch.status === 'ao_vivo') return 'Quem vence a partida?';
    return 'Quem vence a partida?';
  }, [activeMatch]);

  const canDeleteComment = useCallback((ev: MatchEvent) => {
    if (!user) return false;
    if (authRole === 'admin') return true;
    return Boolean(ev.user_id && ev.user_id === user.id);
  }, [authRole, user]);

  const handleSendComment = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeMatch) return;

    if (!user) {
      setShowAuthModal(true);
      return;
    }

    const trimmed = newComment.trim();
    if (!trimmed) return;

    const minuteFromElapsed = (() => {
      const parts = elapsedTime.split(':');
      if (parts.length === 2) {
        const parsed = Number(parts[0]);
        if (Number.isFinite(parsed)) return parsed;
      }
      return Math.floor((activeMatch.timer_offset_seconds || 0) / 60);
    })();

    const authorName = String(
      user.user_metadata?.name
      || user.user_metadata?.full_name
      || user.email
      || 'Torcedor'
    );

    setIsSendingComment(true);
    try {
      const { error } = await supabase.from('match_events').insert({
        match_id: activeMatch.id,
        event_type: 'comentario',
        minute: minuteFromElapsed,
        commentary: trimmed,
        user_id: user.id,
        author_name: authorName
      });
      if (error) throw error;

      setNewComment('');
      refreshEvents();
      toast.success('Comentário enviado!');
    } catch (err: unknown) {
      const message = typeof (err as { message?: unknown })?.message === 'string' ? String((err as any).message) : null;
      toast.error(message ? `Erro ao enviar: ${message}` : 'Erro ao enviar comentário');
    } finally {
      setIsSendingComment(false);
    }
  }, [activeMatch, elapsedTime, newComment, refreshEvents, user]);
  const deleteComment = async (ev: MatchEvent) => {
    if (!canDeleteComment(ev)) return;
    try {
      const { error } = await supabase.from('match_events').delete().eq('id', ev.id);
      if (error) throw error;
      toast.success('Comentário excluído.');
    } catch (err: unknown) {
      const message = typeof (err as { message?: unknown })?.message === 'string' ? String((err as any).message) : null;
      toast.error(message ? `Erro ao excluir: ${message}` : 'Erro ao excluir comentário');
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

  const { containerRef, isPulling, pullDistance, isRefreshing } = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([
        refreshMatches(),
        refreshEvents(),
        refreshRoundMvp()
      ]);
    },
    disabled: true,
  });

  // IMPORTANT: This hook must stay HERE, before any conditional returns, to satisfy React's rules of hooks.
  const selectorMatches = useMemo(() => {
    if (!activeMatch) return matches;
    
    // Pega todas as partidas da mesma rodada da partida ativa, ordenadas por data
    return matches
      .filter(m => m.round === activeMatch.round)
      .sort((a, b) => {
        const dateA = a.match_date || '';
        const dateB = b.match_date || '';
        return dateA.localeCompare(dateB);
      });
  }, [matches, activeMatch]);

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
  

  return (
    <div className="match-center responsive-container animate-fade-in" ref={containerRef}>
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

      {/* Live Match Notification Toast */}
      <AnimatePresence>
        {liveMatchId && liveMatchId !== activeMatch?.id && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="live-match-toast glass"
          >
            <div className="pulse-indicator"></div>
            <div className="toast-content">
              <strong>Novo jogo ao vivo detectado!</strong>
              <button 
                className="btn-toast-switch"
                onClick={() => handleSelectMatch(liveMatchId)}
              >
                Assistir
              </button>
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

        <div className="match-selector-summary" role="status" aria-live="polite">
          <span className="summary-chip summary-live">Ao vivo: {liveCount}</span>
          <span className="summary-chip">Agendados: {upcomingCount}</span>
          <span className="summary-chip">Finalizados: {finishedCount}</span>
          {activeMatch?.round && (
            <span className="summary-chip summary-round">Rodada {activeMatch.round}</span>
          )}
        </div>

        {/* Mobile Dropdown Selector */}
        <div className="mobile-selector-container mobile-only">
          <select 
            className="match-select-mobile"
            value={activeMatch?.id || ''}
            onChange={(e) => handleSelectMatch(e.target.value)}
          >
            {selectorMatches.map(m => (
              <option key={m.id} value={m.id}>
                {m.status === 'ao_vivo' ? '🔴 ' : ''}
                {getTeamLabel(m.teams_a?.name, 'Equipe A')} x {getTeamLabel(m.teams_b?.name, 'Equipe B')}
              </option>
            ))}
          </select>
        </div>

        {/* Desktop Pills Selector */}
        <div className="selector-list desktop-only">
          {selectorMatches.map(m => (
            <button 
              key={m.id} 
              className={`match-pill ${activeMatch?.id === m.id ? 'active' : ''}`}
              onClick={() => handleSelectMatch(m.id)}
            >
              <span className="pill-teams">
                {getTeamShortName(m.teams_a?.name, 'A')} x {getTeamShortName(m.teams_b?.name, 'B')}
              </span>
              {m.status === 'ao_vivo' && <span className="live-dot-mini"></span>}
            </button>
          ))}
        </div>
      </div>

      <div className="match-layout">
        {!activeMatch ? (
          <div className="match-primary">
            <div className="empty-state glass">Nenhuma partida programada.</div>
          </div>
        ) : (
          <>
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
                      decoding="async"
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
                <div className={`sb-timer active ${activeMatch.status === 'ao_vivo' && !activeMatch.is_timer_running ? 'paused' : ''}`}>
                  <Timer size={14} className={activeMatch.status === 'ao_vivo' && activeMatch.is_timer_running ? 'animate-pulse' : ''} />
                  <div className="timer-info-group">
                    <span className="elapsed-time">
                      {activeMatch.status === 'ao_vivo' && !activeMatch.is_timer_running 
                        ? (events.some(e => e.event_type === 'comentario' && e.commentary?.includes('Fim do 1º Tempo')) ? 'INTERVALO' : 'PAUSADO') 
                        : elapsedTime}
                    </span>
                    {matchPeriod && (
                      <span className="period-badge">{matchPeriod}</span>
                    )}
                  </div>
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
                      decoding="async"
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
                      if (!user) {
                        setShowAuthModal(true);
                        return;
                      }
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
                        if (!user) {
                          setShowAuthModal(true);
                          return;
                        }
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
                      if (!user) {
                        setShowAuthModal(true);
                        return;
                      }
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
              ) : events.filter(e => e.event_type !== 'comentario' && e.event_type !== 'momento').length > 0 ? (
                events.filter(e => e.event_type !== 'comentario' && e.event_type !== 'momento').map((event) => (
                  <div key={event.id} className="t-event animate-fade-in">
                    <div className="t-time">{event.minute}'</div>
                    <div className="t-icon-box">
                      {event.event_type === 'gol' && <Trophy size={14} color="var(--secondary)" />}
                      {event.event_type === 'amarelo' && <div className="card-yellow"></div>}
                      {event.event_type === 'vermelho' && <div className="card-red"></div>}
                      {event.event_type === 'substituicao' && <ArrowRightLeft size={14} color="#fff" />}
                    </div>
                    <div className="t-content glass">
                      <div className="t-header">
                        <span className="t-type">
                          {event.event_type === 'gol' ? 'GOL!' : 
                           event.event_type === 'amarelo' ? 'Cartão Amarelo' :
                           event.event_type === 'vermelho' ? 'Cartão Vermelho' :
                           event.event_type === 'substituicao' ? 'Substituição' :
                           'Informação'}
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
                    <div className="comment-meta">
                      <span className="comment-time">{ev.minute}'</span>
                      <span className="comment-author">{ev.author_name || 'Torcedor'}</span>
                      {canDeleteComment(ev) && (
                        <button
                          type="button"
                          className="comment-delete"
                          onClick={() => void deleteComment(ev)}
                          title="Excluir comentário"
                        >
                          Excluir
                        </button>
                      )}
                    </div>
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
                    <span style={{ fontSize: '1.1rem' }}>🔒</span>
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
                <>
                  {roundVotes.slice(0, 3).map((mvp, idx) => (
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
                        {!roundUserVote && (
                          <button className="btn-vote-mini" onClick={() => {
                            if (!user) {
                              setShowAuthModal(true);
                              return;
                            }
                            castRoundVote(mvp.player_id);
                          }}>votar</button>
                        )}
                    </div>
                  ))}
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
                      <button className="btn-login" onClick={() => setShowAuthModal(true)}>
                        Faça login para participar dos comentários ao vivo!
                      </button>
                    </div>
                  )}
                  {showAuthModal && (
                    <div className="modal-auth-overlay" onClick={() => setShowAuthModal(false)}>
                      <div className="modal-auth-content" onClick={e => e.stopPropagation()}>
                        <AuthModal onClose={() => setShowAuthModal(false)} />
                      </div>
                    </div>
                  )}
                </>
              ) : <p className="empty-h2h">Primeiro encontro oficial.</p>}
            </div>
          </div>
        </aside>
      </>
    )}
  </div>
  </div>
  );
};

export default MatchCenter;
