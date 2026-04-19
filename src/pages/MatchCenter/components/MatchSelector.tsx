import React from 'react';
import { Zap } from 'lucide-react';
import { deriveMatchStatus } from '../../../lib/matchStatus';

interface Match {
  id: string;
  round?: number | string | null;
  status: string;
  match_date?: string | null;
  is_timer_running?: boolean | null;
  timer_started_at?: string | null;
  timer_offset_seconds?: number | null;
  teams_a?: { name: string; badge_url?: string; group?: string };
  teams_b?: { name: string; badge_url?: string; group?: string };
}

interface MatchSelectorProps {
  matches: Match[];
  activeMatchId: string | null;
  onSelectMatch: (id: string) => void;
  desktopTitle?: string;
  activeGroupChip?: string | null;
  counts: {
    live: number;
    upcoming: number;
    finished: number;
  };
}

export const MatchSelector: React.FC<MatchSelectorProps> = ({
  matches,
  activeMatchId,
  onSelectMatch,
  desktopTitle = 'Partidas',
  activeGroupChip,
  counts
}) => {
  const getTeamLabel = (name: string | null | undefined, fallback: string) => {
    return (name || '').trim() || fallback;
  };

  const getTeamShortName = (name: string | null | undefined, fallback: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return fallback;
    return trimmed.replace(/\s+/g, '').slice(0, 3).toUpperCase();
  };

  return (
    <div className="match-selector-bar glass">
      <div className="selector-header-row">
        <div className="selector-title">
          <Zap size={16} color="var(--secondary)" />
          <span className="desktop-only">{desktopTitle}</span>
          <span className="mobile-only">Partidas</span>
        </div>
        <div className="live-status-badge">
          <div className="pulse-dot"></div>
          <span>Auto-Sync</span>
        </div>
      </div>

      <div className="match-selector-summary" role="status" aria-live="polite">
        <span className="summary-chip summary-live">Ao vivo: {counts.live}</span>
        <span className="summary-chip">Agendados: {counts.upcoming}</span>
        <span className="summary-chip">Finalizados: {counts.finished}</span>
        {activeGroupChip && (
          <span className="summary-chip summary-round">{activeGroupChip}</span>
        )}
      </div>

      {/* Mobile Dropdown Selector */}
      <div className="mobile-selector-container mobile-only">
        <select 
          className="match-select-mobile"
          value={activeMatchId || ''}
          onChange={(e) => onSelectMatch(e.target.value)}
        >
          {matches.map(m => (
            <option key={m.id} value={m.id}>
              {deriveMatchStatus(m) === 'ao_vivo' ? '🔴 ' : ''}
              {getTeamLabel(m.teams_a?.name, 'Equipe A')} x {getTeamLabel(m.teams_b?.name, 'Equipe B')}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop Pills Selector */}
      <div className="selector-list desktop-only">
        {matches.map(m => (
          <button 
            key={m.id} 
            className={`match-pill ${activeMatchId === m.id ? 'active' : ''}`}
            onClick={() => onSelectMatch(m.id)}
          >
            <span className="pill-teams">
              {getTeamShortName(m.teams_a?.name, 'A')} x {getTeamShortName(m.teams_b?.name, 'B')}
            </span>
            {deriveMatchStatus(m) === 'ao_vivo' && <span className="live-dot-mini"></span>}
          </button>
        ))}
      </div>
    </div>
  );
};
