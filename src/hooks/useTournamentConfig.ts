import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface TournamentConfig {
  id: string;
  total_rounds: number;
  matches_per_round: number;
  current_phase: 'grupos' | 'quartas' | 'semifinal' | 'final';
  current_round: number;
}

const DEFAULT: TournamentConfig = {
  id: '',
  total_rounds: 5,
  matches_per_round: 4,
  current_phase: 'grupos',
  current_round: 1,
};

export const useTournamentConfig = () => {
  const [config, setConfig] = useState<TournamentConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);

  const fetchConfig = async () => {
    const { data } = await supabase
      .from('tournament_config')
      .select('*')
      .single();
    if (data) setConfig(data as TournamentConfig);
    setLoading(false);
  };

  const saveConfig = async (updated: Partial<TournamentConfig>) => {
    const merged = { ...config, ...updated };
    if (config.id) {
      const { error } = await supabase
        .from('tournament_config')
        .update({ ...merged, updated_at: new Date().toISOString() })
        .eq('id', config.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from('tournament_config')
        .insert([merged])
        .select()
        .single();
      if (error) throw error;
      if (data) setConfig(data as TournamentConfig);
    }
    setConfig(merged);
  };

  useEffect(() => { fetchConfig(); }, []);

  return { config, loading, saveConfig, refresh: fetchConfig };
};
