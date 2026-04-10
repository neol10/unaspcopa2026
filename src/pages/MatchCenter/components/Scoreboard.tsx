import React from 'react';
import { Shield, Timer, Award, Download, Copy } from 'lucide-react';

interface ScoreboardProps {
  match: {
    id: string;
    location?: string | null;
    status: string;
    team_a_score: number;
    team_b_score: number;
    is_timer_running?: boolean;
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
}

export const Scoreboard: React.FC<ScoreboardProps> = ({
  match,
  elapsedTime,
  matchPeriod,
  isPaused,
  mvpName,
  isExporting,
  onDownloadCard,
  onCopySummary
}) => {
  return (
    <section className="live-scoreboard glass">
      <div className="scoreboard-top">
        <span className="location">{match.location}</span>
        <div className={`match-badge ${match.status}`}>
          {match.status === 'ao_vivo' ? 'AO VIVO' : match.status.toUpperCase()}
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
          <div className={`sb-timer active ${match.status === 'ao_vivo' && isPaused ? 'paused' : ''}`}>
            <Timer size={14} className={match.status === 'ao_vivo' && !isPaused ? 'animate-pulse' : ''} />
            <div className="timer-info-group">
              <span className="elapsed-time">
                {match.status === 'ao_vivo' && isPaused ? 'PAUSADO' : elapsedTime}
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
          <div className="progress-bar" style={{ width: match.status === 'ao_vivo' ? '50%' : '100%' }}></div>
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
