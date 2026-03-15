import { useEffect, useState } from 'react';
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

export const usePlayers = (teamId?: string) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlayers = async () => {
    try {
      setLoading(true);
      let query = supabase.from('players').select('*');
      
      if (teamId) {
        query = query.eq('team_id', teamId);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;
      setPlayers(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();

    const channel = supabase
      .channel(`public:players:${teamId || 'all'}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'players',
        filter: teamId ? `team_id=eq.${teamId}` : undefined
      }, () => {
        fetchPlayers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId]);

  return { players, loading, error, refresh: fetchPlayers };
};
