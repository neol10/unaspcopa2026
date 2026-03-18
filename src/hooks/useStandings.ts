import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

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

  const query = useQuery({
    queryKey: ['standings'],
    queryFn: async () => {
      
      // 1-2. Buscar dados em paralelo
      const [teamsRes, matchesRes] = await Promise.all([
        supabase.from('teams').select('id, name, group, badge_url'),
        supabase.from('matches').select('*').in('status', ['finalizado', 'ao_vivo']).order('match_date', { ascending: true })
      ]);

      if (teamsRes.error) throw teamsRes.error;
      if (matchesRes.error) throw matchesRes.error;

      const teams = teamsRes.data || [];
      const matches = matchesRes.data || [];

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

      return (result as Standing[]) || [];
    },
    staleTime: 1000 * 60 * 2, // 2 min
    gcTime: 1000 * 60 * 10,  // 10 min
  });

  useEffect(() => {
    // Atualizar quando houver mudanças em matches ou teams
    const channel = supabase
      .channel('public:standings_calc')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        queryClient.invalidateQueries({ queryKey: ['standings'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        queryClient.invalidateQueries({ queryKey: ['standings'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { 
    standings: query.data || [], 
    loading: query.isLoading, 
    error: query.error?.message || null, 
    refresh: query.refetch 
  };
};
