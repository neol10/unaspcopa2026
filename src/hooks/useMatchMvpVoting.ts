import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';

export interface MatchMvpVoteCount {
  player_id: string;
  player_name: string;
  team_name: string;
  vote_count: number;
}

export const useMatchMvpVoting = (matchId: string) => {
  const { user } = useAuthContext();
  const [voteCounts, setVoteCounts] = useState<MatchMvpVoteCount[]>([]);
  const [userVote, setUserVote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchVotes = async () => {
    if (!matchId) return;
    try {
      setLoading(true);
      
      // Buscar votos da partida
      const { data: votes, error } = await supabase
        .from('match_mvp_votes')
        .select(`
          player_id,
          players (
            name,
            teams (name)
          )
        `)
        .eq('match_id', matchId);

      if (error) throw error;

      if (votes) {
        const counts: Record<string, MatchMvpVoteCount> = {};
        votes.forEach((v: any) => {
          const pid = v.player_id;
          if (!counts[pid]) {
            counts[pid] = {
              player_id: pid,
              player_name: v.players?.name || 'Desconhecido',
              team_name: v.players?.teams?.name || '',
              vote_count: 0,
            };
          }
          counts[pid].vote_count++;
        });
        
        const sorted = Object.values(counts).sort((a, b) => b.vote_count - a.vote_count);
        setVoteCounts(sorted);
      }

      // Verificar voto do usuário
      if (user) {
        const { data: myVote } = await supabase
          .from('match_mvp_votes')
          .select('player_id')
          .eq('match_id', matchId)
          .eq('user_id', user.id)
          .maybeSingle();
        setUserVote(myVote?.player_id || null);
      }
    } catch (err: any) {
      console.error('Error fetching match votes:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const vote = async (playerId: string) => {
    if (!user) throw new Error('Faça login para votar!');
    if (!matchId) return;

    try {
      const { error } = await supabase.from('match_mvp_votes').insert({
        match_id: matchId,
        player_id: playerId,
        user_id: user.id
      });

      if (error) throw error;
      
      setUserVote(playerId);
      fetchVotes();
    } catch (err: any) {
      console.error('Error voting:', err.message);
      throw err;
    }
  };

  useEffect(() => {
    fetchVotes();

    const channel = supabase
      .channel(`public:match_mvp_votes:${matchId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'match_mvp_votes',
        filter: `match_id=eq.${matchId}`
      }, () => {
        fetchVotes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, user]);

  return { voteCounts, userVote, loading, vote, refresh: fetchVotes };
};
