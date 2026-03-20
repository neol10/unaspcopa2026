import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Player } from './usePlayers';

export interface RankingPlayer extends Player {
  team_name?: string;
  team_badge_url?: string;
  mvp_votes?: number;
  goals_conceded?: number;
  fair_play_points?: number;
}

export const useRankings = () => {
  const queryClient = useQueryClient();
  const CACHE_KEY = 'rankings_cache_v1';

  const loadCachedRankings = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        ts: number;
        data: {
          scorers: RankingPlayer[];
          assistants: RankingPlayer[];
          goalkeepers: RankingPlayer[];
          galeraRank: RankingPlayer[];
          disciplined: RankingPlayer[];
          roundMvps: Record<string, RankingPlayer>;
          availableRounds: string[];
        };
      };
      if (!parsed?.ts || !parsed?.data) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveCachedRankings = (data: {
    scorers: RankingPlayer[];
    assistants: RankingPlayer[];
    goalkeepers: RankingPlayer[];
    galeraRank: RankingPlayer[];
    disciplined: RankingPlayer[];
    roundMvps: Record<string, RankingPlayer>;
    availableRounds: string[];
  }) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // noop
    }
  };

  const cached = loadCachedRankings();
  const emptyRankings = {
    scorers: [],
    assistants: [],
    goalkeepers: [],
    galeraRank: [],
    disciplined: [],
    roundMvps: {},
    availableRounds: []
  } as {
    scorers: RankingPlayer[];
    assistants: RankingPlayer[];
    goalkeepers: RankingPlayer[];
    galeraRank: RankingPlayer[];
    disciplined: RankingPlayer[];
    roundMvps: Record<string, RankingPlayer>;
    availableRounds: string[];
  };

  const query = useQuery({
    queryKey: ['rankings'],
    queryFn: async () => {
      const playersRes = await supabase
        .from('players')
        .select('id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, team_id, teams:team_id(name, badge_url)');

      if (playersRes.error) throw playersRes.error;

      const safeList = async <T>(fn: () => Promise<{ data: T[] | null; error: unknown }>) => {
        try {
          const { data, error } = await fn();
          if (error) throw error;
          return (data as T[]) || [];
        } catch {
          return [] as T[];
        }
      };

      const [votesData, eventsData, matchesData] = await Promise.all([
        safeList<{ player_id: string }>(() => supabase.from('match_mvp_votes').select('player_id')),
        safeList<{
          player_id: string | null;
          assistant_id?: string | null;
          event_type: 'gol' | 'assistencia' | string;
          minute: number;
          metadata?: { goal_type?: string | null } | null;
          matches?: { round?: unknown } | null;
        }>(() =>
          supabase
            .from('match_events')
            .select('player_id, assistant_id, event_type, minute, metadata, matches:match_id(round)')
            .in('event_type', ['gol', 'assistencia']),
        ),
        safeList<{
          round: unknown;
          status: unknown;
          team_a_id: string;
          team_b_id: string;
          team_a_score: number;
          team_b_score: number;
        }>(() => supabase.from('matches').select('round, status, team_a_id, team_b_id, team_a_score, team_b_score')),
      ]);

      const playersData = playersRes.data || [];

      // --- RODADAS FINALIZADAS ---
      // A rodada só é considerada finalizada quando TODAS as partidas daquela rodada estão com status 'finalizado'
      const roundTotals: Record<string, { total: number; finalized: number }> = {};
      matchesData.forEach(m => {
        const round = String(m.round ?? '').trim();
        if (!round) return;
        if (!roundTotals[round]) roundTotals[round] = { total: 0, finalized: 0 };
        roundTotals[round].total += 1;
        if (m.status === 'finalizado') roundTotals[round].finalized += 1;
      });
      const completedRounds = new Set(
        Object.entries(roundTotals)
          .filter(([, v]) => v.total > 0 && v.finalized === v.total)
          .map(([round]) => round),
      );

      // Contabilizar votos por jogador
      const voteCounts: Record<string, number> = {};
      votesData.forEach(v => {
        if (v.player_id) {
          voteCounts[v.player_id] = (voteCounts[v.player_id] || 0) + 1;
        }
      });

      const playersWithTeam = playersData.map(p => ({
        ...p,
        team_name: p.teams?.name,
        team_badge_url: p.teams?.badge_url,
        mvp_votes: voteCounts[p.id] || 0
      }));

      const teamGoalsAgainst: Record<string, number> = {};
      matchesData.forEach((m) => {
        if (m.status !== 'finalizado' && m.status !== 'ao_vivo') return;
        teamGoalsAgainst[m.team_a_id] = (teamGoalsAgainst[m.team_a_id] || 0) + (m.team_b_score || 0);
        teamGoalsAgainst[m.team_b_id] = (teamGoalsAgainst[m.team_b_id] || 0) + (m.team_a_score || 0);
      });

      const fairPlayList = [...playersWithTeam]
        .map((p) => ({
          ...p,
          fair_play_points: (p.red_cards || 0) * 3 + (p.yellow_cards || 0),
        }))
        .sort((a, b) => {
          if ((a.fair_play_points || 0) !== (b.fair_play_points || 0)) {
            return (a.fair_play_points || 0) - (b.fair_play_points || 0);
          }
          if ((a.red_cards || 0) !== (b.red_cards || 0)) return (a.red_cards || 0) - (b.red_cards || 0);
          if ((a.yellow_cards || 0) !== (b.yellow_cards || 0)) return (a.yellow_cards || 0) - (b.yellow_cards || 0);
          return a.name.localeCompare(b.name);
        })
        .slice(0, 10);

      const goldenGloveList = [...playersWithTeam]
        .filter((p) => p.position === 'Goleiro')
        .map((p) => ({
          ...p,
          goals_conceded: teamGoalsAgainst[p.team_id] || 0,
        }))
        .sort((a, b) => {
          if ((a.goals_conceded || 0) !== (b.goals_conceded || 0)) {
            return (a.goals_conceded || 0) - (b.goals_conceded || 0);
          }
          if ((b.clean_sheets || 0) !== (a.clean_sheets || 0)) return (b.clean_sheets || 0) - (a.clean_sheets || 0);
          return a.name.localeCompare(b.name);
        })
        .slice(0, 10);

      // --- LOGICA CRAQUE DA RODADA ---
      const roundStats: Record<string, Record<string, { points: number, goals: number, firstEvent: number }>> = {};
      const roundsFound = new Set<string>();

      eventsData.forEach(ev => {
        const round = String(ev.matches?.round ?? '').trim();
        if (!round) return;
        // Só computa “Craque da Rodada” para rodadas finalizadas
        if (!completedRounds.has(round)) return;
        roundsFound.add(String(round));

        if (!roundStats[round]) roundStats[round] = {};

        // Gols
        if (ev.event_type === 'gol' && ev.metadata?.goal_type !== 'contra' && ev.player_id) {
          if (!roundStats[round][ev.player_id]) roundStats[round][ev.player_id] = { points: 0, goals: 0, firstEvent: ev.minute };
          roundStats[round][ev.player_id].points += 1;
          roundStats[round][ev.player_id].goals += 1;
          if (ev.minute < roundStats[round][ev.player_id].firstEvent) roundStats[round][ev.player_id].firstEvent = ev.minute;
        }

        // Assistências
        const assId = ev.assistant_id || (ev.event_type === 'assistencia' ? ev.player_id : null);
        if (assId) {
          if (!roundStats[round][assId]) roundStats[round][assId] = { points: 0, goals: 0, firstEvent: ev.minute };
          roundStats[round][assId].points += 1;
          if (ev.minute < roundStats[round][assId].firstEvent) roundStats[round][assId].firstEvent = ev.minute;
        }
      });

      const calculatedRoundMvps: Record<string, RankingPlayer> = {};
      Object.keys(roundStats).forEach(round => {
        const sorted = Object.entries(roundStats[round]).sort(([, a], [, b]) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.goals !== a.goals) return b.goals - a.goals;
          return a.firstEvent - b.firstEvent;
        });

        if (sorted.length > 0) {
          const winnerId = sorted[0][0];
          const player = playersWithTeam.find(p => p.id === winnerId);
          if (player) calculatedRoundMvps[round] = player;
        }
      });

      const sortedRounds = Array.from(roundsFound).sort((a, b) => {
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (isNaN(numA) || isNaN(numB)) return a.localeCompare(b);
        return numA - numB;
      });

      const result = {
        scorers: [...playersWithTeam].sort((a, b) => b.goals_count - a.goals_count).filter(p => p.goals_count > 0).slice(0, 10),
        assistants: [...playersWithTeam].sort((a, b) => b.assists - a.assists).filter(p => p.assists > 0).slice(0, 10),
        goalkeepers: goldenGloveList,
        galeraRank: [...playersWithTeam].filter(p => p.mvp_votes > 0).sort((a, b) => b.mvp_votes - a.mvp_votes).slice(0, 10),
        disciplined: fairPlayList,
        roundMvps: calculatedRoundMvps,
        availableRounds: sortedRounds
      };
      saveCachedRankings(result);
      return result;
    },
    initialData: cached?.data ?? emptyRankings,
    initialDataUpdatedAt: cached?.ts,
    placeholderData: (prev) => prev,
    staleTime: 1000 * 60 * 15, // 15 min
    gcTime: 1000 * 60 * 30,   // 30 min
  });

  useEffect(() => {
    const channel = supabase
      .channel('public:rankings_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => queryClient.invalidateQueries({ queryKey: ['rankings'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events' }, () => queryClient.invalidateQueries({ queryKey: ['rankings'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_mvp_votes' }, () => queryClient.invalidateQueries({ queryKey: ['rankings'] }))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const data = query.data || {
    scorers: [], assistants: [], goalkeepers: [], galeraRank: [], disciplined: [], roundMvps: {}, availableRounds: []
  };

  return {
    ...data,
    loading: query.isLoading && query.data === undefined,
    error: (
      query.error &&
      typeof (query.error as { message?: unknown }).message === 'string'
        ? String((query.error as { message: string }).message)
        : null
    ),
    refresh: query.refetch,
  };
};

