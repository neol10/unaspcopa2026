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

  const query = useQuery({
    queryKey: ['matches', limit || 'all'],
    queryFn: async () => {
      let q = supabase
        .from('matches')
        .select(`
          *,
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
  });

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
    error: query.error?.message || null, 
    refresh: query.refetch 
  };
};
