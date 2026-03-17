import React, { useRef, useState } from 'react';
import { useMatches, Match } from '../../hooks/useMatches';
import { Trophy, Timer, ChevronRight, ChevronLeft } from 'lucide-react';
import './Brackets.css';

const Brackets: React.FC = () => {
  const { matches, loading } = useMatches();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

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

  if (loading) return <div className="loading-state">Carregando Jogos...</div>;

  const MatchBox: React.FC<{ match: Match; isKnockout?: boolean }> = ({ match, isKnockout }) => {
    const isTeamAWinner = match.status === 'finalizado' && match.team_a_score > match.team_b_score;
    const isTeamBWinner = match.status === 'finalizado' && match.team_b_score > match.team_a_score;

    return (
      <div className={`bracket-match ${isKnockout ? 'knockout-item' : ''}`}>
        <div className="match-box glass">
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
                {knockoutRounds.map((roundName) => (
                  <div key={roundName} className={`knockout-column phase-${roundName.toLowerCase().replace(/\s+/g, '-')}`}>
                    <h3 className="round-title knockout-title">
                      <span className="round-dot"></span>
                      {roundName}
                    </h3>
                    <div className="round-matches knockout-matches">
                      {roundsMap[roundName].map(m => (
                        <MatchBox key={m.id} match={m} isKnockout />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seção Fase de Grupos */}
          {groupRounds.length > 0 && (
            <div className="group-stage-container">
              <div className="group-rounds">
                {groupRounds.map((roundName) => (
                  <div key={roundName} className="bracket-round">
                    <h3 className="round-title">
                      <span className="round-dot"></span>
                      {formatRoundName(roundName)}
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
