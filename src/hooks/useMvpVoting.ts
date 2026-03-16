import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface MvpVoteCount {
  player_id: string;
  player_name: string;
  player_number: number;
  team_name: string;
  vote_count: number;
}

export const useMvpVoting = (round: string) => {
  const [voteCounts, setVoteCounts] = useState<MvpVoteCount[]>([]);
  const [userVote, setUserVote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchVotes = async () => {
    try {
      setLoading(true);
      
      // Buscar votos da rodada com join nos jogadores
      const { data: votes } = await supabase
        .from('round_mvp_votes')
        .select(`
          player_id,
          players (
            id, name, number,
            teams (name)
          )
        `)
        .eq('round', round);

      if (votes) {
        // Agrupar votos por jogador
        const counts: Record<string, MvpVoteCount> = {};
        votes.forEach((v: any) => {
          const pid = v.player_id;
          if (!counts[pid]) {
            counts[pid] = {
              player_id: pid,
              player_name: v.players?.name || 'Desconhecido',
              player_number: v.players?.number || 0,
              team_name: v.players?.teams?.name || '',
              vote_count: 0,
            };
          }
          counts[pid].vote_count++;
        });
        
        const sorted = Object.values(counts).sort((a, b) => b.vote_count - a.vote_count);
        setVoteCounts(sorted);
      }

      // Verificar voto do usuário atual
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: myVote } = await supabase
          .from('round_mvp_votes')
          .select('player_id')
          .eq('user_id', user.id)
          .eq('round', round)
          .maybeSingle();
        setUserVote(myVote?.player_id || null);
      } else {
        setUserVote(null);
      }
    } catch (_) {
      // silencioso
    } finally {
      setLoading(false);
    }
  };

  const vote = async (playerId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Faça login para votar!');
    
    const { error } = await supabase.from('round_mvp_votes').insert({
      user_id: user.id,
      player_id: playerId,
      round,
    });
    
    if (error) throw error;
    setUserVote(playerId);
    fetchVotes();
  };

  useEffect(() => {
    if (round) fetchVotes();
  }, [round]);

  return { voteCounts, userVote, loading, vote, refresh: fetchVotes };
};
