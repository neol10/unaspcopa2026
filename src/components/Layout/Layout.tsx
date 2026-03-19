import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Trophy, BarChart2, Users, Settings, Timer, Sun, Moon, Menu, X, LogIn, User, LogOut, Calendar, Bell, BellOff } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useAuthContext } from '../../contexts/AuthContext';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { AutoRefreshStatus } from '../AutoRefreshStatus/AutoRefreshStatus';
import AuthModal from '../Auth/AuthModal';
import IOSInstallPrompt from '../PWA/IOSInstallPrompt';
import logo from '../../assets/unasp_logo.png';
import './Layout.css';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, role, signOut } = useAuthContext();
  const { isSubscribed, subscribe, unsubscribe } = usePushNotifications();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
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

  return (
    <div className="app-container">
      <aside className={`sidebar glass ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
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
                <NavLink to="/" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={closeMobileMenu}>
                  <Home size={20} /> <span>Início</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/classificacao" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={closeMobileMenu}>
                  <Trophy size={20} /> <span>Classificação</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/rankings" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={closeMobileMenu}>
                  <BarChart2 size={20} /> <span>Rankings</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/equipes" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={closeMobileMenu}>
                  <Users size={20} /> <span>Equipes</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/central-da-partida" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={closeMobileMenu}>
                  <Timer size={20} /> <span>Central</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/jogos" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={closeMobileMenu}>
                  <Calendar size={20} /> <span>Jogos</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/jogadores" className={({ isActive }) => (isActive ? 'nav-active' : '')} onClick={closeMobileMenu}>
                  <Users size={20} /> <span>Jogadores</span>
                </NavLink>
              </li>
              {showAdminNav && (
                <li>
                  <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-active' : ''} onClick={closeMobileMenu}>
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
