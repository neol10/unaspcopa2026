import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';

export interface MvpVoteCount {
  player_id: string;
  player_name: string;
  player_number: number;
  team_name: string;
  vote_count: number;
}

export const useMvpVoting = (round: string) => {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const cacheKey = `round_mvp_cache_v1_${round || 'none'}`;

  const loadCachedVotes = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts: number; data: { voteCounts: MvpVoteCount[]; userVote: string | null } };
      if (!parsed?.ts || !parsed?.data) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveCachedVotes = (data: { voteCounts: MvpVoteCount[]; userVote: string | null }) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // noop
    }
  };

  const cached = loadCachedVotes();
  const cachedData = cached?.data ? { ...cached.data, userVote: null } : null;

  type VoteRow = {
    player_id: string;
    players?: {
      name?: string | null;
      number?: number | null;
      teams?: { name?: string | null } | null;
    } | null;
  };

  const query = useQuery({
    queryKey: ['roundMvpVotes', round],
    queryFn: async () => {
      if (!round) return { voteCounts: [], userVote: null };
      
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
      (votesRes.data as VoteRow[] || []).forEach((v) => {
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
      const result = {
        voteCounts: sorted,
        userVote: myVoteRes.data?.player_id || null
      };
      saveCachedVotes(result);
      return result;
    },
    enabled: !!round,
    initialData: cachedData || { voteCounts: [], userVote: null },
    initialDataUpdatedAt: cached?.ts,
    placeholderData: (prev) => prev,
  });

  const voteMutation = useMutation({
    mutationFn: async (playerId: string) => {
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
    loading: query.isLoading && query.data === undefined,
    error: (
      query.error &&
      typeof (query.error as { message?: unknown }).message === 'string'
        ? String((query.error as { message: string }).message)
        : null
    ),
    vote: voteMutation.mutateAsync,
    refresh: query.refetch,
  };
};

