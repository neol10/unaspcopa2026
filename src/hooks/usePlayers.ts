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
}

type PlayerRow = Player & { teams?: { name: string } };

export const usePlayers = (teamId?: string) => {
  const queryClient = useQueryClient();

  const friendlyError = (raw: string | undefined) => {
    if (!raw) return null;
    if (raw.includes('Request timeout')) return 'Tempo limite ao carregar jogadores';
    if (raw.toLowerCase().includes('abort')) return 'Tempo limite ao carregar jogadores';
    return raw;
  };

  const query = useQuery({
    queryKey: ['players', teamId || 'all'],
    queryFn: async () => {
      let q = supabase.from('players').select('*, teams(name)');
      if (teamId) q = q.eq('team_id', teamId);
      const { data, error } = await q.order('name');
      if (error) throw error;
      return (data as PlayerRow[]) || [];
    },
    staleTime: 1000 * 60 * 10, // 10 min
    gcTime: 1000 * 60 * 30,    // 30 min
    refetchOnReconnect: true,
    networkMode: 'online',
  });

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
    players: query.data || [], 
    loading: query.isLoading && query.data === undefined, 
    error: friendlyError(query.error?.message), 
    refresh: query.refetch 
  };
};

