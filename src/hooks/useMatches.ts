import { useEffect, useState } from 'react';
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
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMatches = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('matches')
        .select(`
          *,
          teams_a:team_a_id(name, badge_url),
          teams_b:team_b_id(name, badge_url)
        `)
        .order('match_date', { ascending: true });

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      setMatches(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();

    // Subscribe to changes
    const channel = supabase
      .channel('public:matches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        fetchMatches();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { matches, loading, error, refresh: fetchMatches };
};
