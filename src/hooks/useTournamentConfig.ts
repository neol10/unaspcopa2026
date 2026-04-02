import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface TournamentConfig {
  id: string;
  total_rounds: number;
  matches_per_round: number;
  current_phase: 'grupos' | 'oitavas' | 'quartas' | 'semifinal' | 'final';
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
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['tournament_config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournament_config')
        .select('*')
        .single();
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows found
      return (data as TournamentConfig) || DEFAULT;
    },
    staleTime: 1000 * 60 * 30, // 30 minutos de cache
    gcTime: 1000 * 60 * 60, // Mantém no cache por 1 hora
  });

  const saveMutation = useMutation({
    mutationFn: async (updated: Partial<TournamentConfig>) => {
      const currentConfig = query.data || DEFAULT;
      const merged = { ...currentConfig, ...updated };
      
      if (currentConfig.id) {
        const { data, error } = await supabase
          .from('tournament_config')
          .update({ ...merged, updated_at: new Date().toISOString() })
          .eq('id', currentConfig.id)
          .select()
          .single();
        if (error) throw error;
        return data as TournamentConfig;
      } else {
        const { data, error } = await supabase
          .from('tournament_config')
          .insert([merged])
          .select()
          .single();
        if (error) throw error;
        return data as TournamentConfig;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament_config'] });
    }
  });

  return { 
    config: query.data || DEFAULT, 
    loading: query.isLoading && query.data === undefined, 
    error: (
      query.error &&
      typeof (query.error as { message?: unknown }).message === 'string'
        ? String((query.error as { message: string }).message)
        : null
    ),
    saveConfig: saveMutation.mutateAsync, 
    refresh: query.refetch 
  };
};

