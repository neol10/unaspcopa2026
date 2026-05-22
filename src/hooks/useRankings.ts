import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useDivisionContext } from '../contexts/DivisionContext';
import { useTournamentConfig } from './useTournamentConfig';
import { readFreshCache, shouldUseClientCache } from '../lib/clientCache';
import { fetchPublicData } from '../lib/apiData';
import { Player } from './usePlayers';

export interface RankingPlayer extends Player {
  team_name?: string;
  team_badge_url?: string;
  mvp_votes?: number;
  goals_conceded?: number;
  fair_play_points?: number;
}

type RankingsPayload = {
  players: Array<Player & { teams?: { name?: string; badge_url?: string } }>;
  votes: Array<{ player_id: string }>;
  events: Array<{
    player_id: string | null;
    assistant_id?: string | null;
    event_type: 'gol' | 'assistencia' | string;
    minute: number;
    metadata?: { goal_type?: string | null } | null;
    match_id?: string | null;
    commentary?: string | null;
  }>;
  matches: Array<{
    id?: string | null;
    round: number;
    night?: number | null;
    status: string;
    team_a_id: string;
    team_b_id: string;
    team_a_score: number;
    team_b_score: number;
  }>;
};

const emptyRankings = {
  scorers: [] as RankingPlayer[],
  assistants: [] as RankingPlayer[],
  goalkeepers: [] as RankingPlayer[],
  galeraRank: [] as RankingPlayer[],
  disciplined: [] as RankingPlayer[],
  roundMvps: {} as Record<string, RankingPlayer>,
  roundMvpsList: {} as Record<string, RankingPlayer[]>,
  roundHighlights: {} as Record<string, string | null>,
  availableRounds: [] as string[],
};

export const useRankings = () => {
  const queryClient = useQueryClient();
  const { division } = useDivisionContext();
  const { config } = useTournamentConfig();
  const groupUnit = config?.group_unit === 'round' ? 'round' : 'night';
  const cacheKey = `rankings_cache_v3_${division}_${groupUnit}`;
  const useCache = shouldUseClientCache();

  const loadCached = () => {
    if (!useCache) return null;
    return readFreshCache<typeof emptyRankings>(cacheKey, 1000 * 60 * 2);
  };

  const saveCached = (data: typeof emptyRankings) => {
    if (typeof window === 'undefined' || !useCache) return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // noop
    }
  };

  const cached = loadCached();

  const query = useQuery({
    queryKey: ['rankings', division, groupUnit],
    queryFn: async () => {
      const payload = await fetchPublicData<RankingsPayload>('rankings', { division });
      const playersData = payload.players || [];
      const votesData = payload.votes || [];
      const eventsData = payload.events || [];
      const matchesData = payload.matches || [];

      const voteCounts: Record<string, number> = {};
      votesData.forEach((v) => {
        if (v.player_id) voteCounts[v.player_id] = (voteCounts[v.player_id] || 0) + 1;
      });

      const playersWithTeam: RankingPlayer[] = playersData.map((p) => ({
        ...p,
        team_name: p.teams?.name,
        team_badge_url: p.teams?.badge_url,
        mvp_votes: voteCounts[p.id] || 0,
      }));

      const assistCounts: Record<string, number> = {};
      eventsData.forEach((ev) => {
        if (ev.event_type === 'gol') {
          const goalType = ev.metadata?.goal_type;
          const isOwnGoal = goalType === 'contra' || Boolean(ev.commentary && String(ev.commentary).toUpperCase().includes('[CONTRA]'));
          if (!isOwnGoal && ev.assistant_id) {
            assistCounts[ev.assistant_id] = (assistCounts[ev.assistant_id] || 0) + 1;
          }
          return;
        }
        if (ev.event_type === 'assistencia' && ev.player_id) {
          assistCounts[ev.player_id] = (assistCounts[ev.player_id] || 0) + 1;
        }
      });

      const teamGoalsAgainst: Record<string, number> = {};
      const teamMatchesPlayed: Record<string, number> = {};
      matchesData.forEach((m) => {
        const scoreA = m.team_a_score || 0;
        const scoreB = m.team_b_score || 0;
        const looksPlayed = m.status === 'finalizado' || m.status === 'ao_vivo' || scoreA > 0 || scoreB > 0;
        if (!looksPlayed) return;
        teamGoalsAgainst[m.team_a_id] = (teamGoalsAgainst[m.team_a_id] || 0) + scoreB;
        teamGoalsAgainst[m.team_b_id] = (teamGoalsAgainst[m.team_b_id] || 0) + scoreA;
        teamMatchesPlayed[m.team_a_id] = (teamMatchesPlayed[m.team_a_id] || 0) + 1;
        teamMatchesPlayed[m.team_b_id] = (teamMatchesPlayed[m.team_b_id] || 0) + 1;
      });

      const mostCardedList = [...playersWithTeam]
        .map((p) => ({ ...p, fair_play_points: (p.red_cards || 0) * 3 + (p.yellow_cards || 0) }))
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

      const matchesById: Record<string, (typeof matchesData)[number]> = {};
      matchesData.forEach((m) => { if (m.id) matchesById[m.id] = m; });

      const playerEventCounts: Record<string, number> = {};
      const perMatchEventCounts: Record<string, Record<string, number>> = {};
      eventsData.forEach((ev) => {
        if (ev.player_id) playerEventCounts[ev.player_id] = (playerEventCounts[ev.player_id] || 0) + 1;
        if (ev.assistant_id) playerEventCounts[ev.assistant_id] = (playerEventCounts[ev.assistant_id] || 0) + 1;
        const matchId = ev.match_id || '';
        if (!perMatchEventCounts[matchId]) perMatchEventCounts[matchId] = {};
        if (ev.player_id) perMatchEventCounts[matchId][ev.player_id] = (perMatchEventCounts[matchId][ev.player_id] || 0) + 1;
        if (ev.assistant_id) perMatchEventCounts[matchId][ev.assistant_id] = (perMatchEventCounts[matchId][ev.assistant_id] || 0) + 1;
      });

      const goalsConcededByGk: Record<string, number> = {};
      eventsData.forEach((ev) => {
        if (ev.event_type !== 'gol') return;
        const goalType = ev.metadata?.goal_type;
        const isOwnGoal = goalType === 'contra';
        if (isOwnGoal) return;
        const matchId = ev.match_id || '';
        const scorerId = ev.player_id;
        if (!scorerId || !matchId) return;
        const scorer = playersWithTeam.find((p) => p.id === scorerId);
        const match = matchesById[matchId];
        if (!scorer || !match) return;
        const concededTeamId = match.team_a_id === scorer.team_id ? match.team_b_id : match.team_a_id;
        const candidateGks = playersWithTeam.filter((p) => p.team_id === concededTeamId && String(p.position || '').toLowerCase().includes('gole'));
        if (candidateGks.length === 0) return;
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

      const goalkeepers = [...playersWithTeam]
        .filter((p) => {
          const pos = String(p.position || '').trim().toLowerCase();
          return pos === 'goleiro' || pos === 'gol' || pos === 'gk' || pos.includes('gole');
        })
        .map((p) => ({
          ...p,
          goals_conceded: goalsConcededByGk[p.id] ?? (teamGoalsAgainst[p.team_id] || 0),
          _eventsCount: playerEventCounts[p.id] || 0,
        }))
        .filter((p) => (teamMatchesPlayed[p.team_id] || 0) > 0)
        .sort((a, b) => {
          if ((a.goals_conceded || 0) !== (b.goals_conceded || 0)) return (a.goals_conceded || 0) - (b.goals_conceded || 0);
          if (((b as any)._eventsCount || 0) !== ((a as any)._eventsCount || 0)) return ((b as any)._eventsCount || 0) - ((a as any)._eventsCount || 0);
          if ((b.clean_sheets || 0) !== (a.clean_sheets || 0)) return (b.clean_sheets || 0) - (a.clean_sheets || 0);
          return a.name.localeCompare(b.name);
        })
        .slice(0, 10);

      const roundMvpsList: Record<string, RankingPlayer[]> = {};
      const roundMvps: Record<string, RankingPlayer> = {};
      const roundHighlights: Record<string, string | null> = {};
      const matchesByUnit: Record<string, typeof matchesData> = {};

      matchesData.forEach((m) => {
        const unitValue = groupUnit === 'round' ? m.round : m.night;
        const unitKey = unitValue === null || unitValue === undefined ? '' : String(unitValue).trim();
        if (!matchesByUnit[unitKey]) matchesByUnit[unitKey] = [];
        matchesByUnit[unitKey].push(m);
      });

      Object.keys(matchesByUnit).forEach((unitKey) => {
        const winners: RankingPlayer[] = [];
        for (const mt of matchesByUnit[unitKey] || []) {
          const matchStats: Record<string, { points: number; goals: number; assists: number; firstEvent: number }> = {};
          const matchId = mt.id || '';
          eventsData.forEach((ev) => {
            if (!matchId || ev.match_id !== matchId) return;
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
            const player = playersWithTeam.find((p) => p.id === sorted[0][0]);
            if (player) winners.push(player);
          }
        }

        roundMvpsList[unitKey] = winners;
        if (winners.length > 0) roundMvps[unitKey] = winners[0];
      });

      const unitGoals: Record<string, Record<string, number>> = {};
      eventsData.forEach((ev) => {
        if (ev.event_type !== 'gol') return;
        const goalType = ev.metadata?.goal_type;
        const isOwnGoal = goalType === 'contra';
        if (isOwnGoal || !ev.player_id) return;
        const match = matchesById[ev.match_id || ''];
        if (!match) return;
        const unitValue = groupUnit === 'round' ? match.round : match.night;
        const unitKey = unitValue === null || unitValue === undefined ? '' : String(unitValue).trim();
        if (!unitGoals[unitKey]) unitGoals[unitKey] = {};
        unitGoals[unitKey][ev.player_id] = (unitGoals[unitKey][ev.player_id] || 0) + 1;
      });

      Object.keys(unitGoals).forEach((unitKey) => {
        const sorted = Object.entries(unitGoals[unitKey] || {}).sort(([, a], [, b]) => b - a);
        if (sorted.length === 0) {
          roundHighlights[unitKey] = null;
          return;
        }
        const top = sorted[0][1] || 0;
        const second = sorted[1] ? sorted[1][1] : 0;
        roundHighlights[unitKey] = top >= second + 2 ? sorted[0][0] : null;
      });

      const availableRounds = Object.keys(matchesByUnit).filter((k) => k !== '').sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.localeCompare(b);
      });

      const result = {
        scorers: [...playersWithTeam].sort((a, b) => b.goals_count - a.goals_count).filter((p) => p.goals_count > 0).slice(0, 10),
        assistants: [...playersWithTeam]
          .map((p) => ({ ...p, assists: assistCounts[p.id] ?? p.assists ?? 0 }))
          .sort((a, b) => (b.assists || 0) - (a.assists || 0))
          .filter((p) => (p.assists || 0) > 0)
          .slice(0, 10),
        goalkeepers,
        galeraRank: [...playersWithTeam].filter((p) => (p.mvp_votes || 0) > 0).sort((a, b) => (b.mvp_votes || 0) - (a.mvp_votes || 0)).slice(0, 10),
        disciplined: mostCardedList,
        roundMvps,
        roundMvpsList,
        roundHighlights,
        availableRounds,
      };

      saveCached(result);
      return result;
    },
    initialData: cached?.data || emptyRankings,
    initialDataUpdatedAt: cached?.ts,
    placeholderData: (prev) => prev,
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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

  return {
    ...(query.data || emptyRankings),
    loading: query.isLoading && query.data === undefined,
    error: query.error && typeof (query.error as { message?: unknown }).message === 'string'
      ? String((query.error as { message: string }).message)
      : null,
    refresh: query.refetch,
  };
};
