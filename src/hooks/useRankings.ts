import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Player } from './usePlayers';
import { useDivisionContext } from '../contexts/DivisionContext';
import { useTournamentConfig } from './useTournamentConfig';
import {
  getDivisionColumnStatus,
  getNightColumnStatus,
  isMissingColumnError,
  markDivisionColumnMissing,
  markDivisionColumnPresent,
  markNightColumnMissing,
  markNightColumnPresent,
} from '../lib/supabaseOptionalColumns';

export interface RankingPlayer extends Player {
  team_name?: string;
  team_badge_url?: string;
  mvp_votes?: number;
  goals_conceded?: number;
  fair_play_points?: number;
}

export const useRankings = () => {
  const queryClient = useQueryClient();
  const { division } = useDivisionContext();
  const { config } = useTournamentConfig();
  const groupUnit = config?.group_unit === 'round' ? 'round' : 'night';
  const CACHE_KEY = `rankings_cache_v1_${division}_${groupUnit}`;

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
    queryKey: ['rankings', division, groupUnit],
    queryFn: async () => {
      const status = getDivisionColumnStatus();

      const safeList = async <T>(
        primary: () => Promise<{ data: T[] | null; error: unknown }>,
        fallbackOnMissingDivision?: () => Promise<{ data: T[] | null; error: unknown }>,
      ) => {
        try {
          const { data, error } = await primary();
          if (error) throw error;
          return (data as T[]) || [];
        } catch (err: unknown) {
          if (fallbackOnMissingDivision && isMissingColumnError(err as any, 'division')) {
            markDivisionColumnMissing();
            try {
              const { data, error } = await fallbackOnMissingDivision();
              if (error) throw error;
              return (data as T[]) || [];
            } catch {
              return [] as T[];
            }
          }
          return [] as T[];
        }
      };

      // Players (precisa, se falhar deve estourar)
      let playersQ = supabase
        .from('players')
        .select('id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, team_id, teams:team_id(name, badge_url)');
      if (status !== 'missing') playersQ = playersQ.eq('division', division);

      let playersRes = await playersQ;
      if (playersRes.error) {
        if (status !== 'missing' && isMissingColumnError(playersRes.error as any, 'division')) {
          markDivisionColumnMissing();
          playersRes = await supabase
            .from('players')
            .select('id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, team_id, teams:team_id(name, badge_url)');
        }
      }

      if (playersRes.error) throw playersRes.error;
      if (status !== 'missing') markDivisionColumnPresent();

      const [votesData, eventsData, matchesData] = await Promise.all([
        safeList<{ player_id: string }>(
          () => {
            const currentStatus = getDivisionColumnStatus();
            if (currentStatus === 'missing') {
              return supabase.from('match_mvp_votes').select('player_id') as any;
            }
            return (supabase
              .from('match_mvp_votes')
              .select('player_id, matches:match_id!inner(division)')
              .eq('matches.division', division) as any);
          },
          () => supabase.from('match_mvp_votes').select('player_id') as any,
        ),
        safeList<{
          player_id: string | null;
          assistant_id?: string | null;
          event_type: 'gol' | 'assistencia' | string;
          minute: number;
          metadata?: { goal_type?: string | null } | null;
          matches?: { round?: unknown; night?: unknown; division?: unknown } | null;
        }>(
          () => {
            const currentStatus = getDivisionColumnStatus();
            const includeNightInitial = getNightColumnStatus() !== 'missing';

            const fetchOnce = async (includeNight: boolean) => {
              const nightSelect = includeNight ? 'round, night' : 'round';
              if (currentStatus === 'missing') {
                return await (supabase
                  .from('match_events')
                  .select(`player_id, assistant_id, event_type, minute, metadata, matches:match_id!inner(${nightSelect})`)
                  .in('event_type', ['gol', 'assistencia']) as any);
              }

              return await (supabase
                .from('match_events')
                .select(`player_id, assistant_id, event_type, minute, metadata, matches:match_id!inner(${nightSelect}, division)`)
                .eq('matches.division', division)
                .in('event_type', ['gol', 'assistencia']) as any);
            };

            return (async () => {
              let includeNight = includeNightInitial;
              let res = await fetchOnce(includeNight);

              if (includeNight && res?.error && isMissingColumnError(res.error as any, 'night')) {
                markNightColumnMissing();
                includeNight = false;
                res = await fetchOnce(includeNight);
              }

              if (includeNight && !res?.error) markNightColumnPresent();
              return res;
            })() as any;
          },
          () =>
            supabase
              .from('match_events')
              .select('player_id, assistant_id, event_type, minute, metadata, matches:match_id!inner(round)')
              .in('event_type', ['gol', 'assistencia']) as any,
        ),
        safeList<{
          round: unknown;
          night?: unknown;
          status: unknown;
          team_a_id: string;
          team_b_id: string;
          team_a_score: number;
          team_b_score: number;
        }>(
          () => {
            const currentStatus = getDivisionColumnStatus();
            const includeNightInitial = getNightColumnStatus() !== 'missing';

            const fetchOnce = async (includeNight: boolean) => {
              const base = supabase.from('matches').select(
                includeNight
                  ? 'round, night, status, team_a_id, team_b_id, team_a_score, team_b_score'
                  : 'round, status, team_a_id, team_b_id, team_a_score, team_b_score'
              );
              if (currentStatus === 'missing') return await (base as any);
              return await (base.eq('division', division) as any);
            };

            return (async () => {
              let includeNight = includeNightInitial;
              let res = await fetchOnce(includeNight);

              if (includeNight && res?.error && isMissingColumnError(res.error as any, 'night')) {
                markNightColumnMissing();
                includeNight = false;
                res = await fetchOnce(includeNight);
              }

              if (includeNight && !res?.error) markNightColumnPresent();
              return res;
            })() as any;
          },
          () => {
            const includeNight = getNightColumnStatus() !== 'missing';
            return supabase
              .from('matches')
              .select(includeNight
                ? 'round, night, status, team_a_id, team_b_id, team_a_score, team_b_score'
                : 'round, status, team_a_id, team_b_id, team_a_score, team_b_score') as any;
          },
        ),
      ]);

      const playersData = playersRes.data || [];

      const currentUnitValueRaw = config?.current_phase === 'grupos' ? (config?.current_round ?? null) : null;
      const currentUnitKey = currentUnitValueRaw === null || currentUnitValueRaw === undefined ? '' : String(currentUnitValueRaw).trim();

      // Contabilizar votos por jogador
      const voteCounts: Record<string, number> = {};
      votesData.forEach(v => {
        if (v.player_id) {
          voteCounts[v.player_id] = (voteCounts[v.player_id] || 0) + 1;
        }
      });

      // Assistências computadas por eventos (mais confiável do que depender do contador em players)
      const assistCounts: Record<string, number> = {};
      eventsData.forEach((ev) => {
        if (ev.event_type === 'gol') {
          const goalType = (ev as any)?.metadata?.goal_type;
          const isOwnGoal = goalType === 'contra' || Boolean(ev.metadata?.goal_type === 'contra');
          if (isOwnGoal) return;
          if (ev.assistant_id) assistCounts[ev.assistant_id] = (assistCounts[ev.assistant_id] || 0) + 1;
          return;
        }
        if (ev.event_type === 'assistencia' && ev.player_id) {
          assistCounts[ev.player_id] = (assistCounts[ev.player_id] || 0) + 1;
        }
      });

      const playersWithTeam = playersData.map(p => ({
        ...p,
        team_name: p.teams?.name,
        team_badge_url: p.teams?.badge_url,
        mvp_votes: voteCounts[p.id] || 0
      }));

      const teamGoalsAgainst: Record<string, number> = {};
      const teamMatchesPlayed: Record<string, number> = {};
      matchesData.forEach((m) => {
        const scoreA = m.team_a_score || 0;
        const scoreB = m.team_b_score || 0;
        const looksPlayed = m.status === 'finalizado' || m.status === 'ao_vivo' || scoreA > 0 || scoreB > 0;
        if (!looksPlayed) return;
        teamGoalsAgainst[m.team_a_id] = (teamGoalsAgainst[m.team_a_id] || 0) + (m.team_b_score || 0);
        teamGoalsAgainst[m.team_b_id] = (teamGoalsAgainst[m.team_b_id] || 0) + (m.team_a_score || 0);

        teamMatchesPlayed[m.team_a_id] = (teamMatchesPlayed[m.team_a_id] || 0) + 1;
        teamMatchesPlayed[m.team_b_id] = (teamMatchesPlayed[m.team_b_id] || 0) + 1;
      });

      const mostCardedList = [...playersWithTeam]
        .map((p) => ({
          ...p,
          fair_play_points: (p.red_cards || 0) * 3 + (p.yellow_cards || 0),
        }))
        .filter((p) => ((p.yellow_cards || 0) + (p.red_cards || 0)) > 0)
        .sort((a, b) => {
          const aTotal = (a.yellow_cards || 0) + (a.red_cards || 0);
          const bTotal = (b.yellow_cards || 0) + (b.red_cards || 0);
          if (bTotal !== aTotal) return bTotal - aTotal;
          if ((b.red_cards || 0) !== (a.red_cards || 0)) return (b.red_cards || 0) - (a.red_cards || 0);
          if ((b.yellow_cards || 0) !== (a.yellow_cards || 0)) return (b.yellow_cards || 0) - (a.yellow_cards || 0);
          return a.name.localeCompare(b.name);
        })
        .slice(0, 20);

      const goldenGloveList = [...playersWithTeam]
        .filter((p) => {
          const pos = (p.position || '').toString().trim().toLowerCase();
          return pos === 'goleiro' || pos === 'gol' || pos === 'gk' || pos.includes('gole');
        })
        .map((p) => ({
          ...p,
          goals_conceded: teamGoalsAgainst[p.team_id] || 0,
        }))
        .filter((p) => (teamMatchesPlayed[p.team_id] || 0) > 0)
        .sort((a, b) => {
          if ((a.goals_conceded || 0) !== (b.goals_conceded || 0)) {
            return (a.goals_conceded || 0) - (b.goals_conceded || 0);
          }
          if ((b.clean_sheets || 0) !== (a.clean_sheets || 0)) return (b.clean_sheets || 0) - (a.clean_sheets || 0);
          return a.name.localeCompare(b.name);
        })
        .slice(0, 10);

      // --- LOGICA CRAQUE DA UNIDADE ATUAL (NOITE/RODADA) ---
      const unitStats: Record<string, { points: number; goals: number; assists: number; firstEvent: number }> = {};
      const canComputeCurrentUnit = Boolean(currentUnitKey);

      if (canComputeCurrentUnit) {
        eventsData.forEach((ev) => {
          const roundValue = Number(ev.matches?.round || 0);
          if (!Number.isFinite(roundValue) || roundValue >= 1000) return;

          const unitValue = groupUnit === 'round' ? roundValue : ev.matches?.night;
          const unitKey = unitValue === null || unitValue === undefined ? '' : String(unitValue).trim();
          if (unitKey !== currentUnitKey) return;

          if (ev.event_type === 'gol') {
            const goalType = (ev as any)?.metadata?.goal_type;
            const isOwnGoal = goalType === 'contra' || Boolean(ev.commentary && String(ev.commentary).toUpperCase().includes('[CONTRA]'));
            if (ev.player_id && !isOwnGoal) {
              if (!unitStats[ev.player_id]) unitStats[ev.player_id] = { points: 0, goals: 0, assists: 0, firstEvent: ev.minute };
              unitStats[ev.player_id].points += 1;
              unitStats[ev.player_id].goals += 1;
              if (ev.minute < unitStats[ev.player_id].firstEvent) unitStats[ev.player_id].firstEvent = ev.minute;
            }
            if (ev.assistant_id && !isOwnGoal) {
              if (!unitStats[ev.assistant_id]) unitStats[ev.assistant_id] = { points: 0, goals: 0, assists: 0, firstEvent: ev.minute };
              unitStats[ev.assistant_id].points += 1;
              unitStats[ev.assistant_id].assists += 1;
              if (ev.minute < unitStats[ev.assistant_id].firstEvent) unitStats[ev.assistant_id].firstEvent = ev.minute;
            }
          }

          if (ev.event_type === 'assistencia' && ev.player_id) {
            if (!unitStats[ev.player_id]) unitStats[ev.player_id] = { points: 0, goals: 0, assists: 0, firstEvent: ev.minute };
            unitStats[ev.player_id].points += 1;
            unitStats[ev.player_id].assists += 1;
            if (ev.minute < unitStats[ev.player_id].firstEvent) unitStats[ev.player_id].firstEvent = ev.minute;
          }
        });
      }

      const calculatedRoundMvps: Record<string, RankingPlayer> = {};
      if (canComputeCurrentUnit) {
        const sorted = Object.entries(unitStats).sort(([, a], [, b]) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.goals !== a.goals) return b.goals - a.goals;
          if (b.assists !== a.assists) return b.assists - a.assists;
          return a.firstEvent - b.firstEvent;
        });
        if (sorted.length > 0) {
          const winnerId = sorted[0][0];
          const player = playersWithTeam.find((p) => p.id === winnerId);
          if (player) calculatedRoundMvps[currentUnitKey] = player;
        }
      }

      const sortedRounds = currentUnitKey ? [currentUnitKey] : [];

      const result = {
        scorers: [...playersWithTeam].sort((a, b) => b.goals_count - a.goals_count).filter(p => p.goals_count > 0).slice(0, 10),
        assistants: [...playersWithTeam]
          .map((p) => ({ ...p, assists: assistCounts[p.id] ?? p.assists ?? 0 }))
          .sort((a, b) => (b.assists || 0) - (a.assists || 0))
          .filter((p) => (p.assists || 0) > 0)
          .slice(0, 10),
        goalkeepers: goldenGloveList,
        galeraRank: [...playersWithTeam].filter(p => p.mvp_votes > 0).sort((a, b) => b.mvp_votes - a.mvp_votes).slice(0, 10),
        disciplined: mostCardedList,
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => queryClient.invalidateQueries({ queryKey: ['rankings', division] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events' }, () => queryClient.invalidateQueries({ queryKey: ['rankings', division] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_mvp_votes' }, () => queryClient.invalidateQueries({ queryKey: ['rankings', division] }))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, division]);

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

