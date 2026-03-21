import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Home, Trophy, BarChart2, Users, Settings, Timer, Sun, Moon, Menu, X, LogIn, User, LogOut, Calendar, Bell, BellOff } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useAuthContext } from '../../contexts/AuthContext';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { useTeams } from '../../hooks/useTeams';
import { useMatches } from '../../hooks/useMatches';
import { usePreGameReminder } from '../../hooks/usePreGameReminder';
import { AutoRefreshStatus } from '../AutoRefreshStatus/AutoRefreshStatus';
import AuthModal from '../Auth/AuthModal';
import IOSInstallPrompt from '../PWA/IOSInstallPrompt';
import logo from '../../assets/unasp_logo.png';
import { prefetchRouteIntent } from '../../lib/routePrefetch';
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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const showAdminNav = role === 'admin' || location.pathname.startsWith('/admin');

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
    closeMobileMenu();
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

  usePreGameReminder(matches, isSubscribed, {
    preGameReminder: preferences.preGameReminder,
    favoriteTeamId: preferences.favoriteTeamId,
  });

  return (
    <div className="app-container">
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
              className={`push-toggle ${isSubscribed ? 'subscribed' : ''}`} 
              onClick={isSubscribed ? unsubscribe : subscribe}
              title={isSubscribed ? 'Desativar Notificações' : 'Ativar Notificações'}
            >
              {isSubscribed ? <Bell size={20} color="var(--secondary)" /> : <BellOff size={20} />}
              <span>{isSubscribed ? 'Alertas Ativos' : 'Ativar Alertas'}</span>
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
                        {teams.map((team) => (
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

        <main className="content">
          {children}
        </main>
        <footer className="footer">
          <p>&copy; 2026 Copa Unasp - Realização Unasp</p>
          <p className="developer-credit">Desenvolvido por <span className="dev-name">Neo Lucca</span></p>
        </footer>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      <IOSInstallPrompt />
    </div>
  );
};

export default Layout;
