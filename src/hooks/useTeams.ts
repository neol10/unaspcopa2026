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

export const useTeams = () => {
  const queryClient = useQueryClient();

  const cacheKey = 'copa_unasp_cache_teams';
  const loadCache = () => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null as null | { ts: number; data: Team[] };
      const parsed = JSON.parse(raw) as { ts: number; data: Team[] };
      if (!parsed?.ts || !Array.isArray(parsed.data)) return null;
      if (Date.now() - parsed.ts > 24 * 60 * 60 * 1000) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveCache = (data: Team[]) => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
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
      return (data as Team[]) || [];
    },
    staleTime: 1000 * 60 * 15, // 15 min (times mudam pouco)
    gcTime: 1000 * 60 * 30,    // 30 min
    refetchOnReconnect: true,
    networkMode: 'always',
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.ts,
  });

  useEffect(() => {
    if (query.status === 'success' && Array.isArray(query.data) && query.data.length > 0) {
      saveCache(query.data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    teams: query.data || [], 
    loading: query.isLoading, 
    error: friendlyError(query.error?.message), 
    refresh: query.refetch 
  };
};
