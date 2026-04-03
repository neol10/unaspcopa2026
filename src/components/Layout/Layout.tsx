import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Home, Trophy, BarChart2, Users, Settings, Timer, Sun, Moon, Menu, X, LogIn, User, LogOut, Calendar, Bell, BellOff, Image } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useAuthContext } from '../../contexts/AuthContext';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { useTeams } from '../../hooks/useTeams';
import { useMatches } from '../../hooks/useMatches';
import { usePreGameReminder } from '../../hooks/usePreGameReminder';
import { AutoRefreshStatus } from '../AutoRefreshStatus/AutoRefreshStatus';
import AuthModal from '../Auth/AuthModal';
import IOSInstallPrompt from '../PWA/IOSInstallPrompt';
import { AnimatePresence, motion } from 'framer-motion';
import logo from '../../assets/unasp_logo.png';
import { prefetchRouteIntent } from '../../lib/routePrefetch';
import { onGoalOverlay, type GoalOverlayPayload } from '../../lib/goalOverlay';
import './Layout.css';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, role, signOut } = useAuthContext();
  const { isSubscribed, subscribe, unsubscribe, preferences, updatePreferences } = usePushNotifications();
  const { teams } = useTeams();
  const { matches } = useMatches();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showPushPrefs, setShowPushPrefs] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [goalOverlay, setGoalOverlay] = useState<GoalOverlayPayload | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const isAdminRoute = location.pathname.startsWith('/admin');
  const showContextBar = location.pathname.startsWith('/classificacao');
  const showAdminNav = role === 'admin' || isAdminRoute;
  const isPushLocked = !user;
  const isAdminUser = role === 'admin';

  const isTestGroup = (groupName?: string | null) => {
    const clean = (groupName || '').trim().toUpperCase().replace(/\s+/g, '');
    return clean === 'C' || clean === 'GRUPOC';
  };

  const visibleTeams = isAdminUser
    ? teams
    : teams.filter((team) => !isTestGroup(team.group));

  const liveMatch = useMemo(() => (matches || []).find((m) => m.status === 'ao_vivo') || null, [matches]);
  const nextMatch = useMemo(() => {
    const upcoming = (matches || [])
      .filter((m) => m.status === 'agendado' && new Date(m.match_date).getTime() > Date.now())
      .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());
    return upcoming[0] || null;
  }, [matches]);

  const formatMatchDatetime = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
    closeMobileMenu();
  };

  const handlePushToggle = async () => {
    if (isPushLocked) {
      return;
    }

    if (isSubscribed) {
      await unsubscribe();
      return;
    }

    await subscribe();
  };

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const navIntentHandlers = (path: string) => ({
    onMouseEnter: () => prefetchRouteIntent(path, queryClient),
    onFocus: () => prefetchRouteIntent(path, queryClient),
  });

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.classList.add('nav-open');
      return () => document.body.classList.remove('nav-open');
    }
    document.body.classList.remove('nav-open');
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const unsub = onGoalOverlay((payload) => {
      if (isAdminRoute) return;
      
      // Reproduzir som de torcida
      const goalAudio = new Audio('/sounds/torcida.mp3');
      goalAudio.volume = 0.6;
      goalAudio.play().catch(e => console.warn('Audio auto-play blocked:', e));

      setGoalOverlay(payload);
      window.setTimeout(() => setGoalOverlay(null), 5000);
    });
    return () => unsub();
  }, [isAdminRoute]);

  usePreGameReminder(matches, isSubscribed, {
    preGameReminder: preferences.preGameReminder,
    favoriteTeamId: preferences.favoriteTeamId,
  });

  return (
    <div className="app-container">
      <a className="skip-link" href="#main-content">Pular para o conteudo</a>
      {/* Global Premium Goal Overlay */}
      <AnimatePresence>
        {!isAdminRoute && goalOverlay && (
          <motion.div
            className="goal-overlay-premium"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ type: 'spring', damping: 12 }}
          >
            <motion.div
              className="goal-announcement"
              animate={{ y: [0, -20, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <div className="goal-hero-row">
                <div className="goal-icon-container">
                  <span className="goal-ball-emoji">⚽</span>
                </div>
                {goalOverlay.playerPhotoUrl && (
                  <div className="goal-player-photo">
                    <img src={goalOverlay.playerPhotoUrl} alt={goalOverlay.player} loading="eager" />
                  </div>
                )}
              </div>
              <h1 className="goal-text">GOOOOOOOL!</h1>
              <div className="goal-details">
                <span className="goal-team">{goalOverlay.team}</span>
                <span className="goal-player">{goalOverlay.player}</span>
              </div>
            </motion.div>
            <div className="confetti-container">
              {[...Array(14)].map((_, i) => (
                <motion.div
                  key={i}
                  className="confetti-piece"
                  initial={{ y: -100, x: Math.random() * 400 - 200, opacity: 1 }}
                  animate={{ y: 800, rotate: 360 }}
                  transition={{ duration: Math.random() * 2 + 1, repeat: Infinity }}
                  style={{
                    backgroundColor: i % 2 === 0 ? 'var(--secondary)' : 'var(--primary)',
                    left: `${Math.random() * 100}%`,
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-content">
          <div className="sidebar-header">
            <NavLink to="/" className="brand" onClick={closeMobileMenu}>
              <img src={logo} alt="Logo UNASP" className="nav-logo" width="32" height="32" loading="eager" />
              <div className="brand-text">
                <span className="brand-copa">COPA</span>
                <span className="brand-year">2026</span>
              </div>
            </NavLink>
            <button className="mobile-menu-btn" onClick={toggleMobileMenu} aria-label="Fechar menu">
              <X size={24} />
            </button>
          </div>

          <div className="fifa-streak" style={{ opacity: 0.3, marginBottom: '2rem' }}></div>

          <nav className="sidebar-nav">
            <ul className="nav-links">
              <li>
                <NavLink to="/" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={closeMobileMenu} {...navIntentHandlers('/')}>
                  <Home size={20} /> <span>Início</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/classificacao" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={closeMobileMenu} {...navIntentHandlers('/classificacao')}>
                  <Trophy size={20} /> <span>Classificação</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/rankings" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={closeMobileMenu} {...navIntentHandlers('/rankings')}>
                  <BarChart2 size={20} /> <span>Rankings</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/equipes" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={closeMobileMenu} {...navIntentHandlers('/equipes')}>
                  <Users size={20} /> <span>Equipes</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/central-da-partida" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={closeMobileMenu} {...navIntentHandlers('/central-da-partida')}>
                  <Timer size={20} /> <span>Central</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/jogos" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={closeMobileMenu} {...navIntentHandlers('/jogos')}>
                  <Calendar size={20} /> <span>Jogos</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/jogadores" className={({ isActive }) => (isActive ? 'nav-active' : '')} onClick={closeMobileMenu} {...navIntentHandlers('/jogadores')}>
                  <Users size={20} /> <span>Jogadores</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/galeria" className={({ isActive }) => (isActive ? 'nav-active' : '')} onClick={closeMobileMenu} {...navIntentHandlers('/galeria')}>
                  <Image size={20} /> <span>Galeria</span>
                </NavLink>
              </li>
              {showAdminNav && (
                <li>
                  <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={closeMobileMenu} {...navIntentHandlers('/admin')}>
                    <Settings size={20} /> <span>Admin</span>
                  </NavLink>
                </li>
              )}
            </ul>
          </nav>

          <div className="sidebar-footer">
            <div className={`net-status ${isOnline ? 'online' : 'offline'}`}>
              <span className="net-dot" aria-hidden="true"></span>
              <span>{isOnline ? 'Online' : 'Sem conexão'}</span>
            </div>
            {user ? (
              <div className="auth-user-block">
                <div className="auth-user-info">
                  <div className="auth-avatar"><User size={16} /></div>
                  <span className="auth-user-email" title={user.email}>{user.email?.split('@')[0]}</span>
                </div>
                <button className="btn-logout" onClick={handleSignOut} title="Sair">
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <button className="btn-login" onClick={() => setShowAuthModal(true)}>
                <LogIn size={18} />
                <span>Entrar</span>
              </button>
            )}
            <button 
              className={`push-toggle ${isSubscribed ? 'subscribed' : ''} ${isPushLocked ? 'locked' : ''}`} 
              onClick={handlePushToggle}
              title={isPushLocked ? 'Faça login para gerenciar alertas' : isSubscribed ? 'Desativar Notificações' : 'Ativar Notificações'}
              disabled={isPushLocked}
              aria-disabled={isPushLocked}
            >
              {isSubscribed ? <Bell size={20} color="var(--secondary)" /> : <BellOff size={20} />}
              <span>{isPushLocked ? 'Alertas indisponíveis' : isSubscribed ? 'Alertas Ativos' : 'Ativar Alertas'}</span>
            </button>

            {isSubscribed && (
              <div className="push-prefs glass">
                <button
                  className="push-prefs-toggle"
                  type="button"
                  onClick={() => setShowPushPrefs((prev) => !prev)}
                >
                  <span>Preferências de Alertas</span>
                  <span>{showPushPrefs ? '−' : '+'}</span>
                </button>

                {showPushPrefs && (
                  <div className="push-prefs-content">
                    <label className="push-pref-check">
                      <input
                        type="checkbox"
                        checked={preferences.onlyImportant}
                        onChange={(e) => void updatePreferences({ onlyImportant: e.target.checked })}
                      />
                      <span>Apenas alertas importantes</span>
                    </label>

                    <label className="push-pref-check">
                      <input
                        type="checkbox"
                        checked={preferences.preGameReminder}
                        onChange={(e) => void updatePreferences({ preGameReminder: e.target.checked })}
                      />
                      <span>Lembrete 15 min antes do jogo</span>
                    </label>

                    <div className="push-pref-group">
                      <span className="push-pref-title">Categorias</span>
                      <label className="push-pref-check">
                        <input
                          type="checkbox"
                          checked={preferences.categories.live}
                          onChange={(e) => void updatePreferences({ categories: { live: e.target.checked } })}
                        />
                        <span>Ao vivo (gols e lances)</span>
                      </label>
                      <label className="push-pref-check">
                        <input
                          type="checkbox"
                          checked={preferences.categories.results}
                          onChange={(e) => void updatePreferences({ categories: { results: e.target.checked } })}
                        />
                        <span>Resultados</span>
                      </label>
                      <label className="push-pref-check">
                        <input
                          type="checkbox"
                          checked={preferences.categories.news}
                          onChange={(e) => void updatePreferences({ categories: { news: e.target.checked } })}
                        />
                        <span>Notícias</span>
                      </label>
                      <label className="push-pref-check">
                        <input
                          type="checkbox"
                          checked={preferences.categories.polls}
                          onChange={(e) => void updatePreferences({ categories: { polls: e.target.checked } })}
                        />
                        <span>Enquetes</span>
                      </label>
                      <label className="push-pref-check">
                        <input
                          type="checkbox"
                          checked={preferences.categories.standings}
                          onChange={(e) => void updatePreferences({ categories: { standings: e.target.checked } })}
                        />
                        <span>Classificação</span>
                      </label>
                    </div>

                    <div className="push-pref-group">
                      <span className="push-pref-title">Time favorito (opcional)</span>
                      <select
                        className="push-pref-select"
                        value={preferences.favoriteTeamId || ''}
                        onChange={(e) => void updatePreferences({ favoriteTeamId: e.target.value || null })}
                      >
                        <option value="">Todos os times</option>
                        {visibleTeams.map((team) => (
                          <option key={team.id} value={team.id}>{team.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button className="theme-toggle" onClick={toggleTheme} aria-label="Alternar tema">
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              <span>{theme === 'light' ? 'Modo Escuro' : 'Modo Claro'}</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="main-wrapper">
        <header className="mobile-navbar glass">
          <NavLink to="/" className="brand">
            <img src={logo} alt="Logo UNASP" className="nav-logo" width="32" height="32" loading="eager" />
            <div className="brand-text">
              <span className="brand-copa">COPA</span>
              <span className="brand-year">2026</span>
            </div>
          </NavLink>
          <AutoRefreshStatus />
          <button className="mobile-menu-btn" onClick={toggleMobileMenu} aria-label="Abrir menu">
            <Menu size={24} />
          </button>
        </header>

        <div className={`nav-overlay ${isMobileMenuOpen ? 'show' : ''}`} onClick={closeMobileMenu}></div>

        {showContextBar && (liveMatch || nextMatch) && (
          <div className={`context-bar glass ${liveMatch ? 'is-live' : 'is-next'}`}>
            <div className="context-left">
              <span className={`context-pill ${liveMatch ? 'live' : 'next'}`}>
                {liveMatch ? 'AO VIVO' : 'PROXIMO JOGO'}
              </span>
              <div className="context-main">
                <strong>
                  {(liveMatch || nextMatch)?.teams_a?.name || 'Equipe A'} x {(liveMatch || nextMatch)?.teams_b?.name || 'Equipe B'}
                </strong>
                <span>
                  {formatMatchDatetime((liveMatch || nextMatch)?.match_date)} · {(liveMatch || nextMatch)?.location || 'Local a definir'}
                </span>
              </div>
            </div>
            <div className="context-actions">
              <button
                className="context-btn"
                onClick={() => navigate('/jogos')}
              >
                Ver agenda
              </button>
            </div>
          </div>
        )}

        <main className="content" id="main-content">
          {children}
        </main>
        <footer className="footer">
          <p>&copy; 2026 Copa Unasp - Realização Unasp</p>
          <p className="developer-credit">Desenvolvido por <span className="dev-name">NEO LUCCA</span> e <span className="dev-name">ROBSON</span></p>
        </footer>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </div>
  );
};

export default Layout;
