import React, { useState, useEffect } from 'react';
import { Share, PlusSquare, X, BellRing } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './InstallPWAPrompt.css';

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

const InstallPWAPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Verificar se é iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
    
    // Verificar se já está em modo PWA/standalone
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((window.navigator as NavigatorWithStandalone).standalone);

    // Verificar se o usuário já fechou o prompt nesta sessão/dia
    const pwaPromptHidden = localStorage.getItem('pwa_prompt_hidden');
    const isRecent = pwaPromptHidden && (Date.now() - parseInt(pwaPromptHidden) < 1000 * 60 * 60 * 24); // 24h

    if (isIOS && !isStandalone && !isRecent) {
      const timer = setTimeout(() => setShowPrompt(true), 3000); // Mostra após 3s
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa_prompt_hidden', Date.now().toString());
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div 
          className="pwa-install-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div 
            className="pwa-prompt-card glass"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
          >
            <button className="close-prompt" onClick={handleClose}>
              <X size={20} />
            </button>

            <div className="prompt-header">
              <div className="prompt-icon-box">
                <BellRing size={24} color="var(--secondary)" className="animate-bounce" />
              </div>
              <h3>Ative as Notificações Push</h3>
              <p>Receba alertas de gols e cartões em tempo real diretamente no seu iPhone.</p>
            </div>

            <div className="prompt-steps">
              <div className="step-row">
                <div className="step-num">1</div>
                <p>Toque no ícone de <strong>Compartilhar</strong> na barra do Safari.</p>
                <Share size={20} className="step-icon blue" />
              </div>
              <div className="step-row">
                <div className="step-num">2</div>
                <p>Role para baixo e selecione <strong>Adicionar à Tela de Início</strong>.</p>
                <PlusSquare size={20} className="step-icon gold" />
              </div>
            </div>

            <p className="prompt-note">
              Isso instalará a Copa Unasp como um App e desbloqueará as notificações de segundo plano.
            </p>

            <button className="btn-entendi" onClick={handleClose}>
              Entendi, vamos lá!
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InstallPWAPrompt;
