import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDivisionContext } from '../contexts/DivisionContext';
import { fetchPublicData } from '../lib/apiData';
import { supabase } from '../lib/supabase';

type PostgrestErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

export interface Standing {
  team_id: string;
  team_name: string;
  group: string;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goals_diff: number;
  percentage: number;
  badge_url?: string;
  form: string[];
}

export const useStandings = () => {
  const queryClient = useQueryClient();
  const { division } = useDivisionContext();
  const CACHE_KEY = `standings_cache_v2_${division}`;

  const loadCachedStandings = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts: number; data: Standing[] };
      if (!parsed?.ts || !Array.isArray(parsed.data)) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveCachedStandings = (data: Standing[]) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // noop
    }
  };

  const cached = loadCachedStandings();

  const query = useQuery({
    queryKey: ['standings', division],
    queryFn: async () => {
      const [teamsPayload, matchesPayload] = await Promise.all([
        fetchPublicData<{ data: Array<{ id: string; name: string; group: string; badge_url: string }> }>('teams', { division }),
        fetchPublicData<{ data: Array<{ team_a_id: string; team_b_id: string; team_a_score: number; team_b_score: number; team_a_penalties?: number; team_b_penalties?: number; match_date: string; status: string; round: number }> }>('matches', { division }),
      ]);
      const teams = teamsPayload.data || [];
      const matches = matchesPayload.data || [];

      // 3. Processar classificação
      const statsMap: Record<string, Standing> = {};

      teams.forEach(team => {
        statsMap[team.id] = {
          team_id: team.id,
          team_name: team.name,
          group: team.group || 'Geral',
          badge_url: team.badge_url,
          points: 0,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals_for: 0,
          goals_against: 0,
          goals_diff: 0,
          percentage: 0,
          form: []
        };
      });

      matches.forEach(match => {
        if (match.status !== 'finalizado') return;
        if (match.round >= 1000) return;

        const teamA = statsMap[match.team_a_id];
        const teamB = statsMap[match.team_b_id];

        if (teamA && teamB) {
          teamA.played++;
          teamB.played++;
          teamA.goals_for += match.team_a_score;
          teamA.goals_against += match.team_b_score;
          teamB.goals_for += match.team_b_score;
          teamB.goals_against += match.team_a_score;

          if (match.team_a_score > match.team_b_score) {
            teamA.wins++;
            teamA.points += 3;
            teamB.losses++;
            teamA.form.push('V');
            teamB.form.push('D');
          } else if (match.team_a_score < match.team_b_score) {
            teamB.wins++;
            teamB.points += 3;
            teamA.losses++;
            teamA.form.push('D');
            teamB.form.push('V');
          } else {
            teamA.draws++;
            teamB.draws++;
            teamA.points += 1;
            teamB.points += 1;
            teamA.form.push('E');
            teamB.form.push('E');
          }

          // Manter apenas os últimos 5
          if (teamA.form.length > 5) teamA.form.shift();
          if (teamB.form.length > 5) teamB.form.shift();
        }
      });

      const result = Object.values(statsMap).map(s => {
        s.goals_diff = s.goals_for - s.goals_against;
        s.percentage = s.played > 0 ? (s.points / (s.played * 3)) * 100 : 0;
        // Inverter para mostrar o mais recente primeiro no UI se preferir, 
        // mas aqui vamos manter a ordem cronológica e o UI inverte se precisar.
        return s;
      });

      // Ordenação: Pontos -> Vitórias -> Saldo de Gols -> Gols Pró
      result.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.goals_diff !== a.goals_diff) return b.goals_diff - a.goals_diff;
        return b.goals_for - a.goals_for;
      });

      const finalResult = (result as Standing[]) || [];
      saveCachedStandings(finalResult);
      return finalResult;
    },
    initialData: cached?.data || undefined,
    initialDataUpdatedAt: cached?.ts,
    placeholderData: (prev) => prev,
    staleTime: 1000 * 60 * 1, // 1 min
    gcTime: 1000 * 60 * 10,  // 10 min
    refetchInterval: 1000 * 60 * 2, // Fallback: atualiza classificacao a cada 2 minutos
    retry: (failureCount, error) => {
      const name = (error as { name?: unknown })?.name;
      const raw =
        typeof (error as { message?: unknown })?.message === 'string'
          ? String((error as { message: string }).message)
          : '';
      const lower = raw.toLowerCase();
      const retriable =
        name === 'TimeoutError' ||
        lower.includes('timeout') ||
        lower.includes('failed to fetch') ||
        lower.includes('networkerror') ||
        (lower.includes('fetch') && lower.includes('failed'));
      return retriable && failureCount < 1;
    },
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    networkMode: 'online',
  });

  useEffect(() => {
    // Atualizar quando houver mudanças em matches ou teams
    const channel = supabase
      .channel('public:standings_calc')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        queryClient.invalidateQueries({ queryKey: ['standings', division] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        queryClient.invalidateQueries({ queryKey: ['standings', division] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, division]);

  const friendlyError = (raw: string | undefined) => {
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (lower.includes('request timeout') || lower.includes('supabase request timeout') || lower.includes('timeout')) {
      return 'Tempo limite ao carregar classificação';
    }
    if (lower.includes('abort')) return 'Tempo limite ao carregar classificação';
    return raw;
  };

  return { 
    standings: query.data || [], 
    loading: query.isLoading && query.data === undefined, 
    error: friendlyError(query.error?.message), 
    refresh: query.refetch,
    paused: query.fetchStatus === 'paused',
  };
};

