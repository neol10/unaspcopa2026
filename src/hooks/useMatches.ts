import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useDivisionContext } from '../contexts/DivisionContext';
import type { Division } from '../lib/division';
import {
  getDivisionColumnStatus,
  getNightColumnStatus,
  isMissingColumnError,
  markDivisionColumnMissing,
  markDivisionColumnPresent,
  markNightColumnMissing,
  markNightColumnPresent,
} from '../lib/supabaseOptionalColumns';

export interface Match {
  id: string;
  division?: Division;
  team_a_id: string;
  team_b_id: string;
  team_a_score: number;
  team_b_score: number;
  match_date: string;
  location: string;
  status: 'agendado' | 'ao_vivo' | 'finalizado';
  round: number;
  night?: number | null;
  match_mvp_player_id?: string | null;
  match_mvp_description?: string | null;
  timer_started_at?: string | null;
  timer_offset_seconds: number;
  is_timer_running: boolean;
  teams_a?: { name: string; badge_url: string; group: string };
  teams_b?: { name: string; badge_url: string; group: string };
}

export const useMatches = (limit?: number) => {
  const queryClient = useQueryClient();
  const { division } = useDivisionContext();

  const cacheKey = `copa_unasp_cache_matches_${division}_${limit || 'all'}`;
  const loadCache = () => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null as null | { ts: number; data: Match[] };
      const parsed = JSON.parse(raw) as { ts: number; data: Match[] };
      if (!parsed?.ts || !Array.isArray(parsed.data)) return null;
      // Aceita cache de até 24h (só para "pintar" rápido no refresh)
      if (Date.now() - parsed.ts > 24 * 60 * 60 * 1000) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveCache = (data: Match[]) => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // ignore
    }
  };

  const cached = loadCache();

  const friendlyError = (raw: string | undefined) => {
    if (!raw) return null;
    if (raw.includes('Request timeout')) return 'Tempo limite ao carregar partidas';
    if (raw.toLowerCase().includes('abort')) return 'Tempo limite ao carregar partidas';
    return raw;
  };

  const query = useQuery({
    queryKey: ['matches', division, limit || 'all'],
    queryFn: async () => {
      const divisionStatus = getDivisionColumnStatus();
      const nightStatus = getNightColumnStatus();

      const buildSelect = (includeNight: boolean) => {
        const fields = [
          'id',
          'team_a_id',
          'team_b_id',
          'team_a_score',
          'team_b_score',
          'match_date',
          'location',
          'status',
          'round',
          ...(includeNight ? ['night'] : []),
          'match_mvp_player_id',
          'match_mvp_description',
          'timer_started_at',
          'timer_offset_seconds',
          'is_timer_running',
          'teams_a:teams!team_a_id(name, badge_url, group)',
          'teams_b:teams!team_b_id(name, badge_url, group)',
        ];
        return fields.join(',\n');
      };

      const fetchOnce = async (opts: { includeDivision: boolean; includeNight: boolean }) => {
        let q = supabase
          .from('matches')
          .select(buildSelect(opts.includeNight))
          .order('match_date', { ascending: true });

        if (opts.includeDivision) {
          // Busca partidas da divisão selecionada OU que não tenham divisão definida (legado)
          q = q.or(`division.eq.${division},division.is.null`);
        }
        if (limit) q = q.limit(limit);

        return await q;
      };

      let includeDivision = divisionStatus !== 'missing';
      let includeNight = nightStatus !== 'missing';

      const isRetriable = (err: unknown) => {
        const name = (err as { name?: unknown })?.name;
        const msg =
          typeof (err as { message?: unknown })?.message === 'string'
            ? String((err as { message: string }).message)
            : '';
        const lower = msg.toLowerCase();
        return (
          name === 'TimeoutError' ||
          lower.includes('timeout') ||
          lower.includes('failed to fetch') ||
          lower.includes('networkerror') ||
          lower.includes('fetch') && lower.includes('failed')
        );
      };

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data, error } = await fetchOnce({ includeDivision, includeNight });
          if (!error) {
            if (includeDivision) markDivisionColumnPresent();
            if (includeNight) markNightColumnPresent();

            const rows = (data as Match[]) || [];
            // Se a coluna `night` não existir no banco, preserva compatibilidade:
            // na fase de grupos, `round` já carrega a unidade (ex: Noite) no modo legado.
            if (!includeNight) {
              return rows.map((m) => ({
                ...m,
                night: (m.round || 0) < 1000 ? m.round : null,
              }));
            }

            return rows;
          }

          if (includeDivision && isMissingColumnError(error, 'division')) {
            markDivisionColumnMissing();
            includeDivision = false;
            continue;
          }

          if (includeNight && isMissingColumnError(error, 'night')) {
            markNightColumnMissing();
            includeNight = false;
            continue;
          }

          // Erros do PostgREST normalmente não se resolvem com retry imediato.
          throw error;
        } catch (err) {
          const shouldRetry = attempt < 2 && isRetriable(err);
          if (shouldRetry) {
            await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
            continue;
          }
          console.error('Supabase Matches Error:', err);
          throw err;
        }
      }

      return [];
    },
    staleTime: 1000 * 30, // 30 segundos
    gcTime: 1000 * 60 * 30,    // 30 min
    // Realtime pode falhar (WS fechado/timeout). Mantemos polling leve e mais rápido na Central.
    refetchInterval: () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        if (path.startsWith('/admin')) return false;
        if (path.startsWith('/central-da-partida')) return 3000;
        if (path.startsWith('/jogos')) return 8000;
      }
      return 10000;
    },
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    networkMode: 'online',
    initialData: cached?.data ?? [],
    initialDataUpdatedAt: cached?.ts,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (query.status === 'success' && Array.isArray(query.data) && query.data.length > 0) {
      saveCache(query.data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.status, query.data]);

  useEffect(() => {
    // Subscribe to changes — para UPDATE, aplicamos o patch direto no cache
    // para evitar que um refetch completo cause "flicker" visual em múltiplas partidas.
    const channel = supabase
      .channel('public:matches')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, (payload) => {
        const updated = payload.new as Record<string, unknown> | undefined;
        if (updated && typeof updated.id === 'string') {
          queryClient.setQueriesData({ queryKey: ['matches'] }, (old) => {
            if (!Array.isArray(old)) return old;
            return (old as Match[]).map((m) =>
              m.id === updated.id ? { ...m, ...updated } : m
            );
          });
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, () => {
        queryClient.invalidateQueries({ queryKey: ['matches', division, limit || 'all'] });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'matches' }, () => {
        queryClient.invalidateQueries({ queryKey: ['matches', division, limit || 'all'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, division, limit]);

  const hasCache = Boolean(cached && Array.isArray(cached.data) && cached.data.length > 0);
  const hasData = Boolean(Array.isArray(query.data) && query.data.length > 0);

  return {
    matches: query.data || [],
    // `initialData` pode ser [] quando não existe cache. Nesse caso, `isLoading` fica false,
    // mas ainda estamos buscando a primeira resposta.
    loading: query.isFetching && !hasData && !hasCache,
    error: friendlyError(query.error?.message),
    refresh: query.refetch,
  };
};

