import { useCallback, useEffect } from 'react';
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

export interface Team {
  id: string;
  name: string;
  badge_url: string;
  group: string;
  leader: string;
  primary_color?: string | null;
  division?: Division;
}

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

export const useTeams = () => {
  const queryClient = useQueryClient();
  const { division } = useDivisionContext();

  const cacheKey = `copa_unasp_cache_teams_${division}`;
  const loadCache = () => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null as null | { ts: number; data: Team[] };
      const parsed = JSON.parse(raw) as { ts: number; data: Team[] };
      if (!parsed?.ts || !Array.isArray(parsed.data)) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveCache = useCallback(
    (data: Team[], ts: number) => {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ ts, data }));
      } catch {
        // ignore
      }
    },
    [cacheKey],
  );

  const cached = loadCache();

  const friendlyError = (raw: string | undefined) => {
    if (!raw) return null;
    if (raw.includes('Request timeout')) return 'Tempo limite ao carregar equipes';
    if (raw.toLowerCase().includes('abort')) return 'Tempo limite ao carregar equipes';
    return raw;
  };

  const query = useQuery({
    queryKey: ['teams', division],
    queryFn: async () => {
      const status = getDivisionColumnStatus();
      const base = supabase.from('teams').select('*');
      const q = status === 'missing' ? base : base.eq('division', division);

      const { data, error } = await q.order('name');
      if (error) {
        if (status !== 'missing' && isMissingColumnError(error, 'division')) {
          markDivisionColumnMissing();
          const retry = await supabase.from('teams').select('*').order('name');
          if (retry.error) throw retry.error;
          const rows = (retry.data as Team[]) || [];
          return rows.map((team) => ({
            ...team,
            badge_url: normalizeImageSrc(team.badge_url),
          }));
        }
        throw error;
      }

      if (status !== 'missing') markDivisionColumnPresent();

      const rows = (data as Team[]) || [];
      return rows.map((team) => ({
        ...team,
        badge_url: normalizeImageSrc(team.badge_url),
      }));
    },
    staleTime: 1000 * 60 * 20, // 20 min (times mudam pouco, mantém cache mais tempo)
    gcTime: 1000 * 60 * 60,    // 60 min (garbage collection mais longo)
    refetchOnReconnect: true,
    networkMode: 'online',
    initialData: cached?.data || undefined,
    initialDataUpdatedAt: cached?.ts,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (query.status === 'success' && Array.isArray(query.data) && query.data.length > 0) {
      saveCache(query.data, Date.now());
    }
  }, [query.status, query.data, saveCache]);

  useEffect(() => {
    // Optionally subscribe to teams changes
    const channel = supabase
      .channel('public:teams_cache')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        queryClient.invalidateQueries({ queryKey: ['teams', division] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, division]);

  return { 
    teams: (query.data || []).map((team) => ({
      ...team,
      badge_url: normalizeImageSrc(team.badge_url),
    })), 
    loading: query.isLoading && query.data === undefined, 
    error: friendlyError(query.error?.message), 
    refresh: query.refetch 
  };
};

