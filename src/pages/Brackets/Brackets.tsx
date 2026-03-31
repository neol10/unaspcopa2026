import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatches, Match } from '../../hooks/useMatches';
import { useTournamentConfig } from '../../hooks/useTournamentConfig';
import { Trophy, Timer, ChevronRight, ChevronLeft, Target } from 'lucide-react';
import './Brackets.css';

const Brackets: React.FC = () => {
  const { matches, loading, error, refresh } = useMatches();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const dragMovedRef = useRef(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'live' | 'today' | 'favorite'>('all');
  const [favoriteTeamId, setFavoriteTeamId] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  const { config } = useTournamentConfig();
  const [hasScrolled, setHasScrolled] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'teia'>('list');

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('copa_unasp_push_preferences_v1');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { favoriteTeamId?: string | null };
      setFavoriteTeamId(parsed.favoriteTeamId || null);
    } catch {
      setFavoriteTeamId(null);
    }
  }, []);

  useEffect(() => {
    if (!loading) {
      setStuck(false);
      return;
    }
    const id = setTimeout(() => setStuck(true), 15000);
    return () => clearTimeout(id);
  }, [loading]);

  const filteredMatches = useMemo(() => {
    if (activeFilter === 'all') return matches;

    if (activeFilter === 'live') {
      return matches.filter((m) => m.status === 'ao_vivo');
    }

    if (activeFilter === 'today') {
      return matches.filter((m) => {
        const date = new Date(m.match_date);
        const now = new Date();
        return date.toDateString() === now.toDateString();
      });
    }

    if (activeFilter === 'favorite' && favoriteTeamId) {
      return matches.filter((m) => m.team_a_id === favoriteTeamId || m.team_b_id === favoriteTeamId);
    }

    return matches;
  }, [activeFilter, favoriteTeamId, matches]);

  const sortMatches = useCallback((list: Match[]) => {
    const statusRank = (status: Match['status']) => {
      if (status === 'ao_vivo') return 0;
      if (status === 'agendado') return 1;
      return 2;
    };

    return [...list].sort((a, b) => {
      const rankDiff = statusRank(a.status) - statusRank(b.status);
      if (rankDiff !== 0) return rankDiff;
      return new Date(a.match_date).getTime() - new Date(b.match_date).getTime();
    });
  }, []);

  // Agrupa partidas por 'round' dinamicamente - MEMOIZED
  const roundsMap = useMemo(() => {
    return filteredMatches.reduce((acc, m) => {
      const roundName = String(m.round || 'Rodada Geral');
      if (!acc[roundName]) acc[roundName] = [];
      acc[roundName].push(m);
      return acc;
    }, {} as Record<string, Match[]>);
  }, [filteredMatches]);

  const sortedRounds = useMemo(() => {
    return Object.keys(roundsMap).sort((a, b) => {
      const dateA = new Date(roundsMap[a][0].match_date).getTime();
      const dateB = new Date(roundsMap[b][0].match_date).getTime();
      return dateA - dateB;
    });
  }, [roundsMap]);

  // Auto-scroll para a rodada atual
  useEffect(() => {
    if (!loading && matches.length > 0 && config && !hasScrolled) {
      const timer = setTimeout(() => {
        let targetId = '';
        if (config.current_phase === 'grupos') {
          targetId = `phase-${config.current_round}`;
        } else {
          // Busca nos rounds carregados um que contenha a fase atual
          const targetRound = sortedRounds.find(r => 
            r.toLowerCase().includes(config.current_phase.toLowerCase()) ||
            (config.current_phase === 'semifinal' && r.toLowerCase().includes('semi'))
          );
          if (targetRound) {
            targetId = `phase-${targetRound.toLowerCase().replace(/\s+/g, '-')}`;
          }
        }

        if (targetId) {
          scrollToPhase(targetId);
          setHasScrolled(true);
        }
      }, 500); 
      return () => clearTimeout(timer);
    }
  }, [loading, matches, config, hasScrolled, sortedRounds]);

  const formatRoundName = (name: string) => {
    if (/^\d+$/.test(name)) return `${name}ª Rodada`;
    if (name.toLowerCase().includes('rodada')) return name;
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  // Distinguir entre Fase de Grupos e Mata-Mata - MEMOIZED
  const finalPhases = useMemo(() => ['quartas', 'semis', 'semi', 'final', 'decisão', 'terceiro'], []);
  
  const knockoutRounds = useMemo(() => {
    return sortedRounds.filter(r => 
      finalPhases.some(p => r.toLowerCase().includes(p))
    );
  }, [sortedRounds, finalPhases]);

  const groupRounds = useMemo(() => {
    return sortedRounds.filter(r => !knockoutRounds.includes(r));
  }, [sortedRounds, knockoutRounds]);

  // Função auxiliar para encontrar fases de mata-mata de forma robusta
  const findKnockoutRound = useCallback((keyword: string, matchCount: number) => {
    // 1. Tenta por nome (case insensitive)
    const byName = knockoutRounds.find(r => r.toLowerCase().includes(keyword.toLowerCase()));
    if (byName) return byName;

    // 2. Tenta por contagem de jogos (ex: 4 jogos = quartas)
    const byCount = knockoutRounds.find(r => roundsMap[r]?.length === matchCount);
    if (byCount) return byCount;

    // 3. Fallback: Se for a final e tiver apenas 1 rodada no knockout
    if (keyword === 'final' && knockoutRounds.length > 0) return knockoutRounds[knockoutRounds.length - 1];

    return '';
  }, [knockoutRounds, roundsMap]);

  const teiaRounds = useMemo(() => ({
    quartas: findKnockoutRound('quartas', 4),
    semis: findKnockoutRound('semi', 2),
    final: findKnockoutRound('final', 1)
  }), [findKnockoutRound]);

  // Lógica de Mouse Drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsPointerDown(true);
    setIsDragging(false);
    dragMovedRef.current = false;
    startXRef.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeftRef.current = scrollRef.current.scrollLeft;
  };

  const handleDragEnd = () => {
    setIsPointerDown(false);
    setIsDragging(false);
    if (dragMovedRef.current) {
      window.setTimeout(() => {
        dragMovedRef.current = false;
      }, 0);
    } else {
      dragMovedRef.current = false;
    }
  };

  const handleDragMove = (pageX: number) => {
    if (!isPointerDown || !scrollRef.current) return;
    const x = pageX - scrollRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 2;
    scrollRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPointerDown || !scrollRef.current) return;
    const x = e.pageX - scrollRef.current.offsetLeft;
    const delta = x - startXRef.current;
    const exceededThreshold = Math.abs(delta) > 6;
    if (exceededThreshold && !dragMovedRef.current) {
      dragMovedRef.current = true;
    }
    if (exceededThreshold && !isDragging) {
      setIsDragging(true);
    }

    if (exceededThreshold) {
      e.preventDefault();
      handleDragMove(e.pageX);
    }
  };

  const scrollToPhase = (phase: string) => {
    const element = document.getElementById(`phase-${phase.toLowerCase().replace(/\s+/g, '-')}`);
    if (element && scrollRef.current) {
      const container = scrollRef.current;
      const offset = element.offsetLeft - 64; 
      container.scrollTo({ left: offset, behavior: 'smooth' });
    }
  };

  const MatchSkeleton = () => (
    <div className="match-skeleton">
      <div className="skeleton-item skeleton-date"></div>
      <div className="skeleton-row">
        <div className="skeleton-team">
          <div className="skeleton-item skeleton-badge"></div>
          <div className="skeleton-item skeleton-name"></div>
        </div>
        <div className="skeleton-item skeleton-score"></div>
      </div>
      <div className="skeleton-row">
        <div className="skeleton-team">
          <div className="skeleton-item skeleton-badge"></div>
          <div className="skeleton-item skeleton-name"></div>
        </div>
        <div className="skeleton-item skeleton-score"></div>
      </div>
    </div>
  );

  const RoundSkeleton = () => (
    <div className="bracket-round">
      <div className="skeleton-item" style={{ height: '24px', width: '60%', marginBottom: '1rem' }}></div>
      <div className="round-matches">
        {[1, 2, 3, 4].map(i => <MatchSkeleton key={i} />)}
      </div>
    </div>
  );

  const getCountdownLabel = (matchDate: string) => {
    const diff = new Date(matchDate).getTime() - nowTs;
    if (diff <= 0) return 'Começa agora';
    const totalMinutes = Math.floor(diff / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `Começa em ${hours}h ${minutes}m`;
    return `Começa em ${minutes}m`;
  };

  const getLiveMinutes = (match: Match) => {
    if (!match.timer_started_at) return Math.floor((match.timer_offset_seconds || 0) / 60);
    const start = new Date(match.timer_started_at).getTime();
    const diff = Math.max(0, Math.floor((nowTs - start) / 1000));
    const totalSeconds = (match.timer_offset_seconds || 0) + diff;
    return Math.floor(totalSeconds / 60);
  };

  const MatchBox: React.FC<{ match: Match; isKnockout?: boolean }> = ({ match, isKnockout }) => {
    const isTeamAWinner = match.status === 'finalizado' && match.team_a_score > match.team_b_score;
    const isTeamBWinner = match.status === 'finalizado' && match.team_b_score > match.team_a_score;
    const liveMinutes = match.status === 'ao_vivo' ? getLiveMinutes(match) : null;
    const countdown = match.status === 'agendado' ? getCountdownLabel(match.match_date) : null;

    const getStatusLabel = () => {
      if (match.status === 'ao_vivo') return <span className="live-badge-mini">AO VIVO</span>;
      if (match.status === 'finalizado') return <span className="finished-label">FIM</span>;
      return <span className="scheduled-label">PREVISTO</span>;
    };

    const openMatch = () => {
      if (dragMovedRef.current) return;
      navigate(`/central-da-partida?id=${match.id}`);
    };

    return (
      <div
        className={`bracket-match ${isKnockout ? 'knockout-item' : ''}`}
        onClick={openMatch}
        role="button"
        tabIndex={0}
        aria-label={`Abrir partida ${match.teams_a?.name || 'Equipe A'} x ${match.teams_b?.name || 'Equipe B'}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openMatch();
          }
        }}
      >
        <div className="match-box glass clickable-match">
          <div className={`match-status-bar status-${match.status}`}></div>
          <div className="match-header-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem', alignItems: 'center' }}>
            <div className="match-time-tiny" style={{ marginBottom: 0 }}>
              {new Date(match.match_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} • {new Date(match.match_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
            {getStatusLabel()}
          </div>

          <div className="match-preview">
            <span className="match-meta">{match.location || 'Local a definir'}</span>
            <span className="match-meta">{match.status === 'agendado' && countdown ? countdown : match.status === 'ao_vivo' && liveMinutes !== null ? `${liveMinutes}' em andamento` : 'Partida encerrada'}</span>
          </div>

          <div className="match-mini-timeline">
            {match.status === 'ao_vivo' && (
              <>
                <span className="timeline-chip live">AO VIVO</span>
                <span className="timeline-chip">Min {liveMinutes ?? 0}</span>
              </>
            )}
            {match.status === 'agendado' && countdown && (
              <>
                <span className="timeline-chip soon">EM BREVE</span>
                <span className="timeline-chip subtle">{countdown}</span>
              </>
            )}
            {match.status === 'finalizado' && (
              <>
                <span className="timeline-chip final">ENCERRADO</span>
                <span className="timeline-chip subtle">Placar final</span>
              </>
            )}
          </div>
          
          <div className={`match-team ${isTeamAWinner ? 'winner' : ''}`}>
            <div className="team-info">
              {match.teams_a?.badge_url ? (
                <img 
                  src={match.teams_a.badge_url} 
                  alt="" 
                  className="team-badge-mini" 
                  width="28" 
                  height="28" 
                  loading="lazy" 
                />
              ) : <div className="team-badge-mini" style={{width: 28, height: 28, background: 'rgba(255,255,255,0.05)', borderRadius: '50%'}}></div>}
              <span>{match.teams_a?.name || 'A definir'}</span>
            </div>
            <div className="team-score">{match.status !== 'agendado' ? match.team_a_score : '-'}</div>
          </div>
          
          <div className={`match-team ${isTeamBWinner ? 'winner' : ''}`}>
            <div className="team-info">
              {match.teams_b?.badge_url ? (
                <img 
                  src={match.teams_b.badge_url} 
                  alt="" 
                  className="team-badge-mini" 
                  width="28" 
                  height="28" 
                  loading="lazy" 
                />
              ) : <div className="team-badge-mini" style={{width: 28, height: 28, background: 'rgba(255,255,255,0.05)', borderRadius: '50%'}}></div>}
              <span>{match.teams_b?.name || 'A definir'}</span>
            </div>
            <div className="team-score">{match.status !== 'agendado' ? match.team_b_score : '-'}</div>
          </div>
        </div>
        {isKnockout && <div className="bracket-connectors"></div>}
      </div>
    );
  };

  if ((stuck || (!navigator.onLine && loading)) && matches.length === 0) {
    return (
      <div className="error-state glass" style={{ margin: '2rem auto', maxWidth: 720 }}>
        <p style={{ marginBottom: '0.75rem' }}>
          {!navigator.onLine
            ? 'Sem conexão no momento. Os jogos vão carregar assim que a internet voltar.'
            : 'Demorou muito para carregar os jogos.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refresh()}>
            Tentar novamente
          </button>
          <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => window.location.reload()}>
            Recarregar página
          </button>
        </div>
      </div>
    );
  }

  if (loading && matches.length === 0) {
    return (
      <div className="brackets-page animate-fade-in">
        <div className="brackets-showlights" aria-hidden="true"></div>
        <header className="brackets-header">
          <div className="header-icon-box">
             <Trophy size={32} color="var(--secondary)" />
          </div>
          <h1 className="text-gradient uppercase">Tabela do Torneio</h1>
          <p className="text-muted">Acompanhe o caminho rumo ao título</p>
        </header>
        <div className="brackets-scroll-container">
          <div className="brackets-scroll-content">
            {[1, 2, 3].map(i => <RoundSkeleton key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (error && matches.length === 0) {
    return (
      <div className="error-state glass" style={{ margin: '2rem auto', maxWidth: 720 }}>
        <p style={{ marginBottom: '0.75rem' }}>Erro ao carregar jogos: {error}</p>
        <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refresh()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="brackets-page animate-fade-in">
      <div className="brackets-showlights" aria-hidden="true"></div>
      <header className="brackets-header">
        <div className="header-icon-box">
          <Trophy size={32} color="var(--secondary)" />
        </div>
        <h1 className="text-gradient uppercase">Tabela do Torneio</h1>
        <p className="text-muted">Acompanhe o caminho rumo ao título</p>
      </header>

      <div className="view-mode-selector glass">
        <button 
          className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
          onClick={() => setViewMode('list')}
        >
          <Timer size={16} /> Lista de Rodadas
        </button>
        <button 
          className={`view-btn ${viewMode === 'teia' ? 'active' : ''}`}
          onClick={() => setViewMode('teia')}
        >
          <Trophy size={16} /> Chaveamento (Teia)
        </button>
      </div>

      <div className="match-filters">
        <button
          className={`filter-chip ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
          type="button"
          aria-pressed={activeFilter === 'all'}
        >
          Todos
        </button>
        <button
          className={`filter-chip ${activeFilter === 'live' ? 'active' : ''}`}
          onClick={() => setActiveFilter('live')}
          type="button"
          aria-pressed={activeFilter === 'live'}
        >
          Ao vivo
        </button>
        <button
          className={`filter-chip ${activeFilter === 'today' ? 'active' : ''}`}
          onClick={() => setActiveFilter('today')}
          type="button"
          aria-pressed={activeFilter === 'today'}
        >
          Hoje
        </button>
        <button
          className={`filter-chip ${activeFilter === 'favorite' ? 'active' : ''}`}
          onClick={() => favoriteTeamId && setActiveFilter('favorite')}
          disabled={!favoriteTeamId}
          title={favoriteTeamId ? 'Filtrar pelo time favorito' : 'Defina um time favorito em Preferências de Alertas'}
          type="button"
          aria-pressed={activeFilter === 'favorite'}
        >
          Meu time
        </button>
      </div>

      {knockoutRounds.length > 0 && viewMode === 'list' && (
        <div className="phase-jump-nav glass">
          {knockoutRounds.map(r => (
            <button key={r} onClick={() => scrollToPhase(r)} className="jump-btn">
              {r}
            </button>
          ))}
          {groupRounds.length > 0 && (
             <button onClick={() => {
                if (scrollRef.current) scrollRef.current.scrollTo({ left: 3000, behavior: 'smooth' });
             }} className="jump-btn">
                Fase Grupos
             </button>
          )}
        </div>
      )}

      {sortedRounds.length > 0 && viewMode === 'list' && (
        <div className="scroll-hint">
          <ChevronLeft size={16} /> Arraste para navegar <ChevronRight size={16} />
        </div>
      )}

      <div 
        className={`brackets-scroll-container ${isDragging ? 'dragging' : ''} mode-${viewMode}`}
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleDragEnd}
        onMouseUp={handleDragEnd}
        onMouseMove={handleMouseMove}
      >
        <div className="brackets-scroll-content">
          {viewMode === 'teia' ? (
            /* Layout de Chaveamento Simétrico (Modo Teia) */
            <div className="teia-bracket-wrapper">
              <section className="teia-section-header">
                <h2 className="section-title"><Trophy size={20} /> Mata-Mata</h2>
              </section>
              
              <div className="teia-layout">
                {/* Lado Esquerdo: Quartas 1 e 2 + Semi 1 */}
                <div className="teia-side side-left">
                  <div className="teia-column col-quarters">
                    {roundsMap[teiaRounds.quartas]?.slice(0, 2).map(m => (
                      <MatchBox key={m.id} match={m} isKnockout />
                    ))}
                  </div>
                  <div className="teia-column col-semis">
                    {roundsMap[teiaRounds.semis]?.slice(0, 1).map(m => (
                      <MatchBox key={m.id} match={m} isKnockout />
                    ))}
                  </div>
                </div>

                {/* Centro: Final */}
                <div className="teia-center">
                  <div className="teia-column col-final">
                    <div className="final-label">GRANDE FINAL</div>
                    {roundsMap[teiaRounds.final]?.slice(0, 1).map(m => (
                      <MatchBox key={m.id} match={m} isKnockout />
                    ))}
                    <div className="trophy-glow-bg"></div>
                  </div>
                </div>

                {/* Lado Direito: Semi 2 + Quartas 3 e 4 */}
                <div className="teia-side side-right">
                  <div className="teia-column col-semis">
                    {roundsMap[teiaRounds.semis]?.slice(1, 2).map(m => (
                      <MatchBox key={m.id} match={m} isKnockout />
                    ))}
                  </div>
                  <div className="teia-column col-quarters">
                    {roundsMap[teiaRounds.quartas]?.slice(2, 4).map(m => (
                      <MatchBox key={m.id} match={m} isKnockout />
                    ))}
                  </div>
                </div>
              </div>

              {/* Fase de Grupos integrada no Modo Teia */}
              {groupRounds.length > 0 && (
                <div className="teia-groups-section">
                  <section className="teia-section-header">
                    <h2 className="section-title"><Timer size={22} /> Fase de Grupos</h2>
                  </section>
                  <div className="teia-groups-grid">
                    {groupRounds.map((roundName) => (
                      <div key={roundName} className="bracket-round">
                        <h3 className="round-title">
                          <span className="round-dot"></span>
                          <span className="round-chip">{formatRoundName(roundName)}</span>
                        </h3>
                        <div className="round-matches">
                          {roundsMap[roundName].map(m => (
                            <MatchBox key={m.id} match={m} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Layout de Lista de Rodadas (Padrão) */
            <div className="list-layout-wrapper">
              {/* Seção Mata-Mata */}
              {knockoutRounds.length > 0 && (
                <section className="bracket-section knockout-list">
                  <h2 className="section-title"><Trophy size={18} /> Mata-Mata</h2>
                  <div className="section-content-row">
                    {knockoutRounds.map((roundName) => {
                      const isCurrent = config.current_phase !== 'grupos' && (
                        roundName.toLowerCase().includes(config.current_phase.toLowerCase()) ||
                        (config.current_phase === 'semifinal' && roundName.toLowerCase().includes('semi'))
                      );
                      return (
                        <div 
                          key={roundName} 
                          id={`phase-${roundName.toLowerCase().replace(/\s+/g, '-')}`}
                          className={`knockout-column phase-${roundName.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          <h3 className="round-title knockout-title">
                            <span className="round-dot"></span>
                            <span className="round-chip">{roundName}</span>
                            {isCurrent && <span className="current-label"><Target size={12} /> Atual</span>}
                          </h3>
                          <div className="round-matches knockout-matches">
                            {sortMatches(roundsMap[roundName]).map(m => (
                              <MatchBox key={m.id} match={m} isKnockout />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Seção Fase de Grupos */}
              {groupRounds.length > 0 && (
                <section className="bracket-section group-stage-list">
                  <h2 className="section-title"><Timer size={18} /> Fase de Grupos</h2>
                  <div className="section-content-row">
                    {groupRounds.map((roundName) => {
                      const isCurrent = config.current_phase === 'grupos' && String(config.current_round) === roundName;
                      return (
                        <div 
                          key={roundName} 
                          id={`phase-${roundName.toLowerCase().replace(/\s+/g, '-')}`}
                          className="bracket-round"
                        >
                          <h3 className="round-title">
                            <span className="round-dot"></span>
                            <span className="round-chip">{formatRoundName(roundName)}</span>
                            {isCurrent && <span className="current-label"><Target size={12} /> Atual</span>}
                          </h3>
                          <div className="round-matches">
                            {roundsMap[roundName].map(m => (
                              <MatchBox key={m.id} match={m} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
          
          {sortedRounds.length === 0 && (
            <div className="empty-matches">
              <Target size={32} className="icon-dim" />
              <p>Nenhuma partida cadastrada ainda.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Brackets;
