import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useDivisionContext } from '../contexts/DivisionContext';
import type { Division } from '../lib/division';
import {
  getDivisionColumnStatus,
  isMissingColumnError,
  markDivisionColumnMissing,
  markDivisionColumnPresent,
} from '../lib/supabaseOptionalColumns';

export interface Player {
  id: string;
  division?: Division;
  team_id: string;
  name: string;
  number: number;
  position: string;
  photo_url: string;
  goals_count: number;
  yellow_cards: number;
  red_cards: number;
  suspensions_served?: number;
  assists: number;
  clean_sheets?: number;
  bio?: string;
  team_name?: string;
  team_badge_url?: string;
  team_group?: string;
  team_leader?: string;
  team_primary_color?: string | null;
}

type PlayerRow = Player & {
  teams?: {
    name?: string;
    badge_url?: string;
    group?: string;
    leader?: string;
    primary_color?: string | null;
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
  const { division } = useDivisionContext();
  const cacheKey = `players_cache_v2_${division}_${teamId || 'all'}`;

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
      const raw = localStorage.getItem(`players_cache_v2_${division}_all`);
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
    queryKey: ['players', division, teamId || 'all'],
    queryFn: async () => {
      const status = getDivisionColumnStatus();

      let q = supabase
        .from('players')
        .select('*, teams(name, badge_url, group, leader)');

      if (status !== 'missing') q = q.eq('division', division);
      if (teamId) q = q.eq('team_id', teamId);

      const { data, error } = await q.order('name');
      if (error) {
        if (status !== 'missing' && isMissingColumnError(error, 'division')) {
          markDivisionColumnMissing();
          let retryQ = supabase
            .from('players')
            .select('*, teams(name, badge_url, group, leader)');
          if (teamId) retryQ = retryQ.eq('team_id', teamId);
          const retry = await retryQ.order('name');
          if (retry.error) throw retry.error;
          const retryRows = (retry.data as any[]) || [];
          return retryRows.map((row) => {
            const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
            return {
              ...row,
              photo_url: normalizeImageSrc(row.photo_url),
              team_name: team?.name || row.team_name || 'Equipe',
              team_badge_url: normalizeImageSrc(team?.badge_url || row.team_badge_url || ''),
              team_group: team?.group || row.team_group || '',
              team_leader: team?.leader || row.team_leader || '',
              team_primary_color: team?.primary_color || row.team_primary_color || null,
            } as Player;
          });
        }
        throw error;
      }

      if (status !== 'missing') markDivisionColumnPresent();

      const rows = (data as any[]) || [];
      return rows.map((row) => {
        // Robust check for team data (handles object or array from Supabase join)
        const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
        
        return {
          ...row,
          photo_url: normalizeImageSrc(row.photo_url),
          // Fallback to existing properties if they exist, priority to joined data
          team_name: team?.name || row.team_name || 'Equipe',
          team_badge_url: normalizeImageSrc(team?.badge_url || row.team_badge_url || ''),
          team_group: team?.group || row.team_group || '',
          team_leader: team?.leader || row.team_leader || '',
          team_primary_color: team?.primary_color || row.team_primary_color || null,
        } as Player;
      });
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
        queryClient.invalidateQueries({ queryKey: ['players', division, teamId || 'all'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, queryClient, division]);

  return { 
    players: query.data || [], 
    loading: query.isLoading && query.data === undefined, 
    error: friendlyError(query.error?.message), 
    refresh: query.refetch 
  };
};

