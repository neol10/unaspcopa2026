import React from 'react';
import { PlayCircle, Calendar, MapPin, Radio, ChevronRight } from 'lucide-react';
import './Live.css';

const Live: React.FC = () => (
  <div className="live-page animate-fade-in">
    <section className="live-hero glass">
      <div className="live-hero-content">
        <div className="live-pill">
          <Radio size={14} />
          <span>AO VIVO</span>
        </div>
        <h1>
          Arena ao vivo
          <span>da Copa Unasp</span>
        </h1>
        <p>
          Aqui voce acompanha os jogos, melhores momentos e bastidores direto do nosso canal.
        </p>
        <div className="live-hero-actions">
          <a
            className="live-cta live-cta-primary"
            href="https://youtube.com/@copa_unasp?si=CQ-vXe0o0kmo2cQH"
            target="_blank"
            rel="noreferrer noopener"
          >
            <PlayCircle size={18} />
            <span>Assistir no YouTube</span>
          </a>
          <button className="live-cta live-cta-ghost" type="button">
            <Calendar size={16} />
            <span>Ver agenda</span>
          </button>
        </div>
      </div>
      <div className="live-hero-media">
        <div className="live-media-shell">
          <div className="live-media-badge">LIVE</div>
          <div className="live-media-screen">
            <div className="live-media-overlay">
              <PlayCircle size={46} />
              <span>Canal oficial Copa Unasp</span>
            </div>
          </div>
        </div>
        <div className="live-media-details">
          <div>
            <strong>Transmissao oficial</strong>
            <span>youtube.com/@copa_unasp</span>
          </div>
          <ChevronRight size={18} />
        </div>
      </div>
    </section>

    <section className="live-info-grid">
      <div className="live-info-card glass">
        <div className="live-info-head">
          <span className="live-info-tag">Agenda</span>
          <Calendar size={18} />
        </div>
        <h3>Rodadas e destaques</h3>
        <p>Confira quando teremos transmissao e os eventos especiais da temporada.</p>
        <button className="live-info-btn" type="button">Ver calendario</button>
      </div>

      <div className="live-info-card glass">
        <div className="live-info-head">
          <span className="live-info-tag">Arena</span>
          <MapPin size={18} />
        </div>
        <h3>Unasp Campus</h3>
        <p>Palco oficial da Copa Unasp 2026 com clima de final todo jogo.</p>
        <button className="live-info-btn" type="button">Como chegar</button>
      </div>

      <div className="live-info-card glass">
        <div className="live-info-head">
          <span className="live-info-tag">Extras</span>
          <PlayCircle size={18} />
        </div>
        <h3>Melhores momentos</h3>
        <p>Gols, entrevistas e bastidores publicados logo apos cada partida.</p>
        <a
          className="live-info-btn"
          href="https://youtube.com/@copa_unasp?si=CQ-vXe0o0kmo2cQH"
          target="_blank"
          rel="noreferrer noopener"
        >
          Ver playlist
        </a>
      </div>
    </section>
  </div>
);

export default Live;
