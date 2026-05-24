/* eslint-disable react-refresh/only-export-components */
import React, { useRef } from 'react';
import { toPng } from 'html-to-image';
import { Star } from 'lucide-react';
import logo from '../../assets/unasp_logo.png';
import './ShareCard.css';
import type { Match } from '../../hooks/useMatches';

import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ShareCardProps {
  match?: Match | null;
  mvpPlayer?: { name: string } | null;
}

export const useShareCard = () => {
  const cardRef = useRef<HTMLDivElement>(null);

  const downloadCard = async (matchId: string) => {
    if (!cardRef.current) return;
    try {
      await document.fonts.ready;
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
  const isScheduled = match?.status === 'agendado';
  const primaryA = match?.teams_a?.primary_color || '#1e293b';
  const primaryB = match?.teams_b?.primary_color || '#1e293b';

  return (
    <div className="share-card-container">
      <div 
        className="share-card-canvas" 
        ref={innerRef}
      >
        <div 
          className="dynamic-bg-split" 
          style={{ background: `linear-gradient(to right, ${primaryA} 50%, ${primaryB} 50%)` }}
        ></div>
        <div className="overlay-pattern"></div>
        
        <header className="header-brand">
          <img src={logo} alt="UNASP" />
          <h2>COPA UNASP</h2>
        </header>

        <section className="card-title-main">
          <h1>{isScheduled ? 'PRÓXIMO JOGO' : 'RESULTADO'}</h1>
        </section>

        <section className="card-main-content">
          <div className="score-display-premium">
            <div className="team-block">
              <div className="badge-frame" style={{ borderColor: primaryA, boxShadow: `0 0 40px ${primaryA}40` }}>
                {match?.teams_a?.badge_url && <img src={match.teams_a?.badge_url} alt="" />}
              </div>
              <span className="team-name-social">{match?.teams_a?.name || 'Equipe A'}</span>
            </div>

            <div className="score-numbers">
              {!isScheduled ? (
                <>
                  <span className="social-score">{match?.team_a_score ?? 0}</span>
                  <span className="vs-social">x</span>
                  <span className="social-score">{match?.team_b_score ?? 0}</span>
                </>
              ) : (
                <div className="pre-match-center">
                  <span className="vs-big">VS</span>
                  {match?.match_date && (
                    <div className="pre-match-date">
                      {format(parseISO(match.match_date), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="team-block">
              <div className="badge-frame" style={{ borderColor: primaryB, boxShadow: `0 0 40px ${primaryB}40` }}>
                {match?.teams_b?.badge_url && <img src={match.teams_b?.badge_url} alt="" />}
              </div>
              <span className="team-name-social">{match?.teams_b?.name || 'Equipe B'}</span>
            </div>
          </div>

          {!isScheduled && mvpPlayer && (
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
           UNASPCOPA2026.VERCEL.APP • @COPAUNASP
        </footer>
      </div>
    </div>
  );
};

export default ShareCard;
