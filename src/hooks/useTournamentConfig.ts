import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface GroupCVisibilityConfig {
  teams: boolean;
  players: boolean;
  standings: boolean;
  favorite_team_menu: boolean;
  matches: boolean;
}

export const DEFAULT_GROUP_C_VISIBILITY: GroupCVisibilityConfig = {
  teams: false,
  players: false,
  standings: false,
  favorite_team_menu: false,
  matches: false,
};

export const normalizeGroupCVisibility = (raw: unknown): GroupCVisibilityConfig => {
  let parsed = raw;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = null;
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return DEFAULT_GROUP_C_VISIBILITY;
  }

  const candidate = parsed as Partial<GroupCVisibilityConfig>;
  return {
    teams: Boolean(candidate.teams),
    players: Boolean(candidate.players),
    standings: Boolean(candidate.standings),
    favorite_team_menu: Boolean(candidate.favorite_team_menu),
    matches: Boolean(candidate.matches),
  };
};

export interface TournamentConfig {
  id: string;
  total_rounds: number;
  matches_per_round: number;
  current_phase: 'grupos' | 'oitavas' | 'quartas' | 'semifinal' | 'final';
  current_round: number;
  group_c_visibility?: GroupCVisibilityConfig;
}

const DEFAULT: TournamentConfig = {
  id: '',
  total_rounds: 5,
  matches_per_round: 4,
  current_phase: 'grupos',
  current_round: 1,
  group_c_visibility: DEFAULT_GROUP_C_VISIBILITY,
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
      const base = (data as TournamentConfig) || DEFAULT;
      return {
        ...base,
        group_c_visibility: normalizeGroupCVisibility((base as { group_c_visibility?: unknown }).group_c_visibility),
      };
    },
    staleTime: 1000 * 60 * 1, // 1 minuto de cache
    gcTime: 1000 * 60 * 60, // Mantém no cache por 1 hora
    refetchInterval: 1000 * 60 * 5, // Fallback: atualiza a cada 5 minutos
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const channel = supabase
      .channel('public:tournament_config')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_config' }, () => {
        queryClient.invalidateQueries({ queryKey: ['tournament_config'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: async (updated: Partial<TournamentConfig>) => {
      const currentConfig = query.data || DEFAULT;
      const merged = { ...currentConfig, ...updated };

      if (currentConfig.id) {
        const payload = { ...merged, updated_at: new Date().toISOString() };

        const { data, error } = await supabase
          .from('tournament_config')
          .update(payload)
          .eq('id', currentConfig.id)
          .select()
          .single();

        if (error) throw error;
        return {
          ...(data as TournamentConfig),
          group_c_visibility: normalizeGroupCVisibility((data as { group_c_visibility?: unknown })?.group_c_visibility),
        };
      } else {
        const payload = { ...merged };

        const { data, error } = await supabase
          .from('tournament_config')
          .insert([payload])
          .select()
          .single();

        if (error) throw error;
        return {
          ...(data as TournamentConfig),
          group_c_visibility: normalizeGroupCVisibility((data as { group_c_visibility?: unknown })?.group_c_visibility),
        };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament_config'] });
    }
  });

  return { 
    config: {
      ...(query.data || DEFAULT),
      group_c_visibility: normalizeGroupCVisibility((query.data || DEFAULT).group_c_visibility),
    }, 
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

