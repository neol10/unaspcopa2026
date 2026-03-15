import { useEffect, useState } from 'react';
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
}

export const useStandings = () => {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const calculateStandings = async () => {
    try {
      setLoading(true);
      
      // 1. Buscar todas as equipes com seus grupos
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, name, group');

      if (teamsError) throw teamsError;

      // 2. Buscar todas as partidas finalizadas
      const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select('*')
        .in('status', ['finalizado', 'ao_vivo']);

      if (matchesError) throw matchesError;

      // 3. Processar classificação
      const statsMap: Record<string, Standing> = {};

      teams.forEach(team => {
        statsMap[team.id] = {
          team_id: team.id,
          team_name: team.name,
          group: team.group || 'Geral',
          points: 0,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals_for: 0,
          goals_against: 0,
          goals_diff: 0,
          percentage: 0
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
          } else if (match.team_a_score < match.team_b_score) {
            teamB.wins++;
            teamB.points += 3;
            teamA.losses++;
          } else {
            teamA.draws++;
            teamB.draws++;
            teamA.points += 1;
            teamB.points += 1;
          }
        }
      });

      const result = Object.values(statsMap).map(s => {
        s.goals_diff = s.goals_for - s.goals_against;
        s.percentage = s.played > 0 ? (s.points / (s.played * 3)) * 100 : 0;
        return s;
      });

      // Ordenação: Pontos -> Vitórias -> Saldo de Gols -> Gols Pró
      result.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.goals_diff !== a.goals_diff) return b.goals_diff - a.goals_diff;
        return b.goals_for - a.goals_for;
      });

      setStandings(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    calculateStandings();

    // Atualizar quando houver mudanças em matches
    const channel = supabase
      .channel('public:standings_calc')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        calculateStandings();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        calculateStandings();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { standings, loading, error, refresh: calculateStandings };
};
