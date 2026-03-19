import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';

export type WinnerVoteOption = 'team_a' | 'draw' | 'team_b';

export interface MatchWinnerVotes {
  team_a: number;
  draw: number;
  team_b: number;
  total: number;
}

export const useMatchWinnerVoting = (matchId: string) => {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['matchWinnerVotes', matchId, user?.id],
    queryFn: async () => {
      if (!matchId) return { votes: { team_a: 0, draw: 0, team_b: 0, total: 0 }, userVote: null };

      const [votesRes, myVoteRes] = await Promise.all([
        supabase
          .from('match_winner_votes')
          .select('vote')
          .eq('match_id', matchId),
        user ? supabase
          .from('match_winner_votes')
          .select('vote')
          .eq('match_id', matchId)
          .eq('user_id', user.id)
          .maybeSingle() : Promise.resolve({ data: null })
      ]);

      if (votesRes.error) throw votesRes.error;

      const counts: MatchWinnerVotes = { team_a: 0, draw: 0, team_b: 0, total: 0 };
      (votesRes.data || []).forEach((v: { vote: WinnerVoteOption }) => {
        if (v.vote in counts) {
          counts[v.vote as keyof Omit<MatchWinnerVotes, 'total'>]++;
          counts.total++;
        }
      });

      return {
        votes: counts,
        userVote: myVoteRes.data?.vote || null
      };
    },
    enabled: !!matchId
  });

  const voteMutation = useMutation({
    mutationFn: async (vote: WinnerVoteOption) => {
      if (!user) throw new Error('Faça login para votar!');
      if (!matchId) return;

      const { error } = await supabase.from('match_winner_votes').upsert({
        match_id: matchId,
        user_id: user.id,
        vote: vote
      }, { onConflict: 'match_id,user_id' });

      if (error) throw error;
      return vote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matchWinnerVotes', matchId] });
    }
  });

  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`public:match_winner_votes:${matchId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'match_winner_votes',
        filter: `match_id=eq.${matchId}`
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['matchWinnerVotes', matchId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, queryClient]);

  const { votes = { team_a: 0, draw: 0, team_b: 0, total: 0 }, userVote = null } = query.data || {};

  return { 
    votes, 
    userVote, 
    loading: query.isLoading && query.data === undefined, 
    error: (
      query.error &&
      typeof (query.error as { message?: unknown }).message === 'string'
        ? String((query.error as { message: string }).message)
        : null
    ),
    vote: voteMutation.mutateAsync 
  };
};

