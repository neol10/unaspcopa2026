import React, { useEffect, useMemo, useState, useDeferredValue, useCallback } from 'react';
import { motion } from 'framer-motion';
import './Rankings.css';
import { useRankings, RankingPlayer } from '../../hooks/useRankings';
import { Trophy, Activity, ShieldAlert, Zap, User, Download, Search } from 'lucide-react';
import { getPendingSuspension } from '../../lib/discipline';
import toast from 'react-hot-toast';
import PlayerProfileModal from '../Players/PlayerProfileModal';
import Skeleton, { SkeletonRankingRow } from '../../components/Skeleton/Skeleton';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { downloadSocialPlayerCard } from '../../lib/socialCardExport';
import { useAuthContext } from '../../contexts/AuthContext';
import { useTournamentConfig } from '../../hooks/useTournamentConfig';

const Rankings: React.FC = () => {
  const { scorers, assistants, participationRank, goalkeepers, disciplined, roundMvps, roundMvpsList, roundHighlights, availableRounds, loading, error, refresh } = useRankings();
  const { config } = useTournamentConfig();
  const { role: authRole } = useAuthContext();
  const [selectedPlayer, setSelectedPlayer] = useState<RankingPlayer | null>(null);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);
  const [downloadingCardKey, setDownloadingCardKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [viewLimit, setViewLimit] = useState<5 | 10>(10);
  const touchStartXRef = React.useRef<number | null>(null);
  const touchMoveXRef = React.useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<'scorers' | 'participation' | 'assistants' | 'goalkeepers' | 'disciplined'>('scorers');

  const normalize = useCallback((value: string) => value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''), []);

  const filterPlayers = useMemo(() => {
    const term = normalize(deferredSearchTerm.trim());
    return (list: RankingPlayer[]) => {
      if (!term) return list.slice(0, viewLimit);
      return list.filter((p) => {
        const name = normalize(p.name || '');
        const team = normalize(p.team_name || '');
        return name.includes(term) || team.includes(term);
      }).slice(0, viewLimit);
    };
  }, [deferredSearchTerm, viewLimit, normalize]);

  const filterPlayersTop20 = useMemo(() => {
    const term = normalize(deferredSearchTerm.trim());
    return (list: RankingPlayer[]) => {
      if (!term) return list.slice(0, 20);
      return list.filter((p) => {
        const name = normalize(p.name || '');
        const team = normalize(p.team_name || '');
        return name.includes(term) || team.includes(term);
      }).slice(0, 20);
    };
  }, [deferredSearchTerm, normalize]);

  const top3Scorers = useMemo(() => scorers.slice(0, 3), [scorers]);

  const visibleScorers = useMemo(() => filterPlayers(scorers), [filterPlayers, scorers]);
  const visibleGoalkeepers = useMemo(() => filterPlayers(goalkeepers), [filterPlayers, goalkeepers]);
  const visibleAssistants = useMemo(() => filterPlayers(assistants), [filterPlayers, assistants]);
  const visibleParticipation = useMemo(() => filterPlayers(participationRank || []), [filterPlayers, participationRank]);
  const visibleDisciplined = useMemo(() => filterPlayersTop20(disciplined), [filterPlayersTop20, disciplined]);

  const podiumOrder = useMemo(() => [
    top3Scorers[1] || null,
    top3Scorers[0] || null,
    top3Scorers[2] || null
  ], [top3Scorers]);

  const { containerRef, isPulling, pullDistance, isRefreshing } = usePullToRefresh({
    onRefresh: async () => {
      await refresh();
    }
  });

  useEffect(() => {
    if (!loading) {
      setStuck(false);
      return;
    }
    const id = setTimeout(() => setStuck(true), 25000);
    return () => clearTimeout(id);
  }, [loading]);

  // Set default round once available
  React.useEffect(() => {
    if (!selectedRound && availableRounds.length > 0) {
      setSelectedRound(availableRounds[availableRounds.length - 1]);
    }
  }, [availableRounds, selectedRound]);

  const hasScorers = scorers.length > 0;
  const roundWinner = selectedRound ? roundMvps[selectedRound] : null;
  const roundWinnersList = selectedRound && roundMvpsList ? (roundMvpsList[selectedRound] || []) : [];
  const highlightedPlayerId = selectedRound && roundHighlights ? roundHighlights[selectedRound] : null;

  // Swipe handlers for touch devices to change selectedRound
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchMoveXRef.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const start = touchStartXRef.current;
    const end = touchMoveXRef.current;
    if (start === null || end === null) return;
    const dx = end - start;
    const threshold = 50; // px
    if (Math.abs(dx) > threshold && availableRounds.length > 0) {
      const idx = availableRounds.findIndex(r => r === selectedRound);
      if (dx < 0 && idx < availableRounds.length - 1) {
        setSelectedRound(availableRounds[idx + 1]);
      } else if (dx > 0 && idx > 0) {
        setSelectedRound(availableRounds[idx - 1]);
      }
    }
    touchStartXRef.current = null;
    touchMoveXRef.current = null;
  }, [availableRounds, selectedRound]);

  const handleDownloadRankingCard = useCallback(async (
    key: string,
    player: RankingPlayer,
    category: string,
    subtitle: string,
    theme: 'gold' | 'blue' | 'red' | 'green',
    stats: Array<{ label: string; value: string | number }>,
  ) => {
    const safeName = player.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    setDownloadingCardKey(key);
    try {
      await downloadSocialPlayerCard({
        fileName: `card-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${safeName || player.id}`,
        category,
        subtitle,
        theme,
        player: {
          name: player.name,
          teamName: player.team_name,
          position: player.position,
          photoUrl: player.photo_url,
          teamBadgeUrl: player.team_badge_url,
          teamPrimaryColor: player.team_primary_color,
        },
        stats,
      });
      toast.success(`Card de ${player.name} baixado!`);
    } catch (error) {
      console.error('Erro ao baixar card de ranking:', error);
      toast.error('Nao foi possivel baixar este card.');
    } finally {
      setDownloadingCardKey(null);
    }
  }, []);

  const groupUnit = config?.group_unit === 'round' ? 'round' : 'night';
  const unitLabel = groupUnit === 'round' ? 'Rodada' : 'Noite';
  const unitChipPrefix = groupUnit === 'round' ? 'R' : 'N';

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

  return (
    <div className="rankings-container animate-fade-in" ref={containerRef}>
      <div className="rankings-card-export">
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
        <div className="rankings-actions">
          <div className="stat-summary-pill glass">
            <Activity size={16} color="var(--secondary)" />
          </div>
        </div>
      </header>

      <section className="rankings-filter-bar glass">
        <label className="rankings-search-wrap" htmlFor="rankings-search-input">
          <Search size={15} />
          <input
            id="rankings-search-input"
            type="search"
            placeholder="Buscar atleta ou equipe"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </label>
        <div className="rankings-limit-toggle">
          <button type="button" className={viewLimit === 5 ? 'active' : ''} onClick={() => setViewLimit(5)}>Top 5</button>
          <button type="button" className={viewLimit === 10 ? 'active' : ''} onClick={() => setViewLimit(10)}>Top 10</button>
        </div>
      </section>

      <div className="rankings-featured-grid">
        {/* Craque da Unidade (Noite/Rodada) */}
        <section className="round-mvp-highlight glass animate-slide-up">
          <div className="panel-header-v2">
            <div className="header-title-group">
               <Trophy size={18} color="var(--secondary)" />
              <h3>Craque da {unitLabel}</h3>
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
                  {Number(r) >= 1000 ? (Number(r) === 1000 ? 'OIT' : Number(r) === 2000 ? 'QUA' : Number(r) === 3000 ? 'SEM' : Number(r) === 4000 ? 'FIN' : Number(r) === 5000 ? '3ºL' : 'M' + r) : unitChipPrefix + r}
                </button>
              ))}
            </div>
          </div>

          {roundWinnersList && roundWinnersList.length > 0 ? (
              <div className="round-winners-list" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
                {roundWinnersList.map((winner, idx) => (
                  <div
                    key={`${winner.id}-${idx}`}
                    className={`round-winner-card ${highlightedPlayerId === winner.id ? 'golden-highlight blinking' : ''}`}
                    onClick={() => setSelectedPlayer(winner)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedPlayer(winner);
                      }
                    }}
                  >
                  <div className="winner-avatar-box">
                    {winner.photo_url ? (
                      <img
                        src={winner.photo_url}
                        alt=""
                        width="64"
                        height="64"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <User size={32} />
                    )}
                  </div>
                  <div className="winner-details">
                    <h4>{winner.name}</h4>
                    <span className="winner-team">{winner.team_name}{winner.position ? ` • ${winner.position.toUpperCase()}` : ''}</span>
                    <p className="winner-reason">Craque do jogo — {Number(selectedRound) >= 1000 ? (
                      Number(selectedRound) === 1000 ? 'Oitavas' :
                      Number(selectedRound) === 2000 ? 'Quartas' :
                      Number(selectedRound) === 3000 ? 'Semi' :
                      Number(selectedRound) === 4000 ? 'Final' :
                      Number(selectedRound) === 5000 ? '3º Lugar' : `Fase ${selectedRound}`
                    ) : `${unitLabel} ${selectedRound}`}.</p>
                    {authRole === 'admin' && (
                      <button
                        type="button"
                        className="rank-row-download-btn mvp-download-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadRankingCard(
                            `mvp-${selectedRound}-${winner.id}`,
                            winner,
                            `Craque da ${unitLabel}`,
                            `${unitLabel} ${selectedRound} da Copa Unasp`,
                            'gold',
                            [
                              { label: unitLabel, value: selectedRound || '-' },
                              { label: 'G/A', value: `${winner.goals_count || 0} G + ${winner.assists || 0} A` },
                              { label: 'Categoria', value: 'MVP' },
                            ],
                          );
                        }}
                        disabled={downloadingCardKey === `mvp-${selectedRound}-${winner.id}`}
                      >
                        <Download size={14} />
                        <span>{downloadingCardKey === `mvp-${selectedRound}-${winner.id}` ? 'Gerando...' : 'Baixar card'}</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="round-empty-state">
              <Zap size={24} opacity={0.3} />
              <p>Selecione uma {unitLabel.toLowerCase()} finalizada.</p>
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
                        <img src={player.photo_url} alt={player.name} className="podium-avatar" loading="lazy" decoding="async" />
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

      {/* Abas Premium Selector */}
      <div className="rankings-tabs-container animate-fade-in">
        <div className="rankings-tabs glass">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'scorers' ? 'active gold' : ''}`}
            onClick={() => setActiveTab('scorers')}
          >
            <Trophy size={16} />
            <span>Artilharia</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'participation' ? 'active gold' : ''}`}
            onClick={() => setActiveTab('participation')}
          >
            <Zap size={16} />
            <span>Participações (G.A)</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'assistants' ? 'active blue' : ''}`}
            onClick={() => setActiveTab('assistants')}
          >
            <Zap size={16} style={{ transform: 'rotate(15deg)' }} />
            <span>Assistências</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'goalkeepers' ? 'active green' : ''}`}
            onClick={() => setActiveTab('goalkeepers')}
          >
            <ShieldAlert size={16} />
            <span>Luva de Ouro</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'disciplined' ? 'active red' : ''}`}
            onClick={() => setActiveTab('disciplined')}
          >
            <ShieldAlert size={16} />
            <span>Disciplina</span>
          </button>
        </div>
      </div>

      <div className="rankings-active-panel-wrapper">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rankings-single-grid"
        >
          {activeTab === 'scorers' && (
            <section className="rank-panel glass active-full-panel">
              <div className="panel-header">
                <Trophy size={20} color="#facc15" />
                <h3>Artilharia do Torneio</h3>
              </div>
              <div className="rank-rows">
                {visibleScorers.map((p, i) => (
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
                          decoding="async"
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
                              decoding="async"
                            />
                          )}
                          <span>{p.team_name}</span>
                        </div>
                      </div>
                    </div>
                    <div className="rank-val">{p.goals_count} G</div>
                    {authRole === 'admin' && (
                      <button
                        type="button"
                        className="rank-row-download-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadRankingCard(
                            `scorers-${p.id}`,
                            p,
                            'Artilharia',
                            'Top goleadores da Copa Unasp',
                            'gold',
                            [
                              { label: 'Posicao', value: `${i + 1}o` },
                              { label: 'Gols', value: p.goals_count || 0 },
                              { label: 'Assistencias', value: p.assists || 0 },
                            ],
                          );
                        }}
                        disabled={downloadingCardKey === `scorers-${p.id}`}
                        aria-label={`Baixar card de ${p.name}`}
                      >
                        <Download size={14} />
                        <span>{downloadingCardKey === `scorers-${p.id}` ? 'Gerando...' : 'Card'}</span>
                      </button>
                    )}
                  </div>
                ))}
                {visibleScorers.length === 0 && <p className="empty-rank">{searchTerm ? 'Nenhum atleta encontrado neste ranking.' : 'Nenhum gol registrado.'}</p>}
              </div>
            </section>
          )}

          {activeTab === 'participation' && (
            <section className="rank-panel glass highlighted-gold active-full-panel">
              <div className="panel-header">
                <Zap size={20} color="#facc15" />
                <h3>Participações em Gols (G.A)</h3>
              </div>
              <div className="rank-rows">
                {visibleParticipation.map((p, i) => (
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
                          decoding="async"
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
                              decoding="async"
                            />
                          )}
                          <span>{p.team_name}</span>
                        </div>
                      </div>
                    </div>
                    <div className="rank-val" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                      <strong style={{ color: 'var(--secondary)', fontSize: '1.05rem' }}>{(p as any).goals_and_assists} G.A</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.goals_count || 0} G + {p.assists || 0} A</span>
                    </div>
                    {authRole === 'admin' && (
                      <button
                        type="button"
                        className="rank-row-download-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadRankingCard(
                            `participation-${p.id}`,
                            p,
                            'Participações (G.A)',
                            'Gols e Assistências da Copa Unasp',
                            'gold',
                            [
                              { label: 'Posicao', value: `${i + 1}o` },
                              { label: 'G.A', value: (p as any).goals_and_assists || 0 },
                              { label: 'Gols', value: p.goals_count || 0 },
                              { label: 'Assistencias', value: p.assists || 0 },
                            ],
                          );
                        }}
                        disabled={downloadingCardKey === `participation-${p.id}`}
                        aria-label={`Baixar card de ${p.name}`}
                      >
                        <Download size={14} />
                        <span>{downloadingCardKey === `participation-${p.id}` ? 'Gerando...' : 'Card'}</span>
                      </button>
                    )}
                  </div>
                ))}
                {visibleParticipation.length === 0 && <p className="empty-rank">{searchTerm ? 'Nenhum atleta encontrado neste ranking.' : 'Aguardando estatísticas...'}</p>}
              </div>
            </section>
          )}

          {activeTab === 'goalkeepers' && (
            <section className="rank-panel glass highlighted-gold active-full-panel" style={{ borderColor: 'rgba(34, 197, 94, 0.3)', background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(17, 25, 40, 0.95))' }}>
              <div className="panel-header">
                <ShieldAlert size={20} color="#22c55e" />
                <h3>Luva de Ouro</h3>
              </div>
              <div className="rank-rows">
                {visibleGoalkeepers.map((p, i) => (
                  <div key={p.id} className="rank-row-item glass-hover" onClick={() => setSelectedPlayer(p)}>
                    <div className="rank-idx">{i + 1}º</div>
                    <div className="rank-avatar">
                       {p.photo_url ? <img src={p.photo_url} alt={p.name} loading="lazy" decoding="async" /> : <div className="avatar-dummy"><User size={14} /></div>}
                    </div>
                    <div className="rank-player">
                       <div className="player-name-wrapper">
                         <strong>{p.name}</strong>
                         <div className="team-mini-info">
                            {p.team_badge_url && <img src={p.team_badge_url} alt="" className="mini-badge" loading="lazy" decoding="async" />}
                            <span>{p.team_name}</span>
                         </div>
                       </div>
                    </div>
                    <div className="rank-val">{p.goals_conceded || 0} Gols Sofridos</div>
                    {authRole === 'admin' && (
                      <button
                        type="button"
                        className="rank-row-download-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadRankingCard(
                            `goalkeepers-${p.id}`,
                            p,
                            'Luva de Ouro',
                            'Ranking de goleiros da Copa Unasp',
                            'green',
                            [
                              { label: 'Posicao', value: `${i + 1}o` },
                              { label: 'Gols Sofridos', value: p.goals_conceded || 0 },
                            { label: 'Jogos Zerados', value: p.clean_sheets || 0 },
                            ],
                          );
                        }}
                        disabled={downloadingCardKey === `goalkeepers-${p.id}`}
                        aria-label={`Baixar card de ${p.name}`}
                      >
                        <Download size={14} />
                        <span>{downloadingCardKey === `goalkeepers-${p.id}` ? 'Gerando...' : 'Card'}</span>
                      </button>
                    )}
                  </div>
                ))}
                {visibleGoalkeepers.length === 0 && <p className="empty-rank">{searchTerm ? 'Nenhum atleta encontrado neste ranking.' : 'Aguardando súmulas...'}</p>}
              </div>
            </section>
          )}

          {activeTab === 'assistants' && (
            <section className="rank-panel glass active-full-panel" style={{ borderColor: 'rgba(59, 130, 246, 0.3)', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(17, 25, 40, 0.95))' }}>
              <div className="panel-header">
                <Zap size={20} color="var(--accent-blue)" />
                <h3>Assistências da Copa</h3>
              </div>
              <div className="rank-rows">
                {visibleAssistants.map((p, i) => (
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
                          decoding="async"
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
                              decoding="async"
                            />
                          )}
                          <span>{p.team_name}</span>
                        </div>
                      </div>
                    </div>
                    <div className="rank-val">{p.assists} ASS</div>
                    {authRole === 'admin' && (
                      <button
                        type="button"
                        className="rank-row-download-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadRankingCard(
                            `assistants-${p.id}`,
                            p,
                            'Rei das Assistencias',
                            'Top criadores de jogada da Copa Unasp',
                            'blue',
                            [
                              { label: 'Posicao', value: `${i + 1}o` },
                              { label: 'Assistencias', value: p.assists || 0 },
                              { label: 'Gols', value: p.goals_count || 0 },
                            ],
                          );
                        }}
                        disabled={downloadingCardKey === `assistants-${p.id}`}
                        aria-label={`Baixar card de ${p.name}`}
                      >
                        <Download size={14} />
                        <span>{downloadingCardKey === `assistants-${p.id}` ? 'Gerando...' : 'Card'}</span>
                      </button>
                    )}
                  </div>
                ))}
                {visibleAssistants.length === 0 && <p className="empty-rank">{searchTerm ? 'Nenhum atleta encontrado neste ranking.' : 'Nenhuma assistência.'}</p>}
              </div>
            </section>
          )}

          {activeTab === 'disciplined' && (
            <section className="rank-panel glass active-full-panel" style={{ borderColor: 'rgba(239, 68, 68, 0.3)', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(17, 25, 40, 0.95))' }}>
              <div className="panel-header">
                <ShieldAlert size={20} color="var(--primary)" />
                <h3>Mais Cartões (Top 20)</h3>
              </div>
              <div className="rank-rows">
                {visibleDisciplined.map((p, i) => (
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
                          decoding="async"
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
                              decoding="async"
                            />
                          )}
                          <span>{p.team_name}</span>
                        </div>
                      </div>
                    </div>
                    
                    {(() => {
                      const susp = getPendingSuspension(p);
                      return susp.isSuspended ? (
                        <div className="rank-suspension-badge" title={`${susp.pendingGames} jogo(s) de suspensão`}>
                          SUSPENSO
                        </div>
                      ) : null;
                    })()}
                    <div className="rank-cards">
                      <span className="p-card-new yellow">{p.yellow_cards || 0}</span>
                      <span className="p-card-new red">{p.red_cards || 0}</span>
                    </div>
                    <div className="rank-val">{(p.yellow_cards || 0) + (p.red_cards || 0)} cartões</div>
                    {authRole === 'admin' && (
                      <button
                        type="button"
                        className="rank-row-download-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadRankingCard(
                            `discipline-${p.id}`,
                            p,
                            'Mais Cartões',
                            'Ranking de cartões da Copa Unasp',
                            'red',
                            [
                              { label: 'Posicao', value: `${i + 1}o` },
                              { label: 'Cartoes', value: (p.yellow_cards || 0) + (p.red_cards || 0) },
                              { label: 'Amarelos', value: p.yellow_cards || 0 },
                              { label: 'Vermelhos', value: p.red_cards || 0 },
                            ],
                          );
                        }}
                        disabled={downloadingCardKey === `discipline-${p.id}`}
                        aria-label={`Baixar card de ${p.name}`}
                      >
                        <Download size={14} />
                        <span>{downloadingCardKey === `discipline-${p.id}` ? 'Gerando...' : 'Card'}</span>
                      </button>
                    )}
                  </div>
                ))}
                {visibleDisciplined.length === 0 && <p className="empty-rank">{searchTerm ? 'Nenhum atleta encontrado neste ranking.' : 'Sem dados de cartões.'}</p>}
              </div>
            </section>
          )}
        </motion.div>
      </div>

      <PlayerProfileModal 
        player={selectedPlayer} 
        onClose={() => setSelectedPlayer(null)} 
      />
      </div>
    </div>
  );
};

export default Rankings;
