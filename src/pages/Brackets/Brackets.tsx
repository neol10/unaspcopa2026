import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatches, Match } from '../../hooks/useMatches';
import { useAuthContext } from '../../contexts/AuthContext';
import { useGroupCVisibility } from '../../hooks/useGroupCVisibility';
import { useTournamentConfig } from '../../hooks/useTournamentConfig';
import { KNOCKOUT_ROUND_LABELS } from '../../lib/tournamentRules';
import { deriveMatchStatus } from '../../lib/matchStatus';
import { splitLocationCourt } from '../../lib/court';
import { Trophy, ChevronRight, ChevronLeft, Target, Timer, ZoomIn, ZoomOut } from 'lucide-react';
import './Brackets.css';

const Brackets: React.FC = () => {
  const { matches, loading, error, refresh } = useMatches();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const teiaContentRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const dragMovedRef = useRef(false);
  const containerLeftRef = useRef(0);
  const dragFrameRef = useRef<number | null>(null);
  const lastDragXRef = useRef(0);
  const touchIntentRef = useRef<'unknown' | 'horizontal' | 'vertical'>('unknown');
  const lastPointerTypeRef = useRef<'mouse' | 'touch' | 'pen' | 'unknown'>('unknown');
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchMaxDistanceRef = useRef(0);
  const [activeFilter, setActiveFilter] = useState<'all' | 'live' | 'today' | 'favorite'>('all');
  const [favoriteTeamId] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem('copa_unasp_push_preferences_v1');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { favoriteTeamId?: string | null };
      return parsed.favoriteTeamId || null;
    } catch {
      return null;
    }
  });
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const viewModeTouchedRef = useRef(false);
  const teiaApplyFrameRef = useRef<number | null>(null);
  const teiaWheelCommitRef = useRef<number | null>(null);
  const wheelTargetLeftRef = useRef<number | null>(null);
  const wheelAnimFrameRef = useRef<number | null>(null);

  const { config } = useTournamentConfig();
  const [hasScrolled, setHasScrolled] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'teia'>('list');
  const [selectedKnockoutRound, setSelectedKnockoutRound] = useState<string>('');

  const applyTeiaTransform = useCallback(() => {
    if (!teiaContentRef.current) return;
    const { x, y } = panRef.current;
    const z = zoomRef.current;
    teiaContentRef.current.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  }, []);

  const scheduleApplyTeiaTransform = useCallback(() => {
    if (teiaApplyFrameRef.current !== null) return;
    teiaApplyFrameRef.current = window.requestAnimationFrame(() => {
      teiaApplyFrameRef.current = null;
      applyTeiaTransform();
    });
  }, [applyTeiaTransform]);

  useEffect(() => {
    zoomRef.current = zoom;
    panRef.current = pan;
    if (viewMode === 'teia') {
      applyTeiaTransform();
    }
  }, [zoom, pan, viewMode, applyTeiaTransform]);

  useEffect(() => {
    return () => {
      if (teiaApplyFrameRef.current !== null) {
        window.cancelAnimationFrame(teiaApplyFrameRef.current);
        teiaApplyFrameRef.current = null;
      }
      if (teiaWheelCommitRef.current !== null) {
        window.clearTimeout(teiaWheelCommitRef.current);
        teiaWheelCommitRef.current = null;
      }
      if (wheelAnimFrameRef.current !== null) {
        window.cancelAnimationFrame(wheelAnimFrameRef.current);
        wheelAnimFrameRef.current = null;
      }
      wheelTargetLeftRef.current = null;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!loading) {
      queueMicrotask(() => {
        if (cancelled) return;
        setStuck(false);
      });
      return () => {
        cancelled = true;
      };
    }

    const id = window.setTimeout(() => setStuck(true), 15000);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [loading]);

  const { role } = useAuthContext();
  const isAdmin = role === 'admin';
  const { visibility } = useGroupCVisibility();

  const isTestGroup = (groupName?: string | null) => {
    const clean = (groupName || '').trim().toUpperCase().replace(/\s+/g, '');
    return clean === 'C' || clean === 'GRUPOC';
  };

  const baseMatches = useMemo(() => {
    if (isAdmin || visibility.matches) return matches;
    return matches.filter(m => {
      const isTeamAGroupC = isTestGroup(m.teams_a?.group);
      const isTeamBGroupC = isTestGroup(m.teams_b?.group);
      return !isTeamAGroupC && !isTeamBGroupC;
    });
  }, [matches, isAdmin, visibility.matches]);

  const filteredMatches = useMemo(() => {
    if (activeFilter === 'all') return baseMatches;

    if (activeFilter === 'live') {
      return baseMatches.filter((m) => deriveMatchStatus(m, nowTs) === 'ao_vivo');
    }

    if (activeFilter === 'today') {
      return baseMatches.filter((m) => {
        const date = new Date(m.match_date);
        const now = new Date();
        return date.toDateString() === now.toDateString();
      });
    }

    if (activeFilter === 'favorite' && favoriteTeamId) {
      return baseMatches.filter((m) => m.team_a_id === favoriteTeamId || m.team_b_id === favoriteTeamId);
    }

    return baseMatches;
  }, [activeFilter, favoriteTeamId, baseMatches, nowTs]);

  const sortMatches = useCallback((list: Match[]) => {
    const statusRank = (m: Match) => {
      const effective = deriveMatchStatus(m, nowTs);
      if (effective === 'ao_vivo') return 0;
      if (effective === 'agendado') return 1;
      return 2;
    };

    return [...list].sort((a, b) => {
      const rankDiff = statusRank(a) - statusRank(b);
      if (rankDiff !== 0) return rankDiff;
      return new Date(a.match_date).getTime() - new Date(b.match_date).getTime();
    });
  }, [nowTs]);

  const groupUnit = config?.group_unit === 'round' ? 'round' : 'night';

  const getRoundKey = useCallback((round: number) => KNOCKOUT_ROUND_LABELS[round] || String(round), []);

  const toPhaseIdKey = useCallback((value: string) => {
    return value
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }, []);

  const PHASE_SCROLL_OFFSET_PX = 64;

  const scrollToPhase = useCallback((phase: string) => {
    const container = scrollRef.current;
    if (!container) return;

    const element = document.getElementById(`phase-${toPhaseIdKey(phase)}`);
    if (!element) return;

    const offset = element.offsetLeft - PHASE_SCROLL_OFFSET_PX;
    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    const clampedLeft = Math.min(Math.max(0, offset), Math.max(0, maxScrollLeft));

    const behavior: ScrollBehavior =
      typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth';

    container.scrollTo({ left: clampedLeft, behavior });
  }, [toPhaseIdKey]);

  const getListGroupKey = useCallback((m: Match) => {
    const roundCode = m.round ?? 0;
    if (roundCode >= 1000) return getRoundKey(roundCode);

    if (groupUnit === 'round') {
      if (roundCode) return `rodada-${roundCode}`;
      return 'rodada-sem';
    }

    if (m.night !== null && m.night !== undefined) return `noite-${m.night}`;
    return 'noite-sem';
  }, [getRoundKey, groupUnit]);

  // Agrupa partidas por Noite/Rodada (fase de grupos) e por Fase/Rodada (mata-mata)
  const roundsMap = useMemo(() => {
    return filteredMatches.reduce((acc, m) => {
      const key = getListGroupKey(m);
      if (!acc[key]) acc[key] = [];
      acc[key].push(m);
      return acc;
    }, {} as Record<string, Match[]>);
  }, [filteredMatches, getListGroupKey]);

  const sortedRounds = useMemo(() => {
    const parseGroupKey = (key: string) => {
      if (key === 'noite-sem') return { unit: 'night' as const, value: null as number | null };
      if (key.startsWith('noite-')) {
        const n = Number(key.replace('noite-', '').trim());
        return { unit: 'night' as const, value: Number.isFinite(n) ? n : null };
      }
      if (key === 'rodada-sem') return { unit: 'round' as const, value: null as number | null };
      if (key.startsWith('rodada-')) {
        const n = Number(key.replace('rodada-', '').trim());
        return { unit: 'round' as const, value: Number.isFinite(n) ? n : null };
      }
      return null;
    };

    return Object.keys(roundsMap).sort((a, b) => {
      const ga = parseGroupKey(a);
      const gb = parseGroupKey(b);

      // Para fase de grupos, ordena por número (Noite/Rodada) para evitar inversão por data.
      if (ga && gb) {
        if (ga.value === null && gb.value === null) return 0;
        if (ga.value === null) return 1;
        if (gb.value === null) return -1;
        return ga.value - gb.value;
      }

      const dateA = new Date(roundsMap[a][0].match_date).getTime();
      const dateB = new Date(roundsMap[b][0].match_date).getTime();
      return dateA - dateB;
    });
  }, [roundsMap]);

  // Auto-scroll para a unidade atual (fase de grupos) ou fase atual (mata-mata)
  useEffect(() => {
    if (!loading && matches.length > 0 && config && !hasScrolled) {
      const timer = setTimeout(() => {
        let targetPhaseKey = '';
        if (config.current_phase === 'grupos') {
          if (groupUnit === 'round') {
            const targetMatch =
              filteredMatches.find((m) => (m.round ?? 0) < 1000 && (m.round ?? 0) === config.current_round) || null;
            targetPhaseKey = targetMatch ? getListGroupKey(targetMatch) : `rodada-${config.current_round}`;
          } else {
            const targetMatch = filteredMatches.find((m) => (m.night ?? null) === config.current_round) || null;
            targetPhaseKey = targetMatch ? getListGroupKey(targetMatch) : `noite-${config.current_round}`;
          }
        } else {
          // Busca nos rounds carregados um que contenha a fase atual
          const targetRound = sortedRounds.find(r => 
            r.toLowerCase().includes(config.current_phase.toLowerCase()) ||
            (config.current_phase === 'semifinal' && r.toLowerCase().includes('semi'))
          );
          if (targetRound) {
            targetPhaseKey = targetRound;
          }
        }

        if (targetPhaseKey) {
          scrollToPhase(targetPhaseKey);
          setHasScrolled(true);
        }
      }, 500); 
      return () => clearTimeout(timer);
    }
  }, [loading, matches, config, hasScrolled, sortedRounds, filteredMatches, groupUnit, getListGroupKey, scrollToPhase]);

  const formatRoundName = (name: string) => {
    if (name.startsWith('rodada-')) {
      const n = name.replace('rodada-', '').trim();
      return n ? `Rodada ${n}` : 'Rodada';
    }
    if (name === 'rodada-sem') return 'Sem Rodada';
    if (name.startsWith('noite-')) {
      const n = name.replace('noite-', '').trim();
      return n ? `Noite ${n}` : 'Noite';
    }
    if (name === 'noite-sem') return 'Sem Noite';
    if (/^\d+$/.test(name)) {
      const n = Number(name);
      if (Number.isFinite(n) && n >= 1000) return `Fase ${name}`;
      return `${name}ª Rodada`;
    }
    if (name.toLowerCase().includes('rodada')) return name;
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  // Distinguir entre Fase de Grupos e Mata-Mata com suporte aos codigos do admin
  const finalPhases = useMemo(() => ['oitavas', 'oitava', 'quartas', 'semis', 'semi', 'final', 'decisão', 'terceiro', '3o'], []);
  const isKnockoutRoundName = useCallback((roundName: string) => {
    const lower = roundName.toLowerCase();
    return finalPhases.some((p) => lower.includes(p));
  }, [finalPhases]);
  
  const knockoutRounds = useMemo(() => {
    const rounds = sortedRounds.filter((r) => isKnockoutRoundName(r));

    const roundOrder = (name: string) => {
      const lower = name.toLowerCase();
      if (lower.includes('oitav')) return 0;
      if (lower.includes('quart')) return 1;
      if (lower.includes('semi')) return 2;
      if (lower.includes('final') && !lower.includes('3')) return 3;
      if (lower.includes('3o') || lower.includes('terceiro')) return 4;
      return 99;
    };

    return [...rounds].sort((a, b) => {
      const orderDiff = roundOrder(a) - roundOrder(b);
      if (orderDiff !== 0) return orderDiff;
      return a.localeCompare(b);
    });
  }, [sortedRounds, isKnockoutRoundName]);

  const shouldUsePhaseSelector = useMemo(() => {
    return config.current_phase !== 'grupos' && knockoutRounds.length > 0;
  }, [config.current_phase, knockoutRounds.length]);

  const defaultKnockoutRound = useMemo(() => {
    if (knockoutRounds.length === 0) return '';

    const phase = (config.current_phase || '').toLowerCase();
    const needle =
      phase === 'semifinal' ? 'semi' :
      phase === 'oitavas' ? 'oitav' :
      phase === 'quartas' ? 'quart' :
      phase === 'final' ? 'final' :
      '';

    const found = needle
      ? knockoutRounds.find((r) => r.toLowerCase().includes(needle))
      : null;

    return found || knockoutRounds[0];
  }, [config.current_phase, knockoutRounds]);

  useEffect(() => {
    if (!shouldUsePhaseSelector) return;
    queueMicrotask(() => {
      setSelectedKnockoutRound((prev) => {
        if (!prev) return defaultKnockoutRound;
        if (!knockoutRounds.includes(prev)) return defaultKnockoutRound;
        return prev;
      });
    });
  }, [shouldUsePhaseSelector, defaultKnockoutRound, knockoutRounds]);

  const groupRounds = useMemo(() => {
    return sortedRounds.filter((r) => !isKnockoutRoundName(r));
  }, [sortedRounds, isKnockoutRoundName]);

  const hasKnockout = useMemo(() => {
    if (knockoutRounds.length > 0) return true;
    return filteredMatches.some((m) => (m.round ?? 0) >= 1000);
  }, [knockoutRounds, filteredMatches]);

  useEffect(() => {
    let cancelled = false;
    if (hasKnockout) {
      viewModeTouchedRef.current = true;
      queueMicrotask(() => {
        if (cancelled) return;
        setViewMode('teia');
      });
      return () => {
        cancelled = true;
      };
    }
    if (viewModeTouchedRef.current) return;
    queueMicrotask(() => {
      if (cancelled) return;
      setViewMode('list');
    });
    return () => {
      cancelled = true;
    };
  }, [hasKnockout]);

  const teiaColumns = useMemo(() => {
    return knockoutRounds.map((roundName) => ({
      roundName,
      matches: sortMatches(roundsMap[roundName] || []),
    }));
  }, [knockoutRounds, roundsMap, sortMatches]);

  const visibleTeiaColumns = useMemo(() => {
    if (!shouldUsePhaseSelector) return teiaColumns;
    if (!selectedKnockoutRound) return teiaColumns;
    return teiaColumns.filter((c) => c.roundName === selectedKnockoutRound);
  }, [shouldUsePhaseSelector, selectedKnockoutRound, teiaColumns]);

  const scheduleSummary = useMemo(() => {
    const now = new Date();
    const today = now.toDateString();
    const liveCount = matches.filter((m) => deriveMatchStatus(m, now.getTime()) === 'ao_vivo').length;
    const todayCount = matches.filter((m) => new Date(m.match_date).toDateString() === today).length;
    const upcoming = matches
      .filter((m) => m.status === 'agendado' && new Date(m.match_date).getTime() > now.getTime())
      .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());

    return {
      liveCount,
      todayCount,
      upcomingCount: upcoming.length,
      nextMatch: upcoming[0] || null,
    };
  }, [matches]);

  // Lógica de Mouse Drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    cancelWheelAnimation();
    setIsPointerDown(true);
    setIsDragging(false);
    dragMovedRef.current = false;
    touchIntentRef.current = 'unknown';
    // Usamos pageX, então precisamos do left em coordenadas de página (viewport + scrollX).
    containerLeftRef.current = scrollRef.current.getBoundingClientRect().left + window.scrollX;
    startXRef.current = e.pageX - containerLeftRef.current;
    startYRef.current = e.pageY;
    scrollLeftRef.current = scrollRef.current.scrollLeft;
  };

  const handleDragEnd = () => {
    const shouldSnap = viewMode === 'list' && dragMovedRef.current;

    setIsPointerDown(false);
    setIsDragging(false);
    touchIntentRef.current = 'unknown';
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }

    if (shouldSnap) {
      cancelWheelAnimation();
      window.requestAnimationFrame(() => {
        snapToNearestListItem();
      });
    }

    if (dragMovedRef.current) {
      window.setTimeout(() => {
        dragMovedRef.current = false;
      }, 0);
    } else {
      dragMovedRef.current = false;
    }
  };

  const handleDragMove = (pageX: number) => {
    if (!isPointerDown || !scrollRef.current) return;
    lastDragXRef.current = pageX;
    if (dragFrameRef.current !== null) return;

    dragFrameRef.current = window.requestAnimationFrame(() => {
      if (!scrollRef.current) {
        dragFrameRef.current = null;
        return;
      }
      const x = lastDragXRef.current - containerLeftRef.current;
      const walk = (x - startXRef.current) * 1.8;
      scrollRef.current.scrollLeft = scrollLeftRef.current - walk;
      dragFrameRef.current = null;
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPointerDown || !scrollRef.current) return;
    // Precisa ser consistente com handleMouseDown (pageX - containerLeftRef).
    const x = e.pageX - containerLeftRef.current;
    const delta = x - startXRef.current;
    const exceededThreshold = Math.abs(delta) > 6;
    if (exceededThreshold && !dragMovedRef.current) {
      dragMovedRef.current = true;
    }
    if (exceededThreshold && !isDragging) {
      setIsDragging(true);
    }

    if (exceededThreshold) {
      e.preventDefault();
      handleDragMove(e.pageX);
    }
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;

    lastPointerTypeRef.current = (e.pointerType === 'mouse' || e.pointerType === 'touch' || e.pointerType === 'pen')
      ? e.pointerType
      : 'unknown';

    if (viewMode === 'teia') {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setIsPointerDown(true);
      setIsDragging(false);
      dragMovedRef.current = false;
      if (pointersRef.current.size === 1) {
        const currentPan = panRef.current;
        panStartRef.current = { x: e.clientX, y: e.clientY, panX: currentPan.x, panY: currentPan.y };
      }
      if (pointersRef.current.size === 2) {
        const [p1, p2] = Array.from(pointersRef.current.values());
        const distance = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
        pinchStartRef.current = { distance, zoom: zoomRef.current };
      }
      return;
    }

    if (e.pointerType === 'touch') {
      // Touch (lista): só vira "drag" quando o gesto for horizontal.
      cancelWheelAnimation();
      setIsPointerDown(true);
      setIsDragging(false);
      dragMovedRef.current = false;
      touchIntentRef.current = 'unknown';
      touchStartRef.current = { x: e.pageX, y: e.pageY };
      touchMaxDistanceRef.current = 0;
      // Usamos pageX, então precisamos do left em coordenadas de página (viewport + scrollX).
      containerLeftRef.current = scrollRef.current.getBoundingClientRect().left + window.scrollX;
      startXRef.current = e.pageX - containerLeftRef.current;
      startYRef.current = e.pageY;
      scrollLeftRef.current = scrollRef.current.scrollLeft;
      return;
    }
    handleMouseDown(e as unknown as React.MouseEvent);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (viewMode === 'teia') {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pointers = Array.from(pointersRef.current.values());
      if (pointers.length >= 2 && pinchStartRef.current) {
        e.preventDefault();
        const [p1, p2] = pointers;
        const distance = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
        const nextZoom = clamp((pinchStartRef.current.zoom * distance) / pinchStartRef.current.distance, 0.6, 2.2);
        zoomRef.current = nextZoom;
        scheduleApplyTeiaTransform();
        dragMovedRef.current = true;
        if (!isDragging) setIsDragging(true);
        return;
      }
      if (!panStartRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      const exceededThreshold = Math.abs(dx) + Math.abs(dy) > 6;
      if (exceededThreshold && !dragMovedRef.current) {
        dragMovedRef.current = true;
      }
      if (exceededThreshold && !isDragging) {
        setIsDragging(true);
      }
      if (exceededThreshold) {
        e.preventDefault();
      }
      panRef.current = { x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy };
      scheduleApplyTeiaTransform();
      return;
    }

    if (e.pointerType === 'touch') {
      if (!scrollRef.current) return;
      if (!isPointerDown) return;

      if (touchStartRef.current) {
        const tdx = e.pageX - touchStartRef.current.x;
        const tdy = e.pageY - touchStartRef.current.y;
        const dist = Math.hypot(tdx, tdy);
        if (dist > touchMaxDistanceRef.current) touchMaxDistanceRef.current = dist;
      }

      const dx = e.pageX - containerLeftRef.current - startXRef.current;
      const dy = e.pageY - startYRef.current;
      const exceededThreshold = Math.abs(dx) + Math.abs(dy) > 14;

      if (touchIntentRef.current === 'unknown' && exceededThreshold) {
        touchIntentRef.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      }

      if (touchIntentRef.current !== 'horizontal') {
        return;
      }

      dragMovedRef.current = true;
      if (!isDragging) setIsDragging(true);
      e.preventDefault();
      handleDragMove(e.pageX);
      return;
    }
    handleMouseMove(e as unknown as React.MouseEvent);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (viewMode === 'teia') {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) {
        pinchStartRef.current = null;
      }
      if (pointersRef.current.size === 1) {
        const [remaining] = Array.from(pointersRef.current.values());
        const currentPan = panRef.current;
        panStartRef.current = { x: remaining.x, y: remaining.y, panX: currentPan.x, panY: currentPan.y };
      }
      if (pointersRef.current.size === 0) {
        panStartRef.current = null;
      }

      // Comitar estado apenas no fim do gesto (evita re-render durante drag/pinch)
      setZoom(zoomRef.current);
      setPan(panRef.current);

      setIsPointerDown(false);
      setIsDragging(false);
      if (dragMovedRef.current) {
        window.setTimeout(() => {
          dragMovedRef.current = false;
        }, 0);
      }
      return;
    }

    if (e.pointerType === 'touch') {
      handleDragEnd();
      return;
    }
    handleDragEnd();
  };

  const cancelWheelAnimation = () => {
    if (wheelAnimFrameRef.current !== null) {
      window.cancelAnimationFrame(wheelAnimFrameRef.current);
      wheelAnimFrameRef.current = null;
    }
    wheelTargetLeftRef.current = null;
  };

  const startWheelAnimationIfNeeded = () => {
    if (wheelAnimFrameRef.current !== null) return;

    const tick = () => {
      const container = scrollRef.current;
      const target = wheelTargetLeftRef.current;
      if (!container || target === null) {
        wheelAnimFrameRef.current = null;
        return;
      }

      const current = container.scrollLeft;
      const next = current + (target - current) * 0.22;
      container.scrollLeft = next;

      if (Math.abs(target - next) < 0.5) {
        container.scrollLeft = target;
        wheelAnimFrameRef.current = null;
        return;
      }

      wheelAnimFrameRef.current = window.requestAnimationFrame(tick);
    };

    wheelAnimFrameRef.current = window.requestAnimationFrame(tick);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (viewMode === 'teia') {
      e.preventDefault();
      const delta = -e.deltaY * 0.0006;
      zoomRef.current = clamp(zoomRef.current + delta, 0.8, 1.6);
      scheduleApplyTeiaTransform();

      if (teiaWheelCommitRef.current !== null) {
        window.clearTimeout(teiaWheelCommitRef.current);
      }
      teiaWheelCommitRef.current = window.setTimeout(() => {
        teiaWheelCommitRef.current = null;
        setZoom(zoomRef.current);
        setPan(panRef.current);
      }, 120);
      return;
    }

    // Lista (/jogos): navegação com "inércia" (fica menos estático do que setar scrollLeft seco).
    if (isPointerDown) return;

    const container = scrollRef.current;
    if (!container) return;
    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    if (maxScrollLeft <= 0) return;

    const primaryDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const base = wheelTargetLeftRef.current ?? container.scrollLeft;
    const target = clamp(base + primaryDelta, 0, maxScrollLeft);

    if (Math.abs(target - base) > 0.5) {
      e.preventDefault();
      wheelTargetLeftRef.current = target;
      startWheelAnimationIfNeeded();
    }
  };

  const getScrollBehavior = (): ScrollBehavior => {
    if (typeof window === 'undefined' || !window.matchMedia) return 'smooth';
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  };

  const getListSnapLefts = () => {
    const container = scrollRef.current;
    if (!container) return [] as number[];

    const items = container.querySelectorAll<HTMLElement>(
      '.brackets-scroll-content > .knockout-cta, .brackets-scroll-content > .bracket-round',
    );

    const lefts = Array.from(items)
      .map((el) => el.offsetLeft - PHASE_SCROLL_OFFSET_PX)
      .filter((n) => Number.isFinite(n));

    lefts.sort((a, b) => a - b);

    // Remove duplicados (pode acontecer em alguns layouts/resizes).
    return lefts.filter((v, idx) => idx === 0 || Math.abs(v - lefts[idx - 1]) > 0.5);
  };

  const scrollListToLeft = (left: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    if (maxScrollLeft <= 0) return;

    cancelWheelAnimation();

    const clampedLeft = clamp(left, 0, maxScrollLeft);
    container.scrollTo({ left: clampedLeft, behavior: getScrollBehavior() });
  };

  const snapToNearestListItem = () => {
    const container = scrollRef.current;
    if (!container) return;
    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    if (maxScrollLeft <= 0) return;

    const snapLefts = getListSnapLefts();
    if (snapLefts.length === 0) return;

    const current = container.scrollLeft;
    let best = snapLefts[0];
    for (const candidate of snapLefts) {
      if (Math.abs(candidate - current) < Math.abs(best - current)) best = candidate;
    }

    scrollListToLeft(best);
  };

  const scrollListByOne = (dir: -1 | 1) => {
    const container = scrollRef.current;
    if (!container) return;
    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    if (maxScrollLeft <= 0) return;

    const snapLefts = getListSnapLefts();
    if (snapLefts.length === 0) return;

    const current = container.scrollLeft;
    let closestIdx = 0;
    for (let i = 1; i < snapLefts.length; i++) {
      if (Math.abs(snapLefts[i] - current) < Math.abs(snapLefts[closestIdx] - current)) {
        closestIdx = i;
      }
    }

    const nextIdx = clamp(closestIdx + dir, 0, snapLefts.length - 1);
    scrollListToLeft(snapLefts[nextIdx]);
  };

  const MatchSkeleton = () => (
    <div className="match-skeleton">
      <div className="skeleton-item skeleton-date"></div>
      <div className="skeleton-row">
        <div className="skeleton-team">
          <div className="skeleton-item skeleton-badge"></div>
          <div className="skeleton-item skeleton-name"></div>
        </div>
        <div className="skeleton-item skeleton-score"></div>
      </div>
      <div className="skeleton-row">
        <div className="skeleton-team">
          <div className="skeleton-item skeleton-badge"></div>
          <div className="skeleton-item skeleton-name"></div>
        </div>
        <div className="skeleton-item skeleton-score"></div>
      </div>
    </div>
  );

  const RoundSkeleton = () => (
    <div className="bracket-round">
      <div className="skeleton-item" style={{ height: '24px', width: '60%', marginBottom: '1rem' }}></div>
      <div className="round-matches">
        {[1, 2, 3, 4].map(i => <MatchSkeleton key={i} />)}
      </div>
    </div>
  );

  const getCountdownLabel = (matchDate: string) => {
    const diff = new Date(matchDate).getTime() - nowTs;
    if (diff <= 0) return 'Começa agora';
    const totalMinutes = Math.floor(diff / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `Começa em ${hours}h ${minutes}m`;
    return `Começa em ${minutes}m`;
  };

  const getLiveMinutes = (match: Match) => {
    if (!match.timer_started_at) return Math.floor((match.timer_offset_seconds || 0) / 60);
    const start = new Date(match.timer_started_at).getTime();
    const diff = Math.max(0, Math.floor((nowTs - start) / 1000));
    const totalSeconds = (match.timer_offset_seconds || 0) + diff;
    return Math.floor(totalSeconds / 60);
  };

  const MatchBox: React.FC<{ match: Match; isKnockout?: boolean }> = ({ match, isKnockout }) => {
    const effectiveStatus = deriveMatchStatus(match, nowTs);
    const isLive = effectiveStatus === 'ao_vivo';
    const isFinished = effectiveStatus === 'finalizado';
    const isTeamAWinner = isFinished && match.team_a_score > match.team_b_score;
    const isTeamBWinner = isFinished && match.team_b_score > match.team_a_score;
    const liveMinutes = isLive ? getLiveMinutes(match) : null;
    const countdown = effectiveStatus === 'agendado' ? getCountdownLabel(match.match_date) : null;

    const outcomeLabel = isFinished
      ? (isTeamAWinner
          ? `Vencedor: ${match.teams_a?.name || 'Equipe A'}`
          : isTeamBWinner
            ? `Vencedor: ${match.teams_b?.name || 'Equipe B'}`
            : 'Resultado: Empate')
      : null;

    const getStatusLabel = () => {
      if (isLive) return <span className="live-badge-mini">AO VIVO</span>;
      if (isFinished) return <span className="finished-label">FIM</span>;
      return <span className="scheduled-label">PREVISTO</span>;
    };

    // Em "Jogos", o usuário espera abrir qualquer partida para ver detalhes.
    // A Central da Partida lida com jogos agendados normalmente (via ?id=...).
    const isClickable = Boolean(match.id);

    const openMatch = () => {
      if (!isClickable) return;

      // Em mobile, um tap pode ter micro-movimento e acabar marcado como "drag".
      // Permitimos abrir se foi touch e o deslocamento total ficou pequeno.
      if (dragMovedRef.current) {
        const isTouch = lastPointerTypeRef.current === 'touch';
        const isLikelyTap = isTouch && touchMaxDistanceRef.current <= 12;
        if (!isLikelyTap) return;
      }
      navigate({ pathname: '/central-da-partida', search: `?id=${encodeURIComponent(match.id)}` });
    };

    return (
      <div
        className={`bracket-match ${isKnockout ? 'knockout-item' : ''} ${isLive ? 'is-live' : ''} ${isClickable ? 'is-clickable' : ''}`}
        onClick={isClickable ? openMatch : undefined}
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : -1}
        aria-label={`${isFinished ? 'Abrir resultado' : isLive ? 'Abrir partida' : 'Partida'} ${match.teams_a?.name || 'Equipe A'} x ${match.teams_b?.name || 'Equipe B'}`}
        onKeyDown={(e) => {
          if (!isClickable) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openMatch();
          }
        }}
      >
        <div className={`match-box glass ${isClickable ? 'clickable-match' : ''}`}>
          <div className={`match-status-bar status-${effectiveStatus}`}></div>
          <div className="match-header-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem', alignItems: 'center' }}>
            <div className="match-time-tiny" style={{ marginBottom: 0 }}>
              {new Date(match.match_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} • {new Date(match.match_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
            {getStatusLabel()}
          </div>

          <div className="match-preview">
            {(() => {
              const { base, court } = splitLocationCourt(match.location);
              const displayCourt = court || 'QUADRA 1';
              const label = `${base || match.location || 'Ginásio Principal'} • ${displayCourt}`;
              return <span className="match-meta">{label}</span>;
            })()}
            {(() => {
              const round = match.round ?? 0;
              if (round >= 1000) {
                return <span className="match-meta match-round-chip">{KNOCKOUT_ROUND_LABELS[round] || `Fase ${round}`}</span>;
              }
              if (groupUnit === 'night' && match.night !== null && match.night !== undefined) {
                return <span className="match-meta match-round-chip">Noite {match.night}</span>;
              }
              if (groupUnit === 'round' && round > 0) {
                return <span className="match-meta match-round-chip">Rodada {round}</span>;
              }
              return null;
            })()}
            <span className="match-meta">{effectiveStatus === 'agendado' && countdown ? countdown : effectiveStatus === 'ao_vivo' && liveMinutes !== null ? `${liveMinutes}' em andamento` : outcomeLabel || 'Partida encerrada'}</span>
          </div>

          <div className="match-mini-timeline">
            {effectiveStatus === 'ao_vivo' && (
              <>
                <span className="timeline-chip live">AO VIVO</span>
                <span className="timeline-chip">Min {liveMinutes ?? 0}</span>
              </>
            )}
            {effectiveStatus === 'agendado' && countdown && (
              <>
                <span className="timeline-chip soon">EM BREVE</span>
                <span className="timeline-chip subtle">{countdown}</span>
              </>
            )}
            {effectiveStatus === 'finalizado' && (
              <>
                <span className="timeline-chip final">ENCERRADO</span>
                <span className="timeline-chip subtle">Placar final</span>
                {!isTeamAWinner && !isTeamBWinner && (
                  <span className="timeline-chip draw">EMPATE</span>
                )}
              </>
            )}
          </div>
          
          <div className={`match-team ${isTeamAWinner ? 'winner' : ''}`}>
            <div className="team-info">
              {match.teams_a?.badge_url ? (
                <img 
                  src={match.teams_a.badge_url} 
                  alt="" 
                  className="team-badge-mini" 
                  width="28" 
                  height="28" 
                  loading="lazy" 
                  decoding="async"
                />
              ) : <div className="team-badge-mini" style={{width: 28, height: 28, background: 'rgba(255,255,255,0.05)', borderRadius: '50%'}}></div>}
              <span className="team-name">{match.teams_a?.name || 'A definir'}</span>
              {isTeamAWinner && (
                <span className="winner-pill" title="Vencedor">
                  <Trophy size={12} />
                  Venceu
                </span>
              )}
            </div>
            <div className="team-score">{effectiveStatus !== 'agendado' ? match.team_a_score : '-'}</div>
          </div>
          
          <div className={`match-team ${isTeamBWinner ? 'winner' : ''}`}>
            <div className="team-info">
              {match.teams_b?.badge_url ? (
                <img 
                  src={match.teams_b.badge_url} 
                  alt="" 
                  className="team-badge-mini" 
                  width="28" 
                  height="28" 
                  loading="lazy" 
                  decoding="async"
                />
              ) : <div className="team-badge-mini" style={{width: 28, height: 28, background: 'rgba(255,255,255,0.05)', borderRadius: '50%'}}></div>}
              <span className="team-name">{match.teams_b?.name || 'A definir'}</span>
              {isTeamBWinner && (
                <span className="winner-pill" title="Vencedor">
                  <Trophy size={12} />
                  Venceu
                </span>
              )}
            </div>
            <div className="team-score">{effectiveStatus !== 'agendado' ? match.team_b_score : '-'}</div>
          </div>
        </div>
        {isKnockout && <div className="bracket-connectors"></div>}
      </div>
    );
  };

  if ((stuck || (!navigator.onLine && loading)) && matches.length === 0) {
    return (
      <div className="error-state glass" style={{ margin: '2rem auto', maxWidth: 720 }}>
        <p style={{ marginBottom: '0.75rem' }}>
          {!navigator.onLine
            ? 'Sem conexão no momento. Os jogos vão carregar assim que a internet voltar.'
            : 'Demorou muito para carregar os jogos.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refresh()}>
            Tentar novamente
          </button>
          <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => window.location.reload()}>
            Recarregar página
          </button>
        </div>
      </div>
    );
  }

  if (loading && matches.length === 0) {
    return (
      <div className="brackets-page animate-fade-in">
        <div className="brackets-showlights" aria-hidden="true"></div>
        <header className="brackets-header">
          <div className="header-icon-box">
             <Trophy size={32} color="var(--secondary)" />
          </div>
          <h1 className="text-gradient uppercase">Tabela do Torneio</h1>
          <p className="text-muted">Acompanhe o caminho rumo ao título</p>
        </header>
        <div className="brackets-scroll-container">
          <div className="brackets-scroll-content">
            {[1, 2, 3].map(i => <RoundSkeleton key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (error && matches.length === 0) {
    return (
      <div className="error-state glass" style={{ margin: '2rem auto', maxWidth: 720 }}>
        <p style={{ marginBottom: '0.75rem' }}>Erro ao carregar jogos: {error}</p>
        <button className="glass" style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => refresh()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="brackets-page animate-fade-in">
      <div className="brackets-showlights" aria-hidden="true"></div>
      <header className="brackets-header">
        <div className="header-icon-box">
          <Trophy size={32} color="var(--secondary)" />
        </div>
        <h1 className="text-gradient uppercase">Tabela do Torneio</h1>
        <p className="text-muted">Acompanhe o caminho rumo ao título</p>
      </header>

      <div className="view-mode-selector glass">
        <button 
          className={`view-btn ${viewMode === 'teia' ? 'active' : ''}`}
          onClick={() => {
            if (!hasKnockout) return;
            viewModeTouchedRef.current = true;
            setViewMode('teia');
          }}
          disabled={!hasKnockout}
          title={!hasKnockout ? 'O chaveamento abre automaticamente quando houver mata-mata no Admin' : undefined}
        >
          <Trophy size={16} /> Chaveamento (Teia)
        </button>
        <button 
          className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
          onClick={() => { viewModeTouchedRef.current = true; setViewMode('list'); }}
        >
          <Timer size={16} /> Lista de Rodadas
        </button>
      </div>
      {/* Admin controls for tournament are available in Admin > Torneio to avoid scattering tournament management across pages. */}
      {!hasKnockout && (
        <div className="no-knockout-hint glass" role="status" aria-live="polite">
          Chaveamento (Teia) sera liberado automaticamente quando voce cadastrar fases de mata-mata no Admin.
        </div>
      )}

      <section className="brackets-summary-bar glass">
        <div className="summary-item">
          <span>Ao vivo</span>
          <strong>{scheduleSummary.liveCount}</strong>
        </div>
        <div className="summary-item">
          <span>Jogos hoje</span>
          <strong>{scheduleSummary.todayCount}</strong>
        </div>
        <div className="summary-item">
          <span>Próximos</span>
          <strong>{scheduleSummary.upcomingCount}</strong>
        </div>
        <div className="summary-item summary-next">
          <span>Próximo jogo</span>
          <strong>
            {scheduleSummary.nextMatch
              ? `${new Date(scheduleSummary.nextMatch.match_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${new Date(scheduleSummary.nextMatch.match_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
              : 'A definir'}
          </strong>
        </div>
      </section>

      {viewMode === 'teia' && (
        <div className="view-zoom">
          <button
            className="zoom-btn"
            onClick={() => {
              const next = clamp(zoomRef.current - 0.08, 0.8, 1.6);
              zoomRef.current = next;
              setZoom(next);
              scheduleApplyTeiaTransform();
            }}
            type="button"
            aria-label="Diminuir zoom"
          >
            <ZoomOut size={14} />
          </button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button
            className="zoom-btn"
            onClick={() => {
              const next = clamp(zoomRef.current + 0.08, 0.8, 1.6);
              zoomRef.current = next;
              setZoom(next);
              scheduleApplyTeiaTransform();
            }}
            type="button"
            aria-label="Aumentar zoom"
          >
            <ZoomIn size={14} />
          </button>
          <button
            className="zoom-reset"
            onClick={() => {
              zoomRef.current = 1;
              panRef.current = { x: 0, y: 0 };
              setZoom(1);
              setPan({ x: 0, y: 0 });
              scheduleApplyTeiaTransform();
            }}
            type="button"
          >
            Reset
          </button>
        </div>
      )}

      <div className="match-filters">
        <button
          className={`filter-chip ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
          type="button"
          aria-pressed={activeFilter === 'all'}
        >
          Todos
        </button>
        <button
          className={`filter-chip ${activeFilter === 'live' ? 'active' : ''}`}
          onClick={() => setActiveFilter('live')}
          type="button"
          aria-pressed={activeFilter === 'live'}
        >
          Ao vivo
        </button>
        <button
          className={`filter-chip ${activeFilter === 'today' ? 'active' : ''}`}
          onClick={() => setActiveFilter('today')}
          type="button"
          aria-pressed={activeFilter === 'today'}
        >
          Hoje
        </button>
        <button
          className={`filter-chip ${activeFilter === 'favorite' ? 'active' : ''}`}
          onClick={() => favoriteTeamId && setActiveFilter('favorite')}
          disabled={!favoriteTeamId}
          title={favoriteTeamId ? 'Filtrar pelo time favorito' : 'Defina um time favorito em Preferências de Alertas'}
          type="button"
          aria-pressed={activeFilter === 'favorite'}
        >
          Meu time
        </button>
        {activeFilter !== 'all' && (
          <button className="filter-chip filter-reset" onClick={() => setActiveFilter('all')} type="button">
            Limpar
          </button>
        )}
      </div>

      {viewMode === 'list' && groupRounds.length > 0 && !shouldUsePhaseSelector && (
        <div className="phase-jump-nav glass" aria-label="Navegação por noites/rodadas">
          {groupRounds.map((roundName) => {
            const isCurrent =
              config.current_phase === 'grupos' &&
              (groupUnit === 'round'
                ? (roundsMap[roundName] || []).some(
                    (m) => (m.round ?? 0) < 1000 && (m.round ?? 0) === config.current_round,
                  )
                : (roundsMap[roundName] || []).some((m) => (m.night ?? null) === config.current_round));

            return (
              <button
                key={roundName}
                onClick={() => scrollToPhase(roundName)}
                className={`jump-btn ${isCurrent ? 'active' : ''}`}
                type="button"
                aria-pressed={isCurrent}
              >
                {formatRoundName(roundName)}
              </button>
            );
          })}
        </div>
      )}

      {shouldUsePhaseSelector && (
        <div className="phase-jump-nav glass" aria-label="Navegação por fases">
          {knockoutRounds.map((roundName) => {
            const isActive = (selectedKnockoutRound || defaultKnockoutRound) === roundName;
            return (
              <button
                key={roundName}
                onClick={() => setSelectedKnockoutRound(roundName)}
                className={`jump-btn ${isActive ? 'active' : ''}`}
                type="button"
                aria-pressed={isActive}
              >
                {formatRoundName(roundName)}
              </button>
            );
          })}
        </div>
      )}

      {sortedRounds.length > 0 && viewMode === 'list' && (
        <div className="scroll-hint">
          <ChevronLeft size={16} /> Role o mouse, use o trackpad ou arraste para navegar <ChevronRight size={16} />
        </div>
      )}

      <div className="brackets-scroll-wrapper">
        {viewMode === 'list' && (groupRounds.length + (knockoutRounds.length > 0 ? 1 : 0)) > 1 && (
          <>
            <button
              className="brackets-scroll-arrow left"
              type="button"
              aria-label="Voltar"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => scrollListByOne(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="brackets-scroll-arrow right"
              type="button"
              aria-label="Avançar"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => scrollListByOne(1)}
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}

        <div 
          className={`brackets-scroll-container ${isDragging ? 'dragging' : ''} mode-${viewMode}`}
          ref={scrollRef}
          onPointerDown={handlePointerDown}
          onPointerLeave={handlePointerUp}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerMove={handlePointerMove}
          onWheel={handleWheel}
        >
          <div
            className="brackets-scroll-content"
            ref={viewMode === 'teia' ? teiaContentRef : undefined}
          >
          {viewMode === 'teia' ? (
            /* Layout de Chaveamento Dinamico (Modo Teia) */
            <div className="knockout-tree-container">
              <section className="knockout-title">
                <h2 className="section-title">
                  <Trophy size={20} />
                  {shouldUsePhaseSelector
                    ? formatRoundName(selectedKnockoutRound || defaultKnockoutRound)
                    : 'Mata-Mata'}
                </h2>
              </section>

              <div className="knockout-columns">
                {visibleTeiaColumns.map((column) => {
                  const columnMatches = column.matches || [];
                  const detailMatch =
                    columnMatches.find((m) => deriveMatchStatus(m, nowTs) === 'ao_vivo') ||
                    [...columnMatches]
                      .filter((m) => deriveMatchStatus(m, nowTs) === 'finalizado')
                      .sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime())[0] ||
                    null;
                  const canOpenDetails = Boolean(detailMatch);

                  return (
                    <div key={column.roundName} className={`knockout-column phase-${column.roundName.toLowerCase().replace(/\s+/g, '-')}`}>
                      <h3 className="round-title">
                        <span className="round-dot"></span>
                        <span className="round-chip">{formatRoundName(column.roundName)}</span>
                        <span className="round-title-spacer" />
                        <div className="round-actions">
                          <button
                            className="round-details-btn"
                            type="button"
                            disabled={!canOpenDetails}
                            title={canOpenDetails ? 'Abrir detalhes desta fase' : 'Sem jogos ao vivo/finalizados nesta fase'}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!detailMatch) return;
                              navigate(`/central-da-partida?id=${detailMatch.id}`);
                            }}
                          >
                            Ver detalhes
                          </button>
                        </div>
                      </h3>
                      <div className="knockout-matches">
                        {column.matches.map((m) => (
                          <MatchBox key={m.id} match={m} isKnockout />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Layout de Lista de Rodadas (Padrão) */
            <>
              {knockoutRounds.length > 0 && !shouldUsePhaseSelector && (
                <div className="knockout-cta glass">
                  <div className="knockout-cta-info">
                    <Trophy size={18} color="var(--secondary)" />
                    <div>
                      <strong>Mata-Mata</strong>
                      <span>Veja o chaveamento completo no modo teia</span>
                    </div>
                  </div>
                  <button className="knockout-cta-btn" onClick={() => { setViewMode('teia'); viewModeTouchedRef.current = true; }}>
                    Abrir Teia
                  </button>
                </div>
              )}
              {(shouldUsePhaseSelector && (selectedKnockoutRound || defaultKnockoutRound)
                ? [selectedKnockoutRound || defaultKnockoutRound]
                : groupRounds
              ).map((roundName) => {
                const isCurrent =
                  (!shouldUsePhaseSelector && config.current_phase === 'grupos') &&
                  (groupUnit === 'round'
                    ? (roundsMap[roundName] || []).some(
                        (m) => (m.round ?? 0) < 1000 && (m.round ?? 0) === config.current_round,
                      )
                    : (roundsMap[roundName] || []).some((m) => (m.night ?? null) === config.current_round));

                const roundMatches = roundsMap[roundName] || [];
                const detailMatch =
                  roundMatches.find((m) => deriveMatchStatus(m, nowTs) === 'ao_vivo') ||
                  [...roundMatches]
                    .filter((m) => deriveMatchStatus(m, nowTs) === 'finalizado')
                    .sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime())[0] ||
                  null;
                const canOpenDetails = Boolean(detailMatch);

                return (
                  <div 
                    key={roundName} 
                    id={`phase-${toPhaseIdKey(roundName)}`}
                    className="bracket-round"
                  >
                    <h3 className="round-title">
                      <span className="round-dot"></span>
                      <span className="round-chip">{formatRoundName(roundName)}</span>
                      <span className="round-title-spacer" />
                      <div className="round-actions">
                        {isCurrent && <span className="current-label"><Target size={12} /> Atual</span>}
                        <button
                          className="round-details-btn"
                          type="button"
                          disabled={!canOpenDetails}
                          title={canOpenDetails ? (shouldUsePhaseSelector ? 'Abrir detalhes desta fase' : 'Abrir detalhes desta noite/rodada') : (shouldUsePhaseSelector ? 'Sem jogos ao vivo/finalizados nesta fase' : 'Sem jogos ao vivo/finalizados nesta noite/rodada')}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!detailMatch) return;
                            navigate(`/central-da-partida?id=${detailMatch.id}`);
                          }}
                        >
                          Ver detalhes
                        </button>
                      </div>
                    </h3>
                    <div className="round-matches">
                      {(roundsMap[roundName] || []).map(m => (
                        <MatchBox key={m.id} match={m} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
          
          {sortedRounds.length === 0 && (
            <div className="empty-matches">
              <Target size={32} className="icon-dim" />
              <p>Nenhuma partida cadastrada ainda.</p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default Brackets;
