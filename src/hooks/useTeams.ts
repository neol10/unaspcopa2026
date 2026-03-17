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
  });

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
    error: query.error?.message || null, 
    refresh: query.refetch 
  };
};
