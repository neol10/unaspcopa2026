import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Home, Trophy, BarChart2, Users, Settings, Timer, Sun, Moon, Menu, X, LogIn, User, LogOut, Calendar, Bell, BellOff, Image, Flag, ArrowRightLeft, Play } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useAuthContext } from '../../contexts/AuthContext';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { useTeams } from '../../hooks/useTeams';
import { useMatches, type Match } from '../../hooks/useMatches';
import { usePreGameReminder } from '../../hooks/usePreGameReminder';
import { AutoRefreshStatus } from '../AutoRefreshStatus/AutoRefreshStatus';
import AuthModal from '../Auth/AuthModal';
import { AnimatePresence, motion } from 'framer-motion';
import logo from '../../assets/unasp_logo.png';
import { prefetchRouteIntent } from '../../lib/routePrefetch';
import { emitGoalOverlay, onGoalOverlay, type GoalOverlayPayload } from '../../lib/goalOverlay';
import { supabase } from '../../lib/supabase';
import { useGroupCVisibility } from '../../hooks/useGroupCVisibility';
import FeedbackModal from '../Feedback/FeedbackModal';
import { useDivisionContext } from '../../contexts/DivisionContext';
import './Layout.css';

type ConfettiPiece = {
  key: number;
  initialX: number;
  leftPct: number;
  durationSec: number;
  color: string;
};

const hashToSeed = (input: string) => {
  // FNV-1a 32-bit
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const GoalOverlayLayer: React.FC<{ isAdminRoute: boolean; division: string }> = ({ isAdminRoute, division }) => {
  const [goalOverlay, setGoalOverlay] = useState<GoalOverlayPayload | null>(null);
  const torcidaAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastGoalOverlayRef = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });
  const hideTimeoutRef = useRef<number | null>(null);
  const [confettiSeed, setConfettiSeed] = useState(1);

  useEffect(() => {
    // Preload + unlock do áudio (mobile bloqueia autoplay sem gesto do usuário)
    const audio = new Audio('/audio/goal-crowd.mp3');
    audio.preload = 'auto';
    audio.volume = 0.8;
    torcidaAudioRef.current = audio;

    let unlocked = false;
    const tryUnlock = async () => {
      if (unlocked) return;
      unlocked = true;
      try {
        audio.muted = true;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      } catch {
        // Se falhar, tentamos de novo no próximo gesto
        unlocked = false;
      }
    };

    window.addEventListener('pointerdown', tryUnlock, { passive: true });
    window.addEventListener('keydown', tryUnlock);
    return () => {
      window.removeEventListener('pointerdown', tryUnlock);
      window.removeEventListener('keydown', tryUnlock);
    };
  }, []);

  useEffect(() => {
    const unsub = onGoalOverlay((payload) => {
      if (isAdminRoute) return;
      if (payload.division && payload.division !== division) return;

      const incomingId = typeof payload.id === 'string' && payload.id.length > 0 ? payload.id : null;
      if (incomingId) {
        const prev = lastGoalOverlayRef.current;
        const now = Date.now();
        if (prev.id === incomingId && now - prev.at < 3000) return;
        lastGoalOverlayRef.current = { id: incomingId, at: now };
      }

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([70, 30, 140]);
      }

      const goalAudio = torcidaAudioRef.current;
      if (goalAudio) {
        try {
          goalAudio.currentTime = 0;
        } catch {
          // ignore
        }
        goalAudio.play().catch((e) => console.warn('Audio auto-play blocked:', e));
      }

      setGoalOverlay(payload);
      // Seed determinística quando houver id, senão usa timestamp (no callback, não no render).
      setConfettiSeed(payload.id ? hashToSeed(payload.id) : (Date.now() >>> 0) || 1);

      if (hideTimeoutRef.current !== null) {
        window.clearTimeout(hideTimeoutRef.current);
      }
      hideTimeoutRef.current = window.setTimeout(() => setGoalOverlay(null), 5000);
    });

    return () => {
      if (hideTimeoutRef.current !== null) {
        window.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      unsub();
    };
  }, [isAdminRoute, division]);

  const confettiPieces = useMemo(() => {
    if (!goalOverlay) return [] as ConfettiPiece[];

    const rand = mulberry32(confettiSeed);
    // Gera 1x por overlay (determinístico, sem Math.random no render)
    return Array.from({ length: 14 }).map((_, i) => ({
      key: i,
      initialX: rand() * 400 - 200,
      leftPct: rand() * 100,
      durationSec: rand() * 2 + 1,
      color: i % 2 === 0 ? 'var(--secondary)' : 'var(--primary)',
    }));
  }, [goalOverlay, confettiSeed]);

  return (
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
                <motion.div
                  className="goal-player-photo"
                  initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 14, stiffness: 260 }}
                >
                  <img src={goalOverlay.playerPhotoUrl} alt={goalOverlay.player} loading="eager" decoding="async" />
                </motion.div>
              )}
            </div>
            <h1 className="goal-text">GOOOOOOOL!</h1>
            <div className="goal-details">
              <span className="goal-team">{goalOverlay.team}</span>
              <span className="goal-player">{goalOverlay.player}</span>
            </div>
          </motion.div>
          <div className="confetti-container">
            {confettiPieces.map((piece) => (
              <motion.div
                key={piece.key}
                className="confetti-piece"
                initial={{ y: -100, x: piece.initialX, opacity: 1 }}
                animate={{ y: 800, rotate: 360 }}
                transition={{ duration: piece.durationSec, repeat: Infinity }}
                style={{
                  backgroundColor: piece.color,
                  left: `${piece.leftPct}%`,
                }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, role, signOut } = useAuthContext();
  const { isSubscribed, subscribe, unsubscribe, preferences, updatePreferences } = usePushNotifications();
  const { division, label: divisionLabel, toggleDivision } = useDivisionContext();
  const { teams } = useTeams();
  const { visibility } = useGroupCVisibility();
  const { matches } = useMatches();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showPushPrefs, setShowPushPrefs] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [nowTs, setNowTs] = useState(0);
  const matchesByIdRef = useRef<Map<string, Match>>(new Map());
  const seenGoalEventIdsRef = useRef<Map<string, number>>(new Map());
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const pagePath = `${location.pathname}${location.search || ''}`;

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
    : visibility.favorite_team_menu
    ? teams
    : teams.filter((team) => !isTestGroup(team.group));

  const liveMatch = useMemo(() => (matches || []).find((m) => m.status === 'ao_vivo') || null, [matches]);
  const nextMatch = useMemo(() => {
    const upcoming = (matches || [])
      .filter((m) => m.status === 'agendado' && new Date(m.match_date).getTime() > nowTs)
      .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());
    return upcoming[0] || null;
  }, [matches, nowTs]);

  useEffect(() => {
    let cancelled = false;

    // Evita Date.now no render e também setState síncrono no effect.
    queueMicrotask(() => {
      if (cancelled) return;
      setNowTs(Date.now());
    });

    const id = window.setInterval(() => setNowTs(Date.now()), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const liveMatchIdsKey = useMemo(() => {
    const live = (matches || []).filter((m) => m.status === 'ao_vivo');
    const visible = isAdminUser || visibility.matches
      ? live
      : live.filter((m) => {
          const isTeamAGroupC = isTestGroup(m.teams_a?.group);
          const isTeamBGroupC = isTestGroup(m.teams_b?.group);
          return !isTeamAGroupC && !isTeamBGroupC;
        });
    return visible.map((m) => m.id).sort().join('|');
  }, [matches, isAdminUser, visibility.matches]);

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
    // Garantia extra: fecha o menu mobile e remove qualquer estado que bloqueie rolagem
    closeMobileMenu();
    document.body.classList.remove('nav-open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }, [location.pathname]);

  useEffect(() => {
    matchesByIdRef.current = new Map((matches || []).map((m) => [m.id, m] as const));
  }, [matches]);

  useEffect(() => {
    if (isAdminRoute) return;

    const ids = liveMatchIdsKey ? liveMatchIdsKey.split('|').filter(Boolean) : [];
    if (ids.length === 0) return;

    const cleanupSeen = () => {
      const now = Date.now();
      const seen = seenGoalEventIdsRef.current;
      for (const [id, ts] of seen) {
        if (now - ts > 5 * 60 * 1000) seen.delete(id);
      }
    };

    const channels = ids.map((matchId) =>
      supabase
        .channel(`public:match_events:goal_overlay:${matchId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` },
          (payload) => {
            type MatchEventInsertRow = {
              id?: unknown;
              event_type?: unknown;
              player_id?: unknown;
              assistant_id?: unknown;
              commentary?: unknown;
              metadata?: { goal_type?: unknown } | null;
            };

            const row = payload.new as MatchEventInsertRow;
            if (!row || typeof row.event_type !== 'string' || row.event_type !== 'gol') return;

            const eventId = typeof row.id === 'string' && row.id.length > 0 ? row.id : null;
            if (eventId) {
              cleanupSeen();
              if (seenGoalEventIdsRef.current.has(eventId)) return;
              seenGoalEventIdsRef.current.set(eventId, Date.now());
            }

            const match = matchesByIdRef.current.get(matchId);
            if (!match) return;

            const commentary = typeof row.commentary === 'string' ? row.commentary : '';
            const goalType = typeof row.metadata?.goal_type === 'string' ? row.metadata.goal_type : null;
            const isOwnGoal = goalType === 'contra' || commentary.toUpperCase().includes('[CONTRA]');

            const playerId = typeof row.player_id === 'string' && row.player_id.length > 0 ? row.player_id : null;
            if (!playerId) return;

            supabase
              .from('players')
              .select('id, name, photo_url, team_id')
              .eq('id', playerId)
              .maybeSingle()
              .then(({ data }) => {
                const playerName = String(data?.name || 'Atleta');
                const playerPhotoUrl = data?.photo_url || undefined;

                const teamAName = match.teams_a?.name || 'Equipe A';
                const teamBName = match.teams_b?.name || 'Equipe B';

                const playerTeamId = data?.team_id ? String(data.team_id) : null;
                const playerIsTeamA = playerTeamId ? playerTeamId === match.team_a_id : null;

                const creditedTeamName = playerIsTeamA === null
                  ? teamAName
                  : !isOwnGoal
                    ? (playerIsTeamA ? teamAName : teamBName)
                    : (playerIsTeamA ? teamBName : teamAName);

                emitGoalOverlay({
                  id: eventId || undefined,
                  team: creditedTeamName,
                  player: playerName,
                  playerPhotoUrl,
                  division,
                });
              });
          },
        )
        .subscribe()
    );

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [isAdminRoute, liveMatchIdsKey, division]);

  usePreGameReminder(matches, isSubscribed, {
    preGameReminder: preferences.preGameReminder,
    favoriteTeamId: preferences.favoriteTeamId,
  });

  return (
    <div className="app-container">
      <a className="skip-link" href="#main-content">Pular para o conteudo</a>
      {/* Global Premium Goal Overlay */}
      <GoalOverlayLayer isAdminRoute={isAdminRoute} division={division} />

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

          <button
            className={`division-toggle ${division === 'feminino' ? 'is-feminino' : 'is-masculino'}`}
            type="button"
            onClick={() => {
              toggleDivision();
              closeMobileMenu();
            }}
            aria-label={`Alternar categoria (atual: ${divisionLabel})`}
            title={`Categoria atual: ${divisionLabel}`}
          >
            <ArrowRightLeft size={18} />
            <span>Categoria: {divisionLabel}</span>
          </button>

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
              <li>
                <NavLink to="/live" className={({ isActive }) => (isActive ? 'nav-active' : '')} onClick={closeMobileMenu} {...navIntentHandlers('/live')}>
                  <Play size={20} /> <span>LIVE</span>
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

            <button
              className="theme-toggle"
              type="button"
              onClick={() => {
                setShowFeedbackModal(true);
                closeMobileMenu();
              }}
              aria-label="Reportar problema ou melhoria"
            >
              <Flag size={20} />
              <span>Reportar</span>
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

        <div
          className={`nav-overlay ${isMobileMenuOpen ? 'show' : ''}`}
          onClick={closeMobileMenu}
          aria-hidden={!isMobileMenuOpen}
        ></div>

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
          <p className="footer-social">
            <a href="https://www.instagram.com/neo_lucca10/" target="_blank" rel="noreferrer noopener" aria-label="Instagram de Neo Lucca">
              <span className="instagram-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7.75 2h8.5A5.75 5.75 0 0122 7.75v8.5A5.75 5.75 0 0116.25 22h-8.5A5.75 5.75 0 012 16.25v-8.5A5.75 5.75 0 017.75 2zm0 1.5A4.25 4.25 0 003.5 7.75v8.5A4.25 4.25 0 007.75 20.5h8.5a4.25 4.25 0 004.25-4.25v-8.5A4.25 4.25 0 0016.25 3.5h-8.5zm8.5 2a1 1 0 110 2 1 1 0 010-2zm-4.25 1.25a5 5 0 110 10 5 5 0 010-10zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" />
                </svg>
              </span>
              <span>instagram.com/neo_lucca10</span>
            </a>
          </p>
        </footer>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      <FeedbackModal
        open={showFeedbackModal}
        pagePath={pagePath}
        onClose={() => setShowFeedbackModal(false)}
      />
    </div>
  );
};

export default Layout;
