/* eslint-disable react-refresh/only-export-components */
import React, { useRef } from 'react';
import { toPng } from 'html-to-image';
import { Star, Download } from 'lucide-react';
import logo from '../../assets/unasp_logo.png';
import './ShareCard.css';
import type { Match } from '../../hooks/useMatches';

const getRoundGradient = (roundNum: string) => {
  const gradients: Record<string, string> = {
    '1': 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)', // Azul bem escuro
    '2': 'linear-gradient(135deg, #052e16 0%, #064e3b 100%)', // Verde bem escuro
    '3': 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)', // Vermelho bem escuro
    '4': 'linear-gradient(135deg, #2e1065 0%, #4c1d95 100%)', // Roxo escuro
    '5': 'linear-gradient(135deg, #4a044e 0%, #701a75 100%)', // Rosa/Fuchsia escuro
    '6': 'linear-gradient(135deg, #422006 0%, #78350f 100%)', // Bronze/Laranja escuro
    '7': 'linear-gradient(135deg, #0f172a 0%, #0f766e 100%)', // Teal/Azul esverdeado
  };
  return gradients[roundNum] || gradients['1'];
};

interface ShareCardProps {
  match?: Match | null;
  mvpPlayer?: { name: string } | null;
  onDownloadCard?: (withMvp: boolean) => void;
  isExporting?: boolean;
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
        skipFonts: false,
        backgroundColor: '#ffffff',
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

const ShareCard: React.FC<ShareCardProps & { innerRef: React.RefObject<HTMLDivElement | null> }> = ({ match, mvpPlayer, innerRef, onDownloadCard, isExporting }) => {
  const isScheduled = match?.status === 'agendado';
  const primaryA = match?.teams_a?.primary_color || '#1e293b';
  const primaryB = match?.teams_b?.primary_color || '#1e293b';

  return (
    <div className="share-card-container">
      <div 
        className="share-card-canvas" 
        ref={innerRef}
        style={{ background: getRoundGradient(match?.round || '1') }}
      >
        <div className="share-card-overlay-tint" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 0 }}></div>
        <div className="overlay-pattern"></div>
        
        <header className="header-brand">
          <img src={logo} alt="UNASP" />
          <h2>COPA UNASP</h2>
        </header>

        <section className="card-title-main">
          {isScheduled ? (
            <div className="matchday-label">
              <span className="label-top">MATCHDAY</span>
              <h1 className="label-bottom">PRÓXIMO JOGO</h1>
            </div>
          ) : (
            <h1>RESULTADO</h1>
          )}
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

          {isScheduled && match?.match_date && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '160px' }}>
              <div className="pre-match-date">
                {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(match.match_date)).replace(' de ', ' de ').replace(', ', ' às ').toUpperCase()}
              </div>
            </div>
          )}

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
