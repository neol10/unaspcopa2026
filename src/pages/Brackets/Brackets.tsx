import React, { useEffect, useRef, useState } from 'react';
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

  const { config } = useTournamentConfig();
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    if (!loading) {
      setStuck(false);
      return;
    }
    const id = setTimeout(() => setStuck(true), 15000);
    return () => clearTimeout(id);
  }, [loading]);

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
      }, 500); // Pequeno delay para garantir que o DOM renderizou
      return () => clearTimeout(timer);
    }
  }, [loading, matches, config, hasScrolled]);

  const formatRoundName = (name: string) => {
    if (/^\d+$/.test(name)) return `${name}ª Rodada`;
    if (name.toLowerCase().includes('rodada')) return name;
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  // Agrupa partidas por 'round' dinamicamente
  const roundsMap = matches.reduce((acc, m) => {
    const roundName = String(m.round || 'Rodada Geral');
    if (!acc[roundName]) acc[roundName] = [];
    acc[roundName].push(m);
    return acc;
  }, {} as Record<string, Match[]>);

  const sortedRounds = Object.keys(roundsMap).sort((a, b) => {
    const dateA = new Date(roundsMap[a][0].match_date).getTime();
    const dateB = new Date(roundsMap[b][0].match_date).getTime();
    return dateA - dateB;
  });

  // Distinguir entre Fase de Grupos e Mata-Mata
  const finalPhases = ['quartas', 'semis', 'semi', 'final', 'decisão', 'terceiro'];
  const knockoutRounds = sortedRounds.filter(r => 
    finalPhases.some(p => r.toLowerCase().includes(p))
  );
  const groupRounds = sortedRounds.filter(r => !knockoutRounds.includes(r));

  // Lógica de Mouse Drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  // Lógica de Touch Drag
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.touches[0].pageX - scrollRef.current.offsetLeft);
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

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging) {
      handleDragMove(e.touches[0].pageX);
    }
  };

  const scrollToPhase = (phase: string) => {
    const element = document.getElementById(`phase-${phase.toLowerCase().replace(/\s+/g, '-')}`);
    if (element && scrollRef.current) {
      const container = scrollRef.current;
      const offset = element.offsetLeft - 64; // Adjust for padding
      container.scrollTo({ left: offset, behavior: 'smooth' });
    }
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

  if (loading && matches.length === 0) return <div className="loading-state">Carregando Jogos...</div>;

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

  const MatchBox: React.FC<{ match: Match; isKnockout?: boolean }> = ({ match, isKnockout }) => {
    const isTeamAWinner = match.status === 'finalizado' && match.team_a_score > match.team_b_score;
    const isTeamBWinner = match.status === 'finalizado' && match.team_b_score > match.team_a_score;

    return (
      <div className={`bracket-match ${isKnockout ? 'knockout-item' : ''}`}>
        <div 
          className="match-box glass clickable-match"
          onClick={() => navigate(`/central-da-partida?id=${match.id}`)}
        >
          <div className="match-time-tiny">
            {new Date(match.match_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} • {new Date(match.match_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className={`match-team ${isTeamAWinner ? 'winner' : ''}`}>
            <div className="team-info">
              {match.teams_a?.badge_url && (
                <img 
                  src={match.teams_a.badge_url} 
                  alt="" 
                  className="team-badge-mini" 
                  width="16" 
                  height="16" 
                  loading="lazy" 
                />
              )}
              <span>{match.teams_a?.name || 'A definir'}</span>
            </div>
            <div className="team-score">{match.status !== 'agendado' ? match.team_a_score : '-'}</div>
          </div>
          <div className={`match-team ${isTeamBWinner ? 'winner' : ''}`}>
            <div className="team-info">
              {match.teams_b?.badge_url && (
                <img 
                  src={match.teams_b.badge_url} 
                  alt="" 
                  className="team-badge-mini" 
                  width="16" 
                  height="16" 
                  loading="lazy" 
                />
              )}
              <span>{match.teams_b?.name || 'A definir'}</span>
            </div>
            <div className="team-score">{match.status !== 'agendado' ? match.team_b_score : '-'}</div>
          </div>
          {match.status === 'ao_vivo' && <div className="live-badge-mini">AO VIVO</div>}
        </div>
        {isKnockout && <div className="bracket-connectors"></div>}
      </div>
    );
  };

  return (
    <div className="brackets-page animate-fade-in">
      <header className="brackets-header">
        <div className="header-icon-box">
          <Trophy size={32} color="var(--secondary)" />
        </div>
        <h1 className="text-gradient uppercase">Tabela do Torneio</h1>
        <p className="text-muted">Acompanhe o caminho rumo ao título</p>
      </header>

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
        onTouchStart={handleTouchStart}
        onTouchEnd={handleDragEnd}
        onTouchMove={handleTouchMove}
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
                      className={`knockout-column phase-${roundName.toLowerCase().replace(/\s+/g, '-')} ${isCurrent ? 'current-round-highlight' : ''}`}
                    >
                      <h3 className="round-title knockout-title">
                        <span className="round-dot"></span>
                        {roundName}
                        {isCurrent && <span className="current-label"><Target size={12} /> Atual</span>}
                      </h3>
                      <div className="round-matches knockout-matches">
                        {roundsMap[roundName].map(m => (
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
                      id={`phase-${roundName}`}
                      className={`bracket-round ${isCurrent ? 'current-round-highlight' : ''}`}
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
              <Timer size={48} className="icon-dim" />
              <p>Os jogos serão definidos em breve.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Brackets;
