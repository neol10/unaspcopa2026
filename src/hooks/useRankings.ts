import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Player } from './usePlayers';

export interface RankingPlayer extends Player {
  team_name?: string;
  team_badge_url?: string;
  mvp_votes?: number;
}

export const useRankings = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['rankings'],
    queryFn: async () => {
      
      // 1-3. Buscar dados em paralelo
      const [playersRes, votesRes, eventsRes] = await Promise.all([
        supabase.from('players').select('*, teams:team_id(name, badge_url)'),
        supabase.from('match_mvp_votes').select('player_id'),
        supabase.from('match_events').select('*, matches:match_id(round)').in('event_type', ['gol', 'assistencia'])
      ]);

      if (playersRes.error) throw playersRes.error;
      
      const playersData = playersRes.data || [];
      const votesData = votesRes.data || [];
      const eventsData = eventsRes.data || [];

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

      // --- LOGICA CRAQUE DA RODADA ---
      const roundStats: Record<string, Record<string, { points: number, goals: number, firstEvent: number }>> = {};
      const roundsFound = new Set<string>();

      eventsData.forEach(ev => {
        const round = ev.matches?.round;
        if (!round) return;
        roundsFound.add(String(round));

        if (!roundStats[round]) roundStats[round] = {};

        // Gols
        if (ev.event_type === 'gol' && ev.metadata?.goal_type !== 'contra') {
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

      return {
        scorers: [...playersWithTeam].sort((a, b) => b.goals_count - a.goals_count).filter(p => p.goals_count > 0).slice(0, 10),
        assistants: [...playersWithTeam].sort((a, b) => b.assists - a.assists).filter(p => p.assists > 0).slice(0, 10),
        goalkeepers: [...playersWithTeam].filter(p => p.position === 'Goleiro').sort((a, b) => (b.clean_sheets || 0) - (a.clean_sheets || 0)).slice(0, 10),
        galeraRank: [...playersWithTeam].filter(p => p.mvp_votes > 0).sort((a, b) => b.mvp_votes - a.mvp_votes).slice(0, 10),
        disciplined: [...playersWithTeam].sort((a, b) => (a.red_cards * 3 + a.yellow_cards) - (b.red_cards * 3 + b.yellow_cards)).slice(0, 10),
        roundMvps: calculatedRoundMvps,
        availableRounds: sortedRounds
      };
    },
    staleTime: 1000 * 60 * 5, // 5 min
    gcTime: 1000 * 60 * 15,   // 15 min
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

  return { ...data, loading: query.isLoading };
};
