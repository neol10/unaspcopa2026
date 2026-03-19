import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface Match {
  id: string;
  team_a_id: string;
  team_b_id: string;
  team_a_score: number;
  team_b_score: number;
  match_date: string;
  location: string;
  status: 'agendado' | 'ao_vivo' | 'finalizado';
  round: string;
  teams_a?: { name: string; badge_url: string };
  teams_b?: { name: string; badge_url: string };
}

export const useMatches = (limit?: number) => {
  const queryClient = useQueryClient();

  const cacheKey = `copa_unasp_cache_matches_${limit || 'all'}`;
  const loadCache = () => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null as null | { ts: number; data: Match[] };
      const parsed = JSON.parse(raw) as { ts: number; data: Match[] };
      if (!parsed?.ts || !Array.isArray(parsed.data)) return null;
      // Aceita cache de até 24h (só para "pintar" rápido no refresh)
      if (Date.now() - parsed.ts > 24 * 60 * 60 * 1000) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveCache = (data: Match[]) => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // ignore
    }
  };

  const cached = loadCache();

  const friendlyError = (raw: string | undefined) => {
    if (!raw) return null;
    if (raw.includes('Request timeout')) return 'Tempo limite ao carregar partidas';
    if (raw.toLowerCase().includes('abort')) return 'Tempo limite ao carregar partidas';
    return raw;
  };

  const query = useQuery({
    queryKey: ['matches', limit || 'all'],
    queryFn: async () => {
      let q = supabase
        .from('matches')
        .select(`
          id,
          team_a_id,
          team_b_id,
          team_a_score,
          team_b_score,
          match_date,
          location,
          status,
          round,
          teams_a:team_a_id(name, badge_url),
          teams_b:team_b_id(name, badge_url)
        `)
        .order('match_date', { ascending: true });

      if (limit) q = q.limit(limit);

      const { data, error } = await q;
      if (error) throw error;
      return (data as Match[]) || [];
    },
    staleTime: 1000 * 60 * 5, // 5 min
    gcTime: 1000 * 60 * 15,    // 15 min
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
    // Subscribe to changes
    const channel = supabase
      .channel('public:matches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        queryClient.invalidateQueries({ queryKey: ['matches'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { 
    matches: query.data || [], 
    loading: query.isLoading, 
    error: friendlyError(query.error?.message), 
    refresh: query.refetch 
  };
};
