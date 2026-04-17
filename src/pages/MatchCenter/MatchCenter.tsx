import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMatches, type Match } from '../../hooks/useMatches';
import { useMatchEvents, type MatchEvent } from '../../hooks/useMatchEvents';
import { usePlayers } from '../../hooks/usePlayers';
import { useMvpVoting } from '../../hooks/useMvpVoting';
import Skeleton from '../../components/Skeleton/Skeleton';
import { useTournamentConfig } from '../../hooks/useTournamentConfig';
import { useAuthContext } from '../../contexts/AuthContext';
import AuthModal from '../../components/Auth/AuthModal';
import { useStandings } from '../../hooks/useStandings';
import { useGroupCVisibility } from '../../hooks/useGroupCVisibility';
import { supabase } from '../../lib/supabase';
import { TrendingUp, Award, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import ShareCard, { useShareCard } from '../../components/ShareCard/ShareCard';
import { useMatchWinnerVoting } from '../../hooks/useMatchWinnerVoting';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { emitGoalOverlay } from '../../lib/goalOverlay';
import { useDivisionContext } from '../../contexts/DivisionContext';
import { deriveMatchStatus } from '../../lib/matchStatus';
import { KNOCKOUT_ROUND_LABELS } from '../../lib/tournamentRules';

// Refactored Components & Hooks
import { MatchSelector } from './components/MatchSelector';
import { Scoreboard } from './components/Scoreboard';
import { MatchTimeline } from './components/MatchTimeline';
import { MatchPolls } from './components/MatchPolls';
import { useMatchTimer } from '../../hooks/useMatchTimer';
import { isKnockoutRound } from '../../lib/matchHelpers';
import './MatchCenter.css';

const MatchCenter: React.FC = () => {
  const { division } = useDivisionContext();
  const { matches, loading: matchesLoading, error: matchesError, refresh: refreshMatches } = useMatches();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, role } = useAuthContext();
  const isAdmin = role === 'admin';
  const { visibility } = useGroupCVisibility();
  const { config } = useTournamentConfig();
  
  const isTestGroup = (groupName?: string | null) => {
    const clean = (groupName || '').trim().toUpperCase().replace(/\s+/g, '');
    return clean === 'C' || clean === 'GRUPOC';
  };

  const baseMatches = useMemo(() => {
    if (isAdmin || visibility.matches) return matches;
    return matches.filter(m => {
      const isTeamAGroupC = isTestGroup(m.teams_a?.group);
      const isTeamBGroupC = isTestGroup(m.teams_b?.group);
      return !isTeamAGroupC && !isTeamBGroupC;
    });
  }, [matches, isAdmin, visibility.matches]);

  // Single source of truth for selected match
  const selectedMatchId = searchParams.get('id');
  
  const activeMatch = useMemo(() => {
    if (selectedMatchId) {
      const byId = baseMatches.find(m => m.id === selectedMatchId);
      if (byId) return byId;
    }

    const nowMs = Date.now();
    const live = baseMatches.find((m) => deriveMatchStatus(m, nowMs) === 'ao_vivo');
    if (live) return live;

    // Preferir a unidade atual (Noite/Rodada) da fase de grupos, conforme config.
    if (config.current_phase === 'grupos') {
      const groupUnit = config.group_unit || 'night';
      const currentSlot = config.current_round || 1;

      const inCurrentSlot = baseMatches
        .filter((m) => (m.round || 0) < 1000)
        .filter((m) => (groupUnit === 'night' ? (m.night ?? null) : (m.round ?? null)) === currentSlot)
        .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());

      return inCurrentSlot.find((m) => m.status !== 'finalizado') || inCurrentSlot[0] || baseMatches[0];
    }

    return baseMatches[0];
  }, [baseMatches, selectedMatchId, config.current_phase, config.current_round, config.group_unit]);

  const handleSelectMatch = (id: string) => {
    setSearchParams({ id });
  };

  // Ao finalizar uma partida, avança automaticamente para a próxima da mesma unidade.
  // Se a unidade acabou, tenta ir para a próxima unidade com jogos pendentes.
  const lastFinalizedRef = useRef<{ id: string | null; status: Match['status'] | null }>({ id: null, status: null });

  useEffect(() => {
    const currentId = activeMatch?.id || null;
    const currentStatus = activeMatch?.status || null;
    const prev = lastFinalizedRef.current;

    const justFinalized = Boolean(
      activeMatch &&
      prev.id === currentId &&
      prev.status !== 'finalizado' &&
      currentStatus === 'finalizado'
    );

    lastFinalizedRef.current = { id: currentId, status: currentStatus };

    if (!justFinalized || !activeMatch) return;

    const byDate = (a: Match, b: Match) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime();
    const activeRound = activeMatch.round || 0;

    if (activeRound >= 1000) {
      const samePhase = [...baseMatches].filter((m) => m.round === activeRound).sort(byDate);
      const next = samePhase.find((m) => m.status !== 'finalizado');
      if (next) setSearchParams({ id: next.id }, { replace: true });
      return;
    }

    const groupUnit = config.group_unit || 'night';
    const groupMatches = baseMatches.filter((m) => (m.round || 0) < 1000);
    const currentSlot = groupUnit === 'night' ? (activeMatch.night ?? null) : (activeMatch.round ?? null);
    if (!currentSlot) return;

    const inSlot = groupMatches
      .filter((m) => (groupUnit === 'night' ? (m.night ?? null) : (m.round ?? null)) === currentSlot)
      .sort(byDate);

    const nextInSlot = inSlot.find((m) => m.status !== 'finalizado');
    if (nextInSlot) {
      setSearchParams({ id: nextInSlot.id }, { replace: true });
      return;
    }

    const slotValues = Array.from(
      new Set(
        groupMatches
          .map((m) => (groupUnit === 'night' ? (m.night ?? null) : (m.round ?? null)))
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      )
    ).sort((a, b) => a - b);

    const nextSlot = slotValues.find((v) =>
      v > currentSlot &&
      groupMatches.some((m) => (groupUnit === 'night' ? (m.night ?? null) : (m.round ?? null)) === v && m.status !== 'finalizado')
    );
    if (!nextSlot) return;

    const nextMatch =
      groupMatches
        .filter((m) => (groupUnit === 'night' ? (m.night ?? null) : (m.round ?? null)) === nextSlot)
        .sort(byDate)
        .find((m) => m.status !== 'finalizado') || null;

    if (nextMatch) setSearchParams({ id: nextMatch.id }, { replace: true });
  }, [activeMatch, baseMatches, config.group_unit, setSearchParams]);

  const counts = useMemo(() => {
    const nowMs = Date.now();
    const derived = baseMatches.map((m) => deriveMatchStatus(m, nowMs));
    return {
      live: derived.filter((s) => s === 'ao_vivo').length,
      upcoming: derived.filter((s) => s === 'agendado').length,
      finished: derived.filter((s) => s === 'finalizado').length,
    };
  }, [baseMatches]);

  const liveMatchId = useMemo(() => {
    const nowMs = Date.now();
    return baseMatches.find((m) => deriveMatchStatus(m, nowMs) === 'ao_vivo')?.id;
  }, [baseMatches]);
  const { players } = usePlayers();
  const { standings } = useStandings();

  const lastMatchRefreshAtRef = useRef(0);
  const requestMatchRefresh = useCallback(() => {
    const now = Date.now();
    // Evita rajadas quando chega mais de 1 evento/realtime + polling.
    if (now - lastMatchRefreshAtRef.current < 1200) return;
    lastMatchRefreshAtRef.current = now;
    refreshMatches();
  }, [refreshMatches]);

  const handleNewEvent = (event: MatchEvent) => {
    if (event.match_id !== activeMatch?.id) return;
    if (event.created_at && (Date.now() - new Date(event.created_at).getTime()) / 1000 > 60) return;

    if (event.event_type === 'gol') {
      const playerName = event.players?.name || 'Desconhecido';
      const player = players.find((p) => p.id === event.player_id);
      const teamName =
        player?.team_id === activeMatch?.team_a_id ? activeMatch?.teams_a?.name : activeMatch?.teams_b?.name;
      const playerPhotoUrl = event.players?.photo_url || player?.photo_url;

      toast.success(`⚽ GOOOOL! ${playerName}`);
      emitGoalOverlay({ id: event.id, team: teamName || 'GOL!', player: playerName, playerPhotoUrl, division });

      // Atualiza placar/status mais rápido caso o realtime de `matches` falhe.
      requestMatchRefresh();
    } else if (event.event_type === 'amarelo') {
      toast(`🟨 Cartão Amarelo para ${event.players?.name || ''}`, { icon: '🟨' });
    } else if (event.event_type === 'vermelho') {
      toast.error(`🟥 Cartão Vermelho para ${event.players?.name || ''}`);
    }
  };

  const { events, refresh: refreshEvents } = useMatchEvents(activeMatch?.id || '', handleNewEvent);
  const { elapsedTime, isPaused } = useMatchTimer(activeMatch);

  const matchPeriod = useMemo(() => {
    if (!activeMatch || deriveMatchStatus(activeMatch) !== 'ao_vivo') return null;
    const hasEndedFirstHalf = events.some(e => e.event_type === 'comentario' && e.commentary?.includes('Fim do 1º Tempo'));
    const hasStartedSecondHalf = events.some(e => e.event_type === 'comentario' && e.commentary?.includes('Início do 2º Tempo'));
    if (hasStartedSecondHalf) return '2º Tempo';
    if (hasEndedFirstHalf) return 'Intervalo';
    return '1º Tempo';
  }, [activeMatch, events]);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const { voteCounts: roundVotes, loading: roundMvpLoading, error: roundMvpError, refresh: refreshRoundMvp } = useMvpVoting(String(config.current_round));
  const { votes: winnerVotes, userVote: winnerUserVote, vote: castWinnerVote, error: winnerVotesError } = useMatchWinnerVoting(activeMatch?.id || '');
  const { cardRef, downloadCard } = useShareCard();
  const [isExporting, setIsExporting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSendingComment, setIsSendingComment] = useState(false);

  const handleSendComment = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeMatch || !user) return;
    const trimmed = newComment.trim();
    if (!trimmed) return;

    setIsSendingComment(true);
    try {
      const { error } = await supabase.from('match_events').insert({
        match_id: activeMatch.id,
        event_type: 'comentario',
        minute: parseInt(elapsedTime.split(':')[0]) || 0,
        commentary: trimmed,
        user_id: user.id,
        author_name: user.user_metadata?.name || user.email || 'Torcedor'
      });
      if (error) throw error;
      setNewComment('');
      refreshEvents();
    } catch (err: any) {
      toast.error('Erro ao enviar comentário');
    } finally {
      setIsSendingComment(false);
    }
  }, [activeMatch, elapsedTime, newComment, refreshEvents, user]);

  const handleDeleteComment = async (ev: MatchEvent) => {
    try {
      await supabase.from('match_events').delete().eq('id', ev.id);
      toast.success('Comentário excluído.');
    } catch {
      toast.error('Erro ao excluir comentário');
    }
  };

  const handleDownloadCard = async () => {
    if (!activeMatch) return;
    setIsExporting(true);
    await downloadCard(activeMatch.id);
    setIsExporting(false);
  };

  const handleCopySummary = async () => {
    if (!activeMatch) return;
    const text = `${activeMatch.teams_a?.name} ${activeMatch.team_a_score}x${activeMatch.team_b_score} ${activeMatch.teams_b?.name}`;
    await navigator.clipboard.writeText(text);
    toast.success('Resumo copiado!');
  };

  const { containerRef, isPulling, pullDistance, isRefreshing } = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([refreshMatches(), refreshEvents(), refreshRoundMvp()]);
    },
    disabled: true,
  });

  const selectorMatches = useMemo(() => {
    if (!activeMatch) return matches;
    const activeRound = activeMatch.round || 0;
    const isKnockoutByRound = activeRound >= 1000;

    const groupUnit = config.group_unit || 'night';

    if (isKnockoutByRound) {
      return matches
        .filter((m) => m.round === activeRound)
        .sort((a, b) => (a.match_date || '').localeCompare(b.match_date || ''));
    }

    // Fase de grupos: por Noite ou Rodada (configuravel). Sem fallback por data.
    const activeSlot = groupUnit === 'night' ? (activeMatch.night ?? null) : (activeMatch.round ?? null);
    return matches
      .filter((m) => (m.round || 0) < 1000)
      .filter((m) => (groupUnit === 'night' ? (m.night ?? null) : (m.round ?? null)) === activeSlot)
      .sort((a, b) => (a.match_date || '').localeCompare(b.match_date || ''));
  }, [matches, activeMatch, config.group_unit]);

  const selectorDesktopTitle = useMemo(() => {
    const round = activeMatch?.round || 0;
    if (round >= 1000) return 'Fase Atual';
    const groupUnit = config.group_unit || 'night';
    return `${groupUnit === 'night' ? 'Noite' : 'Rodada'} Atual`;
  }, [activeMatch, config.group_unit]);

  const selectorActiveChip = useMemo(() => {
    if (!activeMatch) return null;
    const round = activeMatch.round || 0;
    if (round >= 1000) return KNOCKOUT_ROUND_LABELS[round] || `Fase ${round}`;
    const groupUnit = config.group_unit || 'night';
    const label = groupUnit === 'night' ? 'Noite' : 'Rodada';
    const slot = groupUnit === 'night' ? (activeMatch.night ?? null) : (activeMatch.round ?? null);
    return slot ? `${label} ${slot}` : `Sem ${label}`;
  }, [activeMatch, config.group_unit]);

  const finishedMatches = useMemo(() => {
    return [...baseMatches]
      .filter((m) => deriveMatchStatus(m) === 'finalizado')
      .sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime())
      .slice(0, 20);
  }, [baseMatches]);

  const formatHistoryLabel = (m: Match) => {
    const d = new Date(m.match_date);
    const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${date} • ${time}`;
  };

  if (matchesLoading && matches.length === 0) return <div className="match-center p-8"><Skeleton width="100%" height="400px" /></div>;

  return (
    <div className="match-center responsive-container animate-fade-in" ref={containerRef}>
      {showAuthModal && <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />}
      
      {/* Pull To Refresh */}
      {(isPulling || isRefreshing) && (
        <div className="pull-to-refresh-indicator">
          {isRefreshing ? 'Atualizando...' : 'Puxe para atualizar'}
        </div>
      )}

      {/* Live Toast */}
      <AnimatePresence>
        {liveMatchId && liveMatchId !== activeMatch?.id && (
          <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="live-match-toast glass">
            <span>Novo jogo ao vivo!</span>
            <button onClick={() => handleSelectMatch(liveMatchId)}>Assistir</button>
          </motion.div>
        )}
      </AnimatePresence>

      <MatchSelector 
        matches={selectorMatches} 
        activeMatchId={activeMatch?.id || null} 
        onSelectMatch={handleSelectMatch}
        desktopTitle={selectorDesktopTitle}
        activeGroupChip={selectorActiveChip}
        counts={counts}
      />

      <section className="match-history-panel glass">
        <div className="history-header-row">
          <div className="history-title">
            <Award size={16} color="var(--secondary)" />
            <span>Histórico de jogos</span>
          </div>
          <span className="history-subtitle">Últimos 20 finalizados</span>
        </div>
        <div className="history-list" role="list">
          {finishedMatches.length === 0 ? (
            <p className="history-empty">Sem jogos finalizados ainda.</p>
          ) : (
            finishedMatches.map((m) => {
              const mvpName = m.match_mvp_player_id
                ? (players.find((p) => p.id === m.match_mvp_player_id)?.name || null)
                : null;

              return (
                <button
                  key={m.id}
                  type="button"
                  className={`history-item ${activeMatch?.id === m.id ? 'active' : ''}`}
                  onClick={() => handleSelectMatch(m.id)}
                >
                  <div className="history-left">
                    <div className="history-teams">
                      <strong>{m.teams_a?.name || 'Equipe A'}</strong>
                      <span className="history-vs">{m.team_a_score} x {m.team_b_score}</span>
                      <strong>{m.teams_b?.name || 'Equipe B'}</strong>
                    </div>
                    <div className="history-meta">
                      <span>{formatHistoryLabel(m)}</span>
                      {mvpName && <span className="history-mvp">Craque: {mvpName}</span>}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      <div className="match-layout">
        {!activeMatch ? (
          <div className="match-primary glass p-8">Nenhuma partida programada.</div>
        ) : (
          <>
            <div className="match-primary">
              <Scoreboard 
                match={activeMatch}
                elapsedTime={elapsedTime}
                matchPeriod={matchPeriod}
                isPaused={isPaused}
                mvpName={players.find(p => p.id === activeMatch.match_mvp_player_id)?.name}
                isExporting={isExporting}
                onDownloadCard={handleDownloadCard}
                onCopySummary={handleCopySummary}
              />

              <MatchPolls 
                match={activeMatch}
                user={user}
                winnerVotes={winnerVotes}
                winnerUserVote={winnerUserVote}
                winnerVotesError={winnerVotesError}
                onCastWinnerVote={castWinnerVote}
                onShowAuthModal={() => setShowAuthModal(true)}
                getPollQuestion={() => deriveMatchStatus(activeMatch) === 'finalizado' ? 'Quem venceu?' : 'Quem vence?'}
                isKnockout={isKnockoutRound(String(activeMatch.round))}
              />

              <MatchTimeline 
                events={events}
                players={players}
                user={user}
                onSendComment={handleSendComment}
                onDeleteComment={handleDeleteComment}
                canDeleteComment={(ev) => isAdmin || (user?.id === ev.user_id)}
                newComment={newComment}
                setNewComment={setNewComment}
                isSendingComment={isSendingComment}
              />
            </div>

            <aside className="match-side">
              {deriveMatchStatus(activeMatch) === 'ao_vivo' && (
                <div className="standings-impact-widget glass">
                  <div className="side-header">
                    <TrendingUp size={18} color="var(--secondary)" />
                    <h3>Impacto na Tabela</h3>
                  </div>
                  <div className="impact-container">
                    {(() => {
                      // 1. Criar cópia virtual da classificação atual
                      const virtualStandings = standings.map(s => ({ ...s }));
                      
                      // 2. Aplicar placar atual da partida AO VIVO
                      const teamA = virtualStandings.find(s => s.team_id === activeMatch.team_a_id);
                      const teamB = virtualStandings.find(s => s.team_id === activeMatch.team_b_id);
                      
                      if (teamA && teamB) {
                        const scoreA = activeMatch.team_a_score || 0;
                        const scoreB = activeMatch.team_b_score || 0;
                        
                        teamA.goals_for += scoreA;
                        teamA.goals_against += scoreB;
                        teamB.goals_for += scoreB;
                        teamB.goals_against += scoreA;
                        teamA.goals_diff = teamA.goals_for - teamA.goals_against;
                        teamB.goals_diff = teamB.goals_for - teamB.goals_against;
                        
                        if (scoreA > scoreB) {
                          teamA.points += 3; teamA.wins += 1;
                        } else if (scoreA === scoreB) {
                          teamA.points += 1; teamB.points += 1;
                        } else {
                          teamB.points += 3; teamB.wins += 1;
                        }
                      }
                      
                      // 3. Re-ordenar (Pontos -> Vitórias -> Saldo -> Gols Pró)
                      virtualStandings.sort((a, b) => {
                        if (b.points !== a.points) return b.points - a.points;
                        if (b.wins !== a.wins) return b.wins - a.wins;
                        if (b.goals_diff !== a.goals_diff) return b.goals_diff - a.goals_diff;
                        return b.goals_for - a.goals_for;
                      });

                      // 4. Renderizar impacto para os dois times
                      return [activeMatch.team_a_id, activeMatch.team_b_id].map(teamId => {
                        const currentRank = standings.findIndex(s => s.team_id === teamId) + 1;
                        const virtualRank = virtualStandings.findIndex(s => s.team_id === teamId) + 1;
                        const team = virtualStandings.find(s => s.team_id === teamId);
                        
                        if (!team || currentRank === 0) return null;

                        const rankDiff = currentRank - virtualRank;
                        const color = rankDiff > 0 ? '#10b981' : rankDiff < 0 ? '#ef4444' : 'var(--text-dim)';

                        return (
                          <div key={teamId} className="impact-row">
                            <div className="impact-team-info">
                              <span className="impact-team-name">{team.team_name}</span>
                              <span className="impact-rank-change" style={{ color }}>
                                {currentRank}º → {virtualRank}º
                              </span>
                            </div>
                            <div className="impact-stats">
                              <span className="impact-points">{team.points} pts</span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <p className="impact-note">* Simulação em tempo real usando critérios de desempate.</p>
                </div>
              )}

              {config.current_phase === 'grupos' && (
                <div className="round-mvp-widget glass">
                  <div className="side-header"><Award size={18} /> <h3>Craque da {config.group_unit === 'round' ? 'Rodada' : 'Noite'}</h3></div>
                  {roundMvpLoading ? <Skeleton height="100px" /> : (
                    <div className="mvp-ranking-list">
                      {roundVotes.slice(0, 3).map((v, i) => (
                        <div key={v.player_id} className="mvp-rank-item">#{i+1} {v.players?.name} ({v.count} votos)</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </aside>
          </>
        )}
      </div>

      <ShareCard match={activeMatch} mvpPlayer={players.find(p => p.id === activeMatch?.match_mvp_player_id)} innerRef={cardRef} />
    </div>
  );
};

export default MatchCenter;
