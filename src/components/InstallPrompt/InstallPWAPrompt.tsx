import React, { useState, useEffect } from 'react';
import { Share, PlusSquare, X, BellRing, Download, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './InstallPWAPrompt.css';

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallPWAPrompt: React.FC = () => {
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [showAndroidPrompt, setShowAndroidPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((window.navigator as NavigatorWithStandalone).standalone);
    const hasBeenHidden = !!localStorage.getItem('pwa_prompt_hidden');

    if (isIOS && !isStandalone && !hasBeenHidden) {
      const timer = setTimeout(() => setShowIOSPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    // Android / Chrome / Edge install prompt
    const handleBeforeInstall = (e: Event) => {
      if (isStandalone || hasBeenHidden) return;
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show after a small delay so it doesn't pop up instantly
      setTimeout(() => setShowAndroidPrompt(true), 4000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleIOSClose = () => {
    setShowIOSPrompt(false);
    localStorage.setItem('pwa_prompt_hidden', 'true');
  };

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem('pwa_prompt_hidden', 'true');
    }
    setShowAndroidPrompt(false);
    setDeferredPrompt(null);
  };

  const handleAndroidClose = () => {
    setShowAndroidPrompt(false);
    localStorage.setItem('pwa_prompt_hidden', 'true');
  };

  return (
    <AnimatePresence>
      {/* iOS Prompt */}
      {showIOSPrompt && (
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
            <button className="close-prompt" onClick={handleIOSClose}>
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

            <button className="btn-entendi" onClick={handleIOSClose}>
              Entendi, vamos lá!
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* Android / Chrome Prompt */}
      {showAndroidPrompt && (
        <motion.div
          key="android-prompt"
          className="pwa-android-banner"
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        >
          <div className="android-banner-icon">
            <Smartphone size={28} color="var(--secondary)" />
          </div>
          <div className="android-banner-text">
            <strong>Instalar Copa UNASP</strong>
            <span>Acesso rápido + notificações de gols!</span>
          </div>
          <div className="android-banner-actions">
            <button className="btn-android-dismiss" onClick={handleAndroidClose}>
              <X size={16} />
            </button>
            <button className="btn-android-install" onClick={handleAndroidInstall}>
              <Download size={16} />
              Instalar
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InstallPWAPrompt;
