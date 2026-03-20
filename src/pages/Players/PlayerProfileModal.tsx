import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, ShieldAlert, User, Hash, Timer, Goal, Footprints } from 'lucide-react';
import { Player } from '../../hooks/usePlayers';
import './PlayerProfileModal.css';

interface PlayerProfileModalProps {
  player: (Player & { team_name?: string }) | null;
  onClose: () => void;
  teamName?: string;
}

const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({ player, onClose, teamName }) => {
  const [brokenPhotoUrl, setBrokenPhotoUrl] = useState<string | null>(null);

  const normalizeImageSrc = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
    try {
      return encodeURI(trimmed);
    } catch {
      return trimmed;
    }
  };

  if (!player) return null;

  return (
    <AnimatePresence>
      <div className="modal-overlay" onClick={onClose}>
        <motion.div 
          className="player-profile-modal glass"
          onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          <button className="modal-close-btn" onClick={onClose}>
            <X size={24} />
          </button>

          <header className="player-profile-header">
            <div className="player-id-section">
              <div className="player-photo-wrapper">
                {player.photo_url && brokenPhotoUrl !== player.photo_url ? (
                  <img 
                    src={normalizeImageSrc(player.photo_url)} 
                    alt={player.name} 
                    className="player-large-photo" 
                    width="160" 
                    height="160" 
                    loading="lazy" 
                    onError={() => setBrokenPhotoUrl(player.photo_url || null)}
                  />
                ) : (
                  <div className="player-photo-dummy">
                    <User size={64} />
                  </div>
                )}
                <div className="player-number-pill">#{player.number}</div>
              </div>
              <div className="player-main-meta">
                <h2>{player.name}</h2>
                <div className="player-sub-meta">
                  <div className="meta-item">
                    <Hash size={14} /> <span>{player.position}</span>
                  </div>
                  <div className="meta-item">
                    <Trophy size={14} /> <span>{teamName || player.team_name || 'Equipe Unasp'}</span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="player-stats-grid">
            <div className="stat-card glass-hover">
              <div className="stat-icon-circle" style={{ background: 'rgba(251, 191, 36, 0.1)' }}>
                <Goal size={20} color="#fbbf24" />
              </div>
              <div className="stat-content">
                <strong>{player.goals_count}</strong>
                <span>Gols Marcados</span>
              </div>
            </div>

            <div className="stat-card glass-hover">
              <div className="stat-icon-circle" style={{ background: 'rgba(0, 176, 255, 0.1)' }}>
                <Footprints size={20} color="#00b0ff" />
              </div>
              <div className="stat-content">
                <strong>{player.assists}</strong>
                <span>Assistências</span>
              </div>
            </div>

            <div className="stat-card glass-hover">
              <div className="stat-icon-circle" style={{ background: 'rgba(255, 255, 255, 0.1)' }}>
                <Timer size={20} color="#ffffff" />
              </div>
              <div className="stat-content">
                <strong>{player.position === 'Goleiro' ? (player.clean_sheets || 0) : (player.goals_count + player.assists)}</strong>
                <span>{player.position === 'Goleiro' ? 'Clean Sheets' : 'Participações'}</span>
              </div>
            </div>

            <div className="stat-card glass-hover">
              <div className="stat-icon-circle" style={{ background: 'rgba(255, 45, 45, 0.1)' }}>
                <ShieldAlert size={20} color="#ff2d2d" />
              </div>
              <div className="stat-content">
                <div className="cards-brief">
                  <span className="yellow">{player.yellow_cards} Amarelo</span>
                  <span className="red">{player.red_cards} Vermelho</span>
                </div>
                <span>Disciplina</span>
              </div>
            </div>
          </div>

          <footer className="player-modal-footer">
            <div className="player-bio-snippet">
              {player.bio || "Atleta em destaque na Copa Unasp 2026. Peça fundamental no esquema tático da equipe."}
            </div>
          </footer>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default PlayerProfileModal;
