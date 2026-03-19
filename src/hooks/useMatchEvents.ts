import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface MatchEvent {
  id: string;
  match_id: string;
  player_id: string;
  event_type: 'gol' | 'amarelo' | 'vermelho' | 'falta' | 'substituicao' | 'comentario';
  minute: number;
  assistant_id?: string;
  commentary?: string;
  players?: { name: string };
}

export const useMatchEvents = (matchId: string, onNewEvent?: (event: MatchEvent) => void) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['match_events', matchId],
    queryFn: async () => {
      if (!matchId) return [];
      const { data, error } = await supabase
        .from('match_events')
        .select(`
          *,
          players:player_id(*)
        `)
        .eq('match_id', matchId)
        .order('minute', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as MatchEvent[]) || [];
    },
    enabled: !!matchId
  });

  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`public:match_events:${matchId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'match_events', 
        filter: `match_id=eq.${matchId}` 
      }, (payload) => {
        if (payload.eventType === 'INSERT' && onNewEvent) {
          supabase.from('match_events').select('*, players:player_id(*)').eq('id', payload.new.id).single().then(({data}) => {
            if (data) onNewEvent(data as MatchEvent);
          });
        }
        queryClient.invalidateQueries({ queryKey: ['match_events', matchId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, queryClient, onNewEvent]);

  return { 
    events: query.data || [], 
    loading: query.isLoading, 
    error: (query.error as any)?.message || null,
    refresh: query.refetch 
  };
};
