import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface Team {
  id: string;
  name: string;
  badge_url: string;
  group: string;
  leader: string;
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

  const cacheKey = 'copa_unasp_cache_teams';
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

  const saveCache = (data: Team[], ts: number) => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts, data }));
    } catch {
      // ignore
    }
  };

  const cached = loadCache();

  const friendlyError = (raw: string | undefined) => {
    if (!raw) return null;
    if (raw.includes('Request timeout')) return 'Tempo limite ao carregar equipes';
    if (raw.toLowerCase().includes('abort')) return 'Tempo limite ao carregar equipes';
    return raw;
  };

  const query = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('name');
      if (error) throw error;
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
  }, [query.status, query.data]);

  useEffect(() => {
    // Optionally subscribe to teams changes
    const channel = supabase
      .channel('public:teams_cache')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        queryClient.invalidateQueries({ queryKey: ['teams'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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

