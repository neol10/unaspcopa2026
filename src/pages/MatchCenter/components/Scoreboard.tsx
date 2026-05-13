import React from 'react';
import { Shield, Timer, Award, Download, Copy } from 'lucide-react';
import { deriveMatchStatus } from '../../../lib/matchStatus';
import { splitLocationCourt } from '../../../lib/court';
import { KNOCKOUT_ROUND_LABELS } from '../../../lib/tournamentRules';

interface ScoreboardProps {
  match: {
    id: string;
    location?: string | null;
    status: string;
    match_date?: string | null;
    team_a_score: number;
    team_b_score: number;
    round?: number;
    night?: number | null;
    is_timer_running?: boolean;
    timer_started_at?: string | null;
    timer_offset_seconds?: number | null;
    match_mvp_player_id?: string | null;
    match_mvp_description?: string | null;
    teams_a?: { name: string; badge_url?: string | null };
    teams_b?: { name: string; badge_url?: string | null };
  };
  elapsedTime: string;
  matchPeriod: string | null;
  isPaused: boolean;
  mvpName?: string | null;
  isExporting: boolean;
  onDownloadCard: () => void;
  onCopySummary: () => void;
  /** Label configurável: "Noite" ou "Rodada" */
  groupUnitLabel?: string;
}

const getRoundLabel = (round: number | undefined, night: number | null | undefined, groupUnitLabel: string): string | null => {
  if (!round) return null;
  if (round >= 1000) return KNOCKOUT_ROUND_LABELS[round] || `Fase ${round}`;
  // Fase de grupos: mostra Noite ou Rodada
  if (night !== null && night !== undefined) return `${groupUnitLabel} ${night}`;
  return `${groupUnitLabel} ${round}`;
};

export const Scoreboard: React.FC<ScoreboardProps> = ({
  match,
  elapsedTime,
  matchPeriod,
  isPaused,
  mvpName,
  isExporting,
  onDownloadCard,
  onCopySummary,
  groupUnitLabel = 'Noite',
}) => {
  const effectiveStatus = deriveMatchStatus(match);
  const { base: baseLocation, court } = splitLocationCourt(match.location);
  const displayCourt = court || 'QUADRA 1';
  const locationLabel = (baseLocation || match.location || 'Ginásio Principal').trim();

  return (
    <section className="live-scoreboard glass">
      <div className="scoreboard-top">
        <span className="location">{locationLabel}</span>
        <div className="scoreboard-top-right">
          <span className="sb-round-chip">{displayCourt}</span>
          <div className={`match-badge ${effectiveStatus}`}>
            {effectiveStatus === 'ao_vivo' ? 'AO VIVO' : effectiveStatus.toUpperCase()}
          </div>
        </div>
      </div>

      <div className="scoreboard-main">
        <div className="sb-team">
          <div className="sb-shield glass">
            {match.teams_a?.badge_url ? (
              <img 
                src={match.teams_a.badge_url} 
                alt="" 
                width="48" 
                height="48" 
                loading="lazy"
                decoding="async"
                style={{ objectFit: 'contain', padding: '4px' }} 
              />
            ) : <Shield size={48} color="var(--secondary)" />}
          </div>
          <h3>{match.teams_a?.name}</h3>
        </div>

        <div className="sb-score">
          <div className="score-numbers">
            <span className="num">{match.team_a_score}</span>
            <span className="vs">:</span>
            <span className="num">{match.team_b_score}</span>
          </div>
          <div className={`sb-timer active ${effectiveStatus === 'ao_vivo' && isPaused ? 'paused' : ''}`}> 
            <Timer size={14} className={effectiveStatus === 'ao_vivo' && !isPaused ? 'animate-pulse' : ''} />
            <div className="timer-info-group">
              <span className="elapsed-time">
                {effectiveStatus === 'ao_vivo' && isPaused ? 'PAUSADO' : elapsedTime}
              </span>
              {matchPeriod && (
                <span className="period-badge">{matchPeriod}</span>
              )}
            </div>
          </div>
        </div>

        <div className="sb-team">
          <div className="sb-shield glass">
            {match.teams_b?.badge_url ? (
              <img 
                src={match.teams_b.badge_url} 
                alt="" 
                width="48" 
                height="48" 
                loading="lazy"
                decoding="async"
                style={{ objectFit: 'contain', padding: '4px' }} 
              />
            ) : <Shield size={48} color="var(--primary)" />}
          </div>
          <h3>{match.teams_b?.name}</h3>
        </div>
      </div>
      
      <div className="scoreboard-bottom">
        <div className="live-progress">
          <div className="progress-bar" style={{ width: effectiveStatus === 'ao_vivo' ? '50%' : '100%' }}></div>
        </div>
      </div>

      {/* Craque do Jogo (Opcional) */}
      {mvpName && (
        <div className="match-mvp-badge glass animate-slide-up">
          <Award size={20} className="glow-icon" />
          <div className="mvp-details">
            <span className="mvp-label">CRAQUE DO JOGO</span>
            <span className="mvp-name">{mvpName}</span>
            {match.match_mvp_description && (
              <p className="mvp-desc">"{match.match_mvp_description}"</p>
            )}
          </div>
        </div>
      )}

      <div className="scoreboard-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button 
          className="btn-share-result" 
          onClick={onDownloadCard}
          disabled={isExporting}
        >
          {isExporting ? <div className="spinner-mini"></div> : <Download size={18} />}
          Baixar Card de Resultado
        </button>

        <button className="btn-share-result" onClick={onCopySummary}>
          <Copy size={18} />
          Copiar Resumo
        </button>
      </div>
    </section>
  );
};
