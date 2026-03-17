import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['matchMvpVotes', matchId, user?.id],
    queryFn: async () => {
      if (!matchId) return { voteCounts: [], userVote: null };
      
      const [votesRes, myVoteRes] = await Promise.all([
        supabase
          .from('match_mvp_votes')
          .select(`
            player_id,
            players (
              name,
              teams (name)
            )
          `)
          .eq('match_id', matchId),
        user ? supabase
          .from('match_mvp_votes')
          .select('player_id')
          .eq('match_id', matchId)
          .eq('user_id', user.id)
          .maybeSingle() : Promise.resolve({ data: null })
      ]);

      if (votesRes.error) throw votesRes.error;

      const counts: Record<string, MatchMvpVoteCount> = {};
      (votesRes.data || []).forEach((v: any) => {
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
      return {
        voteCounts: sorted,
        userVote: myVoteRes.data?.player_id || null
      };
    },
    enabled: !!matchId
  });

  const voteMutation = useMutation({
    mutationFn: async (playerId: string) => {
      if (!user) throw new Error('Faça login para votar!');
      if (!matchId) return;

      const { error } = await supabase.from('match_mvp_votes').insert({
        match_id: matchId,
        player_id: playerId,
        user_id: user.id
      });

      if (error) throw error;
      return playerId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matchMvpVotes', matchId] });
    }
  });

  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`public:match_mvp_votes:${matchId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'match_mvp_votes',
        filter: `match_id=eq.${matchId}`
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['matchMvpVotes', matchId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, queryClient]);

  const { voteCounts = [], userVote = null } = query.data || {};

  return { voteCounts, userVote, loading: query.isLoading, vote: voteMutation.mutateAsync, refresh: query.refetch };
};
