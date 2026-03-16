import { useEffect, useState } from 'react';
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

export const useMatchEvents = (matchId: string) => {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = async () => {
    if (!matchId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
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
      setEvents(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();

    const channel = supabase
      .channel(`public:match_events:${matchId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'match_events', 
        filter: `match_id=eq.${matchId}` 
      }, () => {
        fetchEvents();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  return { events, loading, refresh: fetchEvents };
};
