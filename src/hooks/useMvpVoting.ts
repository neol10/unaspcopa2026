import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface MvpVoteCount {
  player_id: string;
  player_name: string;
  player_number: number;
  team_name: string;
  vote_count: number;
}

export const useMvpVoting = (round: string) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['roundMvpVotes', round],
    queryFn: async () => {
      if (!round) return { voteCounts: [], userVote: null };
      
      const { data: { user } } = await supabase.auth.getUser();
      
      const [votesRes, myVoteRes] = await Promise.all([
        supabase
          .from('round_mvp_votes')
          .select(`
            player_id,
            players (
              id, name, number,
              teams (name)
            )
          `)
          .eq('round', round),
        user ? supabase
          .from('round_mvp_votes')
          .select('player_id')
          .eq('user_id', user.id)
          .eq('round', round)
          .maybeSingle() : Promise.resolve({ data: null })
      ]);

      const counts: Record<string, MvpVoteCount> = {};
      (votesRes.data || []).forEach((v: any) => {
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
      return {
        voteCounts: sorted,
        userVote: myVoteRes.data?.player_id || null
      };
    },
    enabled: !!round
  });

  const voteMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Faça login para votar!');
      
      const { error } = await supabase.from('round_mvp_votes').insert({
        user_id: user.id,
        player_id: playerId,
        round,
      });
      if (error) throw error;
      return playerId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roundMvpVotes', round] });
    }
  });



  const { voteCounts = [], userVote = null } = query.data || {};

  return {
    voteCounts,
    userVote,
    loading: query.isLoading,
    error: (query.error as any)?.message || null,
    vote: voteMutation.mutateAsync,
    refresh: query.refetch,
  };
};
