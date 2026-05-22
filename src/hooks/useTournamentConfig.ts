import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useDivisionContext } from '../contexts/DivisionContext';
import type { Division } from '../lib/division';
import { fetchPublicData } from '../lib/apiData';
import {
  getDivisionColumnStatus,
  getGroupUnitColumnStatus,
  isMissingColumnError,
  markDivisionColumnMissing,
  markDivisionColumnPresent,
  markGroupUnitColumnMissing,
  markGroupUnitColumnPresent,
} from '../lib/supabaseOptionalColumns';

type PostgrestErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

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
  division?: Division;
  total_rounds: number;
  matches_per_round: number;
  current_phase: 'grupos' | 'oitavas' | 'quartas' | 'semifinal' | 'final';
  current_round: number;
  group_unit?: 'night' | 'round';
  group_c_visibility?: GroupCVisibilityConfig;
}

const DEFAULT: TournamentConfig = {
  id: '',
  total_rounds: 5,
  matches_per_round: 4,
  current_phase: 'grupos',
  current_round: 1,
  group_unit: 'night',
  group_c_visibility: DEFAULT_GROUP_C_VISIBILITY,
};

export const useTournamentConfig = () => {
  const queryClient = useQueryClient();
  const { division } = useDivisionContext();

  const query = useQuery({
    queryKey: ['tournament_config', division],
    queryFn: async () => {
      const payload = await fetchPublicData<{ data: TournamentConfig | null }>('tournament_config', { division });
      const base = (payload.data as TournamentConfig) || DEFAULT;
      return {
        ...base,
        group_unit: (base.group_unit || 'night') as TournamentConfig['group_unit'],
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
        queryClient.invalidateQueries({ queryKey: ['tournament_config', division] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, division]);

  const saveMutation = useMutation({
    mutationFn: async (updated: Partial<TournamentConfig>) => {
      const currentConfig = query.data || DEFAULT;
      const status = getDivisionColumnStatus();
      const groupUnitStatus = getGroupUnitColumnStatus();
      const merged = status === 'missing'
        ? { ...currentConfig, ...updated }
        : { ...currentConfig, ...updated, division };

      if (currentConfig.id) {
        const payload = { ...merged, updated_at: new Date().toISOString() } as Record<string, unknown>;

        const attemptUpdate = async (payloadToUpdate: Record<string, unknown>) => {
          return await supabase
            .from('tournament_config')
            .update(payloadToUpdate)
            .eq('id', currentConfig.id)
            .select()
            .single();
        };

        const res = await attemptUpdate(payload);
        if (res.error) {
          const missingDivision =
            status !== 'missing' && isMissingColumnError(res.error as unknown as PostgrestErrorLike, 'division');
          const missingGroupUnit =
            groupUnitStatus !== 'missing' && isMissingColumnError(res.error as unknown as PostgrestErrorLike, 'group_unit');

          if (missingDivision || missingGroupUnit) {
            if (missingDivision) markDivisionColumnMissing();
            if (missingGroupUnit) markGroupUnitColumnMissing();

            const base = payload as { division?: unknown; group_unit?: unknown } & Record<string, unknown>;
            const { division: divisionValue, group_unit: groupUnitValue, ...rest } = base;
            const retryPayload: Record<string, unknown> = {
              ...rest,
              ...(missingDivision ? {} : { division: divisionValue }),
              ...(missingGroupUnit ? {} : { group_unit: groupUnitValue }),
            };

            const retry = await attemptUpdate(retryPayload);
            if (retry.error) throw retry.error;
            if (!missingDivision) markDivisionColumnPresent();
            if (!missingGroupUnit) markGroupUnitColumnPresent();
            return {
              ...(retry.data as TournamentConfig),
              group_unit: ((retry.data as TournamentConfig)?.group_unit || 'night') as TournamentConfig['group_unit'],
              group_c_visibility: normalizeGroupCVisibility((retry.data as { group_c_visibility?: unknown })?.group_c_visibility),
            };
          }

          throw res.error;
        }

        if (status !== 'missing') markDivisionColumnPresent();
        if (groupUnitStatus !== 'missing') markGroupUnitColumnPresent();
        return {
          ...(res.data as TournamentConfig),
          group_unit: ((res.data as TournamentConfig)?.group_unit || 'night') as TournamentConfig['group_unit'],
          group_c_visibility: normalizeGroupCVisibility((res.data as { group_c_visibility?: unknown })?.group_c_visibility),
        };
      } else {
        const payload = { ...merged } as Record<string, unknown>;
        if (!payload.id) {
          delete payload.id;
        }

        const attemptInsert = async (payloadToInsert: Record<string, unknown>) => {
          return await supabase
            .from('tournament_config')
            .insert([payloadToInsert])
            .select()
            .single();
        };

        const res = await attemptInsert(payload);
        if (res.error) {
          const missingDivision =
            status !== 'missing' && isMissingColumnError(res.error as unknown as PostgrestErrorLike, 'division');
          const missingGroupUnit =
            groupUnitStatus !== 'missing' && isMissingColumnError(res.error as unknown as PostgrestErrorLike, 'group_unit');

          if (missingDivision || missingGroupUnit) {
            if (missingDivision) markDivisionColumnMissing();
            if (missingGroupUnit) markGroupUnitColumnMissing();

            const base = payload as { division?: unknown; group_unit?: unknown } & Record<string, unknown>;
            const { division: divisionValue, group_unit: groupUnitValue, ...rest } = base;
            const retryPayload: Record<string, unknown> = {
              ...rest,
              ...(missingDivision ? {} : { division: divisionValue }),
              ...(missingGroupUnit ? {} : { group_unit: groupUnitValue }),
            };

            const retry = await attemptInsert(retryPayload);
            if (retry.error) throw retry.error;
            if (!missingDivision) markDivisionColumnPresent();
            if (!missingGroupUnit) markGroupUnitColumnPresent();
            return {
              ...(retry.data as TournamentConfig),
              group_unit: ((retry.data as TournamentConfig)?.group_unit || 'night') as TournamentConfig['group_unit'],
              group_c_visibility: normalizeGroupCVisibility((retry.data as { group_c_visibility?: unknown })?.group_c_visibility),
            };
          }

          throw res.error;
        }

        if (status !== 'missing') markDivisionColumnPresent();
        if (groupUnitStatus !== 'missing') markGroupUnitColumnPresent();
        return {
          ...(res.data as TournamentConfig),
          group_unit: ((res.data as TournamentConfig)?.group_unit || 'night') as TournamentConfig['group_unit'],
          group_c_visibility: normalizeGroupCVisibility((res.data as { group_c_visibility?: unknown })?.group_c_visibility),
        };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament_config', division] });
    }
  });

  return { 
    config: {
      ...(query.data || DEFAULT),
      group_unit: ((query.data || DEFAULT).group_unit || 'night') as TournamentConfig['group_unit'],
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

