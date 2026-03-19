/* eslint-disable react-refresh/only-export-components */
import React, { useRef } from 'react';
import { toPng } from 'html-to-image';
import { Star } from 'lucide-react';
import logo from '../../assets/unasp_logo.png';
import './ShareCard.css';
import type { Match } from '../../hooks/useMatches';

interface ShareCardProps {
  match: Match;
  mvpPlayer?: { name: string } | null;
}

export const useShareCard = () => {
  const cardRef = useRef<HTMLDivElement>(null);

  const downloadCard = async (matchId: string) => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, {
        quality: 1.0,
        pixelRatio: 2, // High resolution for Retina/Sharing
      });
      const link = document.createElement('a');
      link.download = `resultado-copa-unasp-${matchId}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Erro ao gerar card:', err);
      alert('Não foi possível gerar o card de compartilhamento.');
    }
  };

  return { cardRef, downloadCard };
};

const ShareCard: React.FC<ShareCardProps & { innerRef: React.RefObject<HTMLDivElement | null> }> = ({ match, mvpPlayer, innerRef }) => {
  return (
    <div className="share-card-container">
      <div className="share-card-canvas" ref={innerRef}>
        <div className="overlay-pattern"></div>
        
        <header className="header-brand">
          <img src={logo} alt="UNASP" />
          <h2>COPA UNASP</h2>
        </header>

        <section className="card-title-main">
          <h1>RESULTADO</h1>
        </section>

        <section className="card-main-content">
          <div className="score-display-premium">
            <div className="team-block">
              <div className="badge-frame">
                {match.teams_a?.badge_url && <img src={match.teams_a.badge_url} alt="" />}
                <div className="glow"></div>
              </div>
              <span className="team-name-social">{match.teams_a?.name}</span>
            </div>

            <div className="score-numbers">
              <span className="social-score">{match.team_a_score}</span>
              <span className="vs-social">x</span>
              <span className="social-score">{match.team_b_score}</span>
            </div>

            <div className="team-block">
              <div className="badge-frame">
                {match.teams_b?.badge_url && <img src={match.teams_b.badge_url} alt="" />}
                <div className="glow"></div>
              </div>
              <span className="team-name-social">{match.teams_b?.name}</span>
            </div>
          </div>

          {mvpPlayer && (
            <div className="mvp-footer-card">
              <div className="mvp-icon-box">
                <Star size={60} fill="black" />
              </div>
              <div className="mvp-text-group">
                <h4>Craque do Jogo</h4>
                <p>{mvpPlayer.name}</p>
              </div>
            </div>
          )}
        </section>

        <footer className="footer-credits">
           WWW.COPAUNASP.COM.BR • @COPAUNASP
        </footer>
      </div>
    </div>
  );
};

export default ShareCard;
