import React, { useState, useEffect } from 'react';
import { Share, PlusSquare, X } from 'lucide-react';
import './IOSInstallPrompt.css';

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

const IOSInstallPrompt: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Detectar se é iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
    
    // Detectar se já está "instalado" (standalone)
    const isStandalone = Boolean((window.navigator as NavigatorWithStandalone).standalone) || window.matchMedia('(display-mode: standalone)').matches;

    // Mostrar apenas se for iOS e NÃO estiver instalado
    if (isIOS && !isStandalone) {
      // Pequeno atraso para não assustar o usuário
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!isVisible) return null;

  return (
    <div className="ios-prompt-overlay animate-fade-in">
      <div className="ios-prompt-card glass animate-slide-up">
        <button className="ios-prompt-close" onClick={() => setIsVisible(false)}>
          <X size={18} />
        </button>
        
        <div className="ios-prompt-header">
          <div className="ios-app-icon">
             {/* Logo simplificada ou ícone da Copa */}
             🏆
          </div>
          <div className="ios-prompt-title">
            <h3>Instalar Copa UNASP</h3>
            <p>Receba alertas de Gols em tempo real!</p>
          </div>
        </div>

        <div className="ios-prompt-steps">
          <div className="ios-step">
            <div className="ios-step-icon">
              <Share size={20} color="#007AFF" />
            </div>
            <p>1. Clique no botão de <strong>Compartilhar</strong> no Safari.</p>
          </div>
          
          <div className="ios-step">
            <div className="ios-step-icon">
              <PlusSquare size={20} />
            </div>
            <p>2. Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong>.</p>
          </div>
        </div>

        <div className="ios-prompt-footer">
          <p>Após adicionar, abra o aplicativo pela Tela de Início para ativar as notificações. 🚀</p>
        </div>
      </div>
    </div>
  );
};

export default IOSInstallPrompt;
