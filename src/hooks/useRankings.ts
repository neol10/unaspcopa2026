import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Player } from './usePlayers';

export interface RankingPlayer extends Player {
  team_name?: string;
  team_badge_url?: string;
  mvp_votes?: number;
}

export const useRankings = () => {
  const [scorers, setScorers] = useState<RankingPlayer[]>([]);
  const [assistants, setAssistants] = useState<RankingPlayer[]>([]);
  const [goalkeepers, setGoalkeepers] = useState<RankingPlayer[]>([]);
  const [galeraRank, setGaleraRank] = useState<RankingPlayer[]>([]);
  const [disciplined, setDisciplined] = useState<RankingPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRankings = async () => {
    try {
      setLoading(true);
      
      // 1. Buscar Jogadores
      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select(`
          *,
          teams:team_id(name, badge_url)
        `);

      if (playersError) throw playersError;

      // 2. Buscar Votos de MVP (Craque da Galera)
      const { data: votesData, error: votesError } = await supabase
        .from('match_mvp_votes')
        .select('player_id');

      if (votesError) throw votesError;

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

      // Top Artilheiros
      setScorers([...playersWithTeam].sort((a, b) => b.goals_count - a.goals_count).filter(p => p.goals_count > 0).slice(0, 10));
      
      // Top Assistentes
      setAssistants([...playersWithTeam].sort((a, b) => b.assists - a.assists).filter(p => p.assists > 0).slice(0, 10));

      // Luva de Ouro (Goleiros)
      setGoalkeepers([...playersWithTeam]
        .filter(p => p.position === 'Goleiro')
        .sort((a, b) => (b.clean_sheets || 0) - (a.clean_sheets || 0))
        .slice(0, 10));

      // Craque da Galera (Global)
      setGaleraRank([...playersWithTeam]
        .filter(p => p.mvp_votes > 0)
        .sort((a, b) => b.mvp_votes - a.mvp_votes)
        .slice(0, 10));

      // Disciplina (Menos cartões, peso maior para vermelho)
      setDisciplined([...playersWithTeam]
        .sort((a, b) => (a.red_cards * 3 + a.yellow_cards) - (b.red_cards * 3 + b.yellow_cards))
        .slice(0, 10));

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRankings();

    const channel = supabase
      .channel('public:rankings_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => fetchRankings())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_mvp_votes' }, () => fetchRankings())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { scorers, assistants, goalkeepers, galeraRank, disciplined, loading };
};
