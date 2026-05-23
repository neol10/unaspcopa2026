import React, { useState } from 'react';
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, ShieldAlert, User, Hash, Timer, Goal, Footprints } from 'lucide-react';
import { Player } from '../../hooks/usePlayers';
import { parsePhotoCropFromUrl } from '../../lib/photoCrop';
import { useAuthContext } from '../../contexts/AuthContext';
import './PlayerProfileModal.css';

interface PlayerProfileModalProps {
  player: (Player & { team_name?: string; team_primary_color?: string | null }) | null;
  onClose: () => void;
  teamName?: string;
  teamPrimaryColor?: string | null;
}

const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({ player, onClose, teamName, teamPrimaryColor }) => {
  const { role } = useAuthContext();
  const [brokenPhotoUrl, setBrokenPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!player) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // restore both html and body overflow to previous values
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [onClose, player]);

  const getTeamModalTone = (seedRaw: string) => {
    // Mantemos o tema base (sem variar por cor) conforme o design atual.
    void seedRaw;
    const baseHue = 215; // Azul Copa Unasp
    return {
      modalBg: `hsla(${baseHue}, 75%, 58%, 0.10)`,
      modalGlow: `hsla(${baseHue}, 88%, 60%, 0.12)`,
      modalBorder: `hsla(${baseHue}, 86%, 62%, 0.25)`,
      pillBg: `var(--secondary)`, // Trophy Gold
      pillText: `#050b1f`,
      iconBg: `hsla(${baseHue}, 85%, 58%, 0.12)`,
      iconColor: `var(--secondary)`,
    };
  };

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

  const parsedPhoto = parsePhotoCropFromUrl(player.photo_url || '');
  const z = parsedPhoto.crop?.z && Number.isFinite(parsedPhoto.crop.z) ? parsedPhoto.crop.z : 100;
  const scale = Math.max(50, Math.min(300, z)) / 100;

  const toneSeed = `${teamName || player.team_name || ''}-${player.team_id || ''}-${teamPrimaryColor || ''}`;
  const tone = getTeamModalTone(toneSeed);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <AnimatePresence>
        {player && (
          <motion.div 
            className="player-profile-modal glass team-tinted-modal"
            style={{
              '--team-modal-bg': tone.modalBg,
              '--team-modal-glow': tone.modalGlow,
              '--team-modal-border': tone.modalBorder,
              '--team-modal-pill-bg': tone.pillBg,
              '--team-modal-pill-text': tone.pillText,
              '--team-modal-icon-bg': tone.iconBg,
              '--team-modal-icon-color': tone.iconColor,
            } as React.CSSProperties}
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
                      src={normalizeImageSrc(parsedPhoto.src)} 
                      alt={player.name} 
                      className="player-large-photo" 
                      style={
                        parsedPhoto.objectPosition
                          ? { objectPosition: parsedPhoto.objectPosition, transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: parsedPhoto.objectPosition }
                          : (scale !== 1 ? { transform: `scale(${scale})` } : undefined)
                      }
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
                </div>
                <div className="player-main-meta">
                  <h2>{player.name}</h2>
                  <div className="player-sub-meta">
                    <div className="meta-item">
                      <Hash size={14} /> <span>Nº {player.number || 'S/N'} • {player.position}</span>
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
                <div className="stat-icon-circle team-tone">
                  <Goal size={20} color="var(--team-modal-icon-color)" />
                </div>
                <div className="stat-content">
                  <strong>{player.goals_count}</strong>
                  <span>Gols Marcados</span>
                </div>
              </div>

              <div className="stat-card glass-hover">
                <div className="stat-icon-circle team-tone">
                  <Footprints size={20} color="var(--team-modal-icon-color)" />
                </div>
                <div className="stat-content">
                  <strong>{player.assists}</strong>
                  <span>Assistências</span>
                </div>
              </div>

              <div className="stat-card glass-hover">
                <div className="stat-icon-circle team-tone">
                  <Timer size={20} color="var(--team-modal-icon-color)" />
                </div>
                <div className="stat-content">
                  <strong>{player.position === 'Goleiro' ? (player.clean_sheets || 0) : (player.goals_count + player.assists)}</strong>
                  <span>{player.position === 'Goleiro' ? 'Clean Sheets' : 'Participações'}</span>
                </div>
              </div>

              <div className="stat-card glass-hover">
                <div className="stat-icon-circle team-tone">
                  <ShieldAlert size={20} color="var(--team-modal-icon-color)" />
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
              {role === 'admin' && (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn-download-card"
                    onClick={async () => {
                      // lazy-load download function to avoid circular deps
                      const mod = await import('../../lib/socialCardExport');
                      await mod.downloadSocialPlayerCard({
                        fileName: `card-jogador-${(player.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                        category: 'Craque da Noite',
                        subtitle: `Noite - Craque`,
                        theme: 'blue',
                        player: { name: player.name, teamName: teamName || player.team_name, position: player.position, photoUrl: player.photo_url, teamBadgeUrl: player.team_badge_url, teamPrimaryColor: teamPrimaryColor || player.team_primary_color },
                        stats: [
                          { label: 'Gols', value: player.goals_count || 0 },
                          { label: 'Assistências', value: player.assists || 0 },
                          { label: 'Participações', value: (player.goals_count || 0) + (player.assists || 0) },
                        ],
                      });
                    }}
                  >
                    Baixar Card
                  </button>
                </div>
              )}
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PlayerProfileModal;
