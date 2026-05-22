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
import { readFreshCache, shouldUseClientCache } from '../lib/clientCache';

export interface RankingPlayer extends Player {
  team_name?: string;
  team_badge_url?: string;
  mvp_votes?: number;
  goals_conceded?: number;
  fair_play_points?: number;
}

type PostgrestErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

type ListResponse<T> = { data: T[] | null; error: unknown };
const asListResponse = <T>(value: unknown) => value as Promise<ListResponse<T>>;

export const useRankings = () => {
  const queryClient = useQueryClient();
  const { division } = useDivisionContext();
  const { config } = useTournamentConfig();
  const groupUnit = config?.group_unit === 'round' ? 'round' : 'night';
  const CACHE_KEY = `rankings_cache_v1_${division}_${groupUnit}`;

  const loadCachedRankings = () => shouldUseClientCache() ? readFreshCache<{
    scorers: RankingPlayer[];
    assistants: RankingPlayer[];
    goalkeepers: RankingPlayer[];
    galeraRank: RankingPlayer[];
    disciplined: RankingPlayer[];
    roundMvps: Record<string, RankingPlayer>;
    availableRounds: string[];
  }>(CACHE_KEY, 1000 * 60 * 2) : null;

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
        primary: () => Promise<ListResponse<T>>,
        fallbackOnMissingDivision?: () => Promise<ListResponse<T>>,
      ) => {
        try {
          const { data, error } = await primary();
          if (error) throw error;
          return (data as T[]) || [];
        } catch (err: unknown) {
          if (fallbackOnMissingDivision && isMissingColumnError(err as unknown as PostgrestErrorLike, 'division')) {
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
        if (status !== 'missing' && isMissingColumnError(playersRes.error as unknown as PostgrestErrorLike, 'division')) {
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
              return asListResponse<{ player_id: string }>(supabase.from('match_mvp_votes').select('player_id'));
            }
            return asListResponse<{ player_id: string }>(
              supabase
                .from('match_mvp_votes')
                .select('player_id, matches:match_id!inner(division)')
                .eq('matches.division', division),
            );
          },
          () => asListResponse<{ player_id: string }>(supabase.from('match_mvp_votes').select('player_id')),
        ),
        safeList<{
          player_id: string | null;
          assistant_id?: string | null;
          event_type: 'gol' | 'assistencia' | string;
          minute: number;
          metadata?: { goal_type?: string | null } | null;
          match_id?: string | null;
          matches?: { round?: unknown; night?: unknown; division?: unknown } | null;
        }>(
          () => {
            const currentStatus = getDivisionColumnStatus();
            const includeNightInitial = getNightColumnStatus() !== 'missing';

            const fetchOnce = async (includeNight: boolean) => {
              const nightSelect = includeNight ? 'round, night' : 'round';
              if (currentStatus === 'missing') {
                return await asListResponse<{
                  player_id: string | null;
                  assistant_id?: string | null;
                  event_type: 'gol' | 'assistencia' | string;
                  minute: number;
                  metadata?: { goal_type?: string | null } | null;
                  matches?: { round?: unknown; night?: unknown; division?: unknown } | null;
                }>(
                  supabase
                    .from('match_events')
                    .select(
                      `player_id, assistant_id, event_type, minute, metadata, matches:match_id!inner(${nightSelect})`,
                    )
                    .in('event_type', ['gol', 'assistencia']),
                );
              }

              return await asListResponse<{
                player_id: string | null;
                assistant_id?: string | null;
                event_type: 'gol' | 'assistencia' | string;
                minute: number;
                metadata?: { goal_type?: string | null } | null;
                matches?: { round?: unknown; night?: unknown; division?: unknown } | null;
              }>(
                supabase
                  .from('match_events')
                  .select(
                    `match_id, player_id, assistant_id, event_type, minute, metadata, matches:match_id!inner(${nightSelect}, division)`,
                  )
                  .eq('matches.division', division)
                  .in('event_type', ['gol', 'assistencia']),
              );
            };

            return (async () => {
              let includeNight = includeNightInitial;
              let res = await fetchOnce(includeNight);

              if (
                includeNight &&
                res?.error &&
                isMissingColumnError(res.error as unknown as PostgrestErrorLike, 'night')
              ) {
                markNightColumnMissing();
                includeNight = false;
                res = await fetchOnce(includeNight);
              }

              if (includeNight && !res?.error) markNightColumnPresent();
              return res;
            })();
          },
          () =>
            asListResponse<{
              player_id: string | null;
              assistant_id?: string | null;
              event_type: 'gol' | 'assistencia' | string;
              minute: number;
              metadata?: { goal_type?: string | null } | null;
              matches?: { round?: unknown; night?: unknown; division?: unknown } | null;
            }>(
              supabase
              .from('match_events')
              .select('match_id, player_id, assistant_id, event_type, minute, metadata, matches:match_id!inner(round)')
              .in('event_type', ['gol', 'assistencia']),
            ),
        ),
        safeList<{
          round: unknown;
          night?: unknown;
          status: unknown;
          team_a_id: string;
          team_b_id: string;
          team_a_score: number;
          team_b_score: number;
          id?: string | null;
        }>(
          () => {
            const currentStatus = getDivisionColumnStatus();
            const includeNightInitial = getNightColumnStatus() !== 'missing';

            const fetchOnce = async (includeNight: boolean) => {
              const base = supabase.from('matches').select(
                includeNight
                  ? 'id, round, night, status, team_a_id, team_b_id, team_a_score, team_b_score'
                  : 'id, round, status, team_a_id, team_b_id, team_a_score, team_b_score'
              );
              if (currentStatus === 'missing') return await asListResponse<{
                round: unknown;
                night?: unknown;
                status: unknown;
                team_a_id: string;
                team_b_id: string;
                team_a_score: number;
                team_b_score: number;
              }>(base);

              return await asListResponse<{
                round: unknown;
                night?: unknown;
                status: unknown;
                team_a_id: string;
                team_b_id: string;
                team_a_score: number;
                team_b_score: number;
              }>(base.eq('division', division));
            };

            return (async () => {
              let includeNight = includeNightInitial;
              let res = await fetchOnce(includeNight);

              if (
                includeNight &&
                res?.error &&
                isMissingColumnError(res.error as unknown as PostgrestErrorLike, 'night')
              ) {
                markNightColumnMissing();
                includeNight = false;
                res = await fetchOnce(includeNight);
              }

              if (includeNight && !res?.error) markNightColumnPresent();
              return res;
            })();
          },
          () => {
            const includeNight = getNightColumnStatus() !== 'missing';
            return asListResponse<{
              id?: string | null;
              round: unknown;
              night?: unknown;
              status: unknown;
              team_a_id: string;
              team_b_id: string;
              team_a_score: number;
              team_b_score: number;
            }>(
              supabase
                .from('matches')
                .select(
                  includeNight
                    ? 'id, round, night, status, team_a_id, team_b_id, team_a_score, team_b_score'
                    : 'id, round, status, team_a_id, team_b_id, team_a_score, team_b_score',
                ),
            );
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
          const goalType = ev.metadata?.goal_type;
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

      // Proxy de tempo jogado: contar eventos em que o jogador aparece (player_id ou assistant_id)
      const playerEventCounts: Record<string, number> = {};
      // Per-match event counts (used to attribute goals conceded to GK on court)
      const perMatchEventCounts: Record<string, Record<string, number>> = {};
      eventsData.forEach((ev) => {
        if (ev.player_id) playerEventCounts[ev.player_id] = (playerEventCounts[ev.player_id] || 0) + 1;
        if (ev.assistant_id) playerEventCounts[ev.assistant_id] = (playerEventCounts[ev.assistant_id] || 0) + 1;
        const matchId = ev.match_id ? String(ev.match_id) : (ev.matches ? String(ev.matches?.round || '') : '');
        if (!perMatchEventCounts[matchId]) perMatchEventCounts[matchId] = {};
        if (ev.player_id) perMatchEventCounts[matchId][ev.player_id] = (perMatchEventCounts[matchId][ev.player_id] || 0) + 1;
        if (ev.assistant_id) perMatchEventCounts[matchId][ev.assistant_id] = (perMatchEventCounts[matchId][ev.assistant_id] || 0) + 1;
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

      // Compute goals conceded per goalkeeper while they were likely on court (heuristic)
      const goalsConcededByGk: Record<string, number> = {};
      // Build quick map of matches by id
      const matchesById: Record<string, any> = {};
      matchesData.forEach(m => {
        const id = m.id ? String(m.id) : '';
        if (id) matchesById[id] = m;
      });

      // For each goal event, attribute the conceded goal to the GK of the conceding team with highest event count in that match
      eventsData.forEach((ev) => {
        if (ev.event_type !== 'gol') return;
        const goalType = ev.metadata?.goal_type;
        const isOwnGoal = goalType === 'contra' || Boolean(ev.metadata?.goal_type === 'contra');
        if (isOwnGoal) return;
        const matchId = ev.match_id ? String(ev.match_id) : (ev.matches ? String(ev.matches?.round || '') : '');
        const scorerId = ev.player_id;
        if (!scorerId || !matchId) return;
        const scorer = playersWithTeam.find(p => p.id === scorerId);
        if (!scorer) return;
        const match = matchesById[matchId];
        if (!match) return;
        // determine conceding team id
        const concededTeamId = match.team_a_id === scorer.team_id ? match.team_b_id : match.team_a_id;
        // candidate GKs: players in playersWithTeam with matching team_id and GK position
        const candidateGks = playersWithTeam.filter(p => (p.team_id === concededTeamId) && ((p.position || '').toString().toLowerCase().includes('gole')));
        if (candidateGks.length === 0) return;
        // pick GK with highest perMatchEventCounts
        const counts = perMatchEventCounts[matchId] || {};
        let bestGk = candidateGks[0];
        let bestCount = counts[bestGk.id] || 0;
        for (let i = 1; i < candidateGks.length; i++) {
          const g = candidateGks[i];
          const c = counts[g.id] || 0;
          if (c > bestCount) {
            bestCount = c;
            bestGk = g;
          }
        }
        goalsConcededByGk[bestGk.id] = (goalsConcededByGk[bestGk.id] || 0) + 1;
      });

      const goldenGloveList = [...playersWithTeam]
        .filter((p) => {
          const pos = (p.position || '').toString().trim().toLowerCase();
          return pos === 'goleiro' || pos === 'gol' || pos === 'gk' || pos.includes('gole');
        })
        .map((p) => ({
          ...p,
          // prefer goals conceded while the GK was likely on court; fallback to team goals against
          goals_conceded: goalsConcededByGk[p.id] ?? (teamGoalsAgainst[p.team_id] || 0),
          _eventsCount: playerEventCounts[p.id] || 0,
        }))
        // Excluir goleiros de equipes que nao jogaram
        .filter((p) => (teamMatchesPlayed[p.team_id] || 0) > 0)
        // manter goleiros mesmo que nao tenham eventos, pois podem ter jogado mesmo sem registros de eventos
        .sort((a, b) => {
          if ((a.goals_conceded || 0) !== (b.goals_conceded || 0)) {
            return (a.goals_conceded || 0) - (b.goals_conceded || 0);
          }
          // preferir quem teve mais eventos (proxy de tempo jogado)
          if (((b as any)._eventsCount || 0) !== ((a as any)._eventsCount || 0)) return ((b as any)._eventsCount || 0) - ((a as any)._eventsCount || 0);
          if ((b.clean_sheets || 0) !== (a.clean_sheets || 0)) return (b.clean_sheets || 0) - (a.clean_sheets || 0);
          return a.name.localeCompare(b.name);
        })
        .slice(0, 10);

      // --- LOGICA CRAQUE DA UNIDADE ATUAL (NOITE/RODADA) ---
      // --- LOGICA CRAQUE DA UNIDADE ATUAL (NOITE/RODADA) por partida ---
      const roundMvpsList: Record<string, RankingPlayer[]> = {};
      const calculatedRoundMvps: Record<string, RankingPlayer> = {};
      const roundHighlights: Record<string, string | null> = {};

      // Create map of matches by unit (round/night)
      const matchesByUnit: Record<string, Array<{
        id?: string | null;
        round: unknown;
        night?: unknown;
        status: unknown;
        team_a_id: string;
        team_b_id: string;
        team_a_score: number;
        team_b_score: number;
      }>> = {};

      matchesData.forEach((m) => {
        const roundValue = Number(m.round || 0);
        const unitValue = groupUnit === 'round' ? roundValue : m.night;
        const unitKey = unitValue === null || unitValue === undefined ? '' : String(unitValue).trim();
        if (!matchesByUnit[unitKey]) matchesByUnit[unitKey] = [];
        matchesByUnit[unitKey].push(m as any);
      });

      Object.keys(matchesByUnit).forEach((unitKey) => {
        const matchesInUnit = matchesByUnit[unitKey] || [];
        const winners: RankingPlayer[] = [];

        matchesInUnit.forEach((mt) => {
          // compute stats for this match only
          const matchStats: Record<string, { points: number; goals: number; assists: number; firstEvent: number }> = {};
          const matchId = mt.id ? String((mt.id as unknown) || '') : '';

          eventsData.forEach((ev) => {
            const evMatchId = ev.match_id ? String(ev.match_id) : (ev.matches ? String(ev.matches?.round || '') : '');
            if (!matchId || evMatchId !== matchId) return;

            if (ev.event_type === 'gol') {
              const goalType = ev.metadata?.goal_type;
              const isOwnGoal = goalType === 'contra' || Boolean(ev.commentary && String(ev.commentary).toUpperCase().includes('[CONTRA]'));
              if (ev.player_id && !isOwnGoal) {
                if (!matchStats[ev.player_id]) matchStats[ev.player_id] = { points: 0, goals: 0, assists: 0, firstEvent: ev.minute };
                matchStats[ev.player_id].points += 1;
                matchStats[ev.player_id].goals += 1;
                if (ev.minute < matchStats[ev.player_id].firstEvent) matchStats[ev.player_id].firstEvent = ev.minute;
              }
              if (ev.assistant_id && !isOwnGoal) {
                if (!matchStats[ev.assistant_id]) matchStats[ev.assistant_id] = { points: 0, goals: 0, assists: 0, firstEvent: ev.minute };
                matchStats[ev.assistant_id].points += 1;
                matchStats[ev.assistant_id].assists += 1;
                if (ev.minute < matchStats[ev.assistant_id].firstEvent) matchStats[ev.assistant_id].firstEvent = ev.minute;
              }
            }
            if (ev.event_type === 'assistencia' && ev.player_id) {
              if (!matchStats[ev.player_id]) matchStats[ev.player_id] = { points: 0, goals: 0, assists: 0, firstEvent: ev.minute };
              matchStats[ev.player_id].points += 1;
              matchStats[ev.player_id].assists += 1;
              if (ev.minute < matchStats[ev.player_id].firstEvent) matchStats[ev.player_id].firstEvent = ev.minute;
            }
          });

          const sorted = Object.entries(matchStats).sort(([, a], [, b]) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.goals !== a.goals) return b.goals - a.goals;
            if (b.assists !== a.assists) return b.assists - a.assists;
            return a.firstEvent - b.firstEvent;
          });

          if (sorted.length > 0) {
            const winnerId = sorted[0][0];
            const player = playersWithTeam.find((p) => p.id === winnerId);
            if (player) winners.push(player);
          }
        });

        roundMvpsList[unitKey] = winners;
        if (winners.length > 0) calculatedRoundMvps[unitKey] = winners[0];
      });

      // Compute highlights per unit: goals per player across the unit
      const unitGoals: Record<string, Record<string, number>> = {};
      eventsData.forEach((ev) => {
        if (ev.event_type !== 'gol') return;
        const goalType = ev.metadata?.goal_type;
        const isOwnGoal = goalType === 'contra' || Boolean(ev.metadata?.goal_type === 'contra');
        if (isOwnGoal) return;
        const roundValue = Number(ev.matches?.round || 0);
        const unitValue = groupUnit === 'round' ? roundValue : ev.matches?.night;
        const unitKey = unitValue === null || unitValue === undefined ? '' : String(unitValue).trim();
        if (!unitGoals[unitKey]) unitGoals[unitKey] = {};
        if (ev.player_id) unitGoals[unitKey][ev.player_id] = (unitGoals[unitKey][ev.player_id] || 0) + 1;
      });

      Object.keys(unitGoals).forEach((unitKey) => {
        const goalsMap = unitGoals[unitKey] || {};
        const sorted = Object.entries(goalsMap).sort(([, a], [, b]) => b - a);
        if (sorted.length === 0) {
          roundHighlights[unitKey] = null;
          return;
        }
        const top = sorted[0][1] || 0;
        const second = sorted[1] ? sorted[1][1] : 0;
        // highlight if top is notably greater than second (>= second + 2)
        if (top >= second + 2) {
          roundHighlights[unitKey] = sorted[0][0];
        } else {
          roundHighlights[unitKey] = null;
        }
      });

      const sortedRounds = Object.keys(matchesByUnit).filter(k => k !== '').sort((a, b) => {
        // numeric compare when possible
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.localeCompare(b);
      });

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
        roundMvpsList,
        roundHighlights,
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

