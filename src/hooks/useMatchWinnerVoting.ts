import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '../contexts/AuthContext';
import { readFreshCache, shouldUseClientCache } from '../lib/clientCache';
import { fetchPublicData } from '../lib/apiData';
import { supabase } from '../lib/supabase';

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
  const anonId = typeof window !== 'undefined' ? (localStorage.getItem('anon_device_id') || (() => { const id = crypto.randomUUID(); localStorage.setItem('anon_device_id', id); return id; })()) : 'anon';
  const effectiveUserId = user?.id || anonId;
  const cacheKey = `match_winner_votes_cache_v1_${matchId || 'none'}_${effectiveUserId}`;

  const loadCachedVotes = () => shouldUseClientCache() ? readFreshCache<{ votes: MatchWinnerVotes; userVote: WinnerVoteOption | null }>(cacheKey, 1000 * 60 * 2) : null;

  const saveCachedVotes = (data: { votes: MatchWinnerVotes; userVote: WinnerVoteOption | null }) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // noop
    }
  };

  const cached = loadCachedVotes();
  const cachedData = cached?.data
    ? { ...cached.data, userVote: user ? cached.data.userVote : null }
    : null;

  const query = useQuery({
    queryKey: ['matchWinnerVotes', matchId, user?.id],
    queryFn: async () => {
      if (!matchId) return { votes: { team_a: 0, draw: 0, team_b: 0, total: 0 }, userVote: null };

      const votesRes = await fetchPublicData<{ data: { vote: WinnerVoteOption; user_id?: string | null }[]; userVote?: WinnerVoteOption | null }>('match_winner_votes', {
        matchId,
        userId: effectiveUserId,
      });

      const counts: MatchWinnerVotes = { team_a: 0, draw: 0, team_b: 0, total: 0 };
      (votesRes.data || []).forEach((v: { vote: WinnerVoteOption }) => {
        if (v.vote in counts) {
          counts[v.vote as keyof Omit<MatchWinnerVotes, 'total'>]++;
          counts.total++;
        }
      });

      const result = {
        votes: counts,
        userVote: votesRes.userVote || null
      };
      saveCachedVotes(result);
      return result;
    },
    enabled: !!matchId,
    initialData: cachedData || undefined,
    initialDataUpdatedAt: cached?.ts,
    placeholderData: (prev) => prev,
  });

  const voteMutation = useMutation({
    mutationFn: async (vote: WinnerVoteOption) => {
      if (!matchId) return;

      let error = null;

      // Usar a API serverless para evitar erros 403 no console devido a RLS
      if (true) {
        // Usar API serverless (pula RLS usando service_role)
        const response = await fetch('/api/public-data?resource=match_winner_votes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchId, userId: effectiveUserId, vote }),
        });
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(body || 'Falha ao registrar voto');
        }
      }

      return vote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matchWinnerVotes', matchId] });
    }
  });

  useEffect(() => {
    if (!matchId) return;
    const channel = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['matchWinnerVotes', matchId] });
    }, 30000);

    return () => {
      window.clearInterval(channel);
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

