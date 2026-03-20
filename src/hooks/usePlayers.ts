import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface Player {
  id: string;
  team_id: string;
  name: string;
  number: number;
  position: string;
  photo_url: string;
  goals_count: number;
  yellow_cards: number;
  red_cards: number;
  assists: number;
  clean_sheets?: number;
  bio?: string;
  team_name?: string;
  team_badge_url?: string;
  team_group?: string;
  team_leader?: string;
}

type PlayerRow = Player & {
  teams?: {
    name?: string;
    badge_url?: string;
    group?: string;
    leader?: string;
  };
};

const normalizeImageSrc = (value: string | null | undefined) => {
  const raw = (value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  try {
    return encodeURI(raw);
  } catch {
    return raw;
  }
};

export const usePlayers = (teamId?: string) => {
  const queryClient = useQueryClient();
  const cacheKey = `players_cache_v1_${teamId || 'all'}`;

  const loadCachedPlayers = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts: number; data: PlayerRow[] };
      if (!parsed?.ts || !Array.isArray(parsed.data)) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const cached = loadCachedPlayers();

  const loadFallbackFromAllCache = () => {
    if (!teamId || typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('players_cache_v1_all');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts: number; data: PlayerRow[] };
      if (!parsed?.ts || !Array.isArray(parsed.data) || parsed.data.length === 0) return null;
      const filtered = parsed.data.filter((p) => p.team_id === teamId);
      if (filtered.length === 0) return null;
      return { ts: parsed.ts, data: filtered };
    } catch {
      return null;
    }
  };

  const fallbackCached = !cached?.data?.length ? loadFallbackFromAllCache() : null;
  const seedCache = cached?.data?.length ? cached : fallbackCached;

  const friendlyError = (raw: string | undefined) => {
    if (!raw) return null;
    if (raw.includes('Request timeout')) return 'Tempo limite ao carregar jogadores';
    if (raw.toLowerCase().includes('abort')) return 'Tempo limite ao carregar jogadores';
    return raw;
  };

  const query = useQuery({
    queryKey: ['players', teamId || 'all'],
    queryFn: async () => {
      let q = supabase.from('players').select('*, teams(name, badge_url, group, leader)');
      if (teamId) q = q.eq('team_id', teamId);
      const { data, error } = await q.order('name');
      if (error) throw error;
      const rows = (data as PlayerRow[]) || [];
      return rows.map((player) => ({
        ...player,
        photo_url: normalizeImageSrc(player.photo_url),
        team_name: player.teams?.name || player.team_name,
        team_badge_url: normalizeImageSrc(player.teams?.badge_url || player.team_badge_url || ''),
        team_group: player.teams?.group || player.team_group,
        team_leader: player.teams?.leader || player.team_leader,
      }));
    },
    staleTime: 1000 * 60 * 10, // 10 min
    gcTime: 1000 * 60 * 30,    // 30 min
    refetchOnReconnect: true,
    networkMode: 'online',
    initialData: seedCache?.data,
    initialDataUpdatedAt: seedCache?.ts,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  useEffect(() => {
    if (query.status === 'success' && Array.isArray(query.data) && query.data.length > 0) {
      if (typeof window === 'undefined') return;
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: query.data }));
      } catch {
        // noop
      }
    }
  }, [cacheKey, query.status, query.data]);

  useEffect(() => {
    // Optionally subscribe to players changes

    const channel = supabase
      .channel(`public:players:${teamId || 'all'}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'players',
        filter: teamId ? `team_id=eq.${teamId}` : undefined
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['players', teamId || 'all'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, queryClient]);

  return { 
    players: (query.data || []).map((player) => ({
      ...player,
      photo_url: normalizeImageSrc(player.photo_url),
    })), 
    loading: query.isLoading && query.data === undefined, 
    error: friendlyError(query.error?.message), 
    refresh: query.refetch 
  };
};

