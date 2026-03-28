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
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [activeFilter, setActiveFilter] = useState<'all' | 'live' | 'today' | 'favorite'>('all');
  const [favoriteTeamId, setFavoriteTeamId] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  const { config } = useTournamentConfig();
  const [hasScrolled, setHasScrolled] = useState(false);

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

  // Lógica de Mouse Drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleDragEnd = () => setIsDragging(false);

  const handleDragMove = (pageX: number) => {
    if (!isDragging || !scrollRef.current) return;
    const x = pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
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

    return (
      <div className={`bracket-match ${isKnockout ? 'knockout-item' : ''}`}>
        <div 
          className="match-box glass clickable-match"
          onClick={() => navigate(`/central-da-partida?id=${match.id}`)}
        >
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
                <span className="timeline-chip">EM BREVE</span>
                <span className="timeline-chip">{countdown}</span>
              </>
            )}
            {match.status === 'finalizado' && (
              <>
                <span className="timeline-chip">ENCERRADO</span>
                <span className="timeline-chip">Placar final</span>
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

      <div className="match-filters">
        <button
          className={`filter-chip ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          Todos
        </button>
        <button
          className={`filter-chip ${activeFilter === 'live' ? 'active' : ''}`}
          onClick={() => setActiveFilter('live')}
        >
          Ao vivo
        </button>
        <button
          className={`filter-chip ${activeFilter === 'today' ? 'active' : ''}`}
          onClick={() => setActiveFilter('today')}
        >
          Hoje
        </button>
        <button
          className={`filter-chip ${activeFilter === 'favorite' ? 'active' : ''}`}
          onClick={() => favoriteTeamId && setActiveFilter('favorite')}
          disabled={!favoriteTeamId}
          title={favoriteTeamId ? 'Filtrar pelo time favorito' : 'Defina um time favorito em Preferências de Alertas'}
        >
          Meu time
        </button>
      </div>

      {knockoutRounds.length > 0 && (
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
                Geral
             </button>
          )}
        </div>
      )}

      {sortedRounds.length > 0 && (
        <div className="scroll-hint">
          <ChevronLeft size={16} /> Arraste para navegar <ChevronRight size={16} />
        </div>
      )}

      <div 
        className={`brackets-scroll-container ${isDragging ? 'dragging' : ''}`}
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleDragEnd}
        onMouseUp={handleDragEnd}
        onMouseMove={handleMouseMove}
      >
        <div className="brackets-scroll-content">
          {/* Seção Mata-Mata (Tree Layout) */}
          {knockoutRounds.length > 0 && (
            <div className="knockout-tree-container">
              <div className="knockout-columns">
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
                        {roundName}
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
            </div>
          )}

          {/* Seção Fase de Grupos */}
          {groupRounds.length > 0 && (
            <div className="group-stage-container">
              <div className="group-rounds">
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
                        {formatRoundName(roundName)}
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
