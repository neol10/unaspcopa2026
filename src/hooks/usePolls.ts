import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  active: boolean;
}

export const usePolls = () => {
  const queryClient = useQueryClient();
  const [localVotedMap, setLocalVotedMap] = useState<Record<string, true>>({});
  const cacheKey = 'poll_active_cache_v1';

  const loadCachedPoll = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts: number; data: Poll | null };
      if (!parsed?.ts) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveCachedPoll = (data: Poll | null) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // noop
    }
  };

  const cached = loadCachedPoll();

  const query = useQuery({
    queryKey: ['activePoll'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('polls')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const result = (data as Poll) || null;
      saveCachedPoll(result);
      return result;
    },
    initialData: cached?.data ?? null,
    initialDataUpdatedAt: cached?.ts,
    placeholderData: (prev) => prev,
    staleTime: 1000 * 60 * 5, // 5 minutos
    gcTime: 1000 * 60 * 30,  // 30 minutos em memória
  });

  const pollId = query.data?.id || null;
  const storageHasVoted = pollId ? localStorage.getItem(`poll_voted_${pollId}`) === 'true' : false;
  const hasVoted = Boolean(pollId && (storageHasVoted || localVotedMap[pollId]));

  const voteMutation = useMutation({
    mutationFn: async (optionId: string) => {
      if (!query.data || hasVoted) return null;
      
      const { error } = await supabase.rpc('increment_poll_vote', {
        poll_id_param: query.data.id,
        option_id_param: optionId
      });
      if (error) throw error;
      return optionId;
    },
    onSuccess: (optionId) => {
      const activePollId = query.data?.id;
      if (!optionId || !activePollId) return;
      localStorage.setItem(`poll_voted_${activePollId}`, 'true');
      setLocalVotedMap((prev) => ({ ...prev, [activePollId]: true }));
      queryClient.invalidateQueries({ queryKey: ['activePoll'] });
    },
    onError: (err: unknown) => {
      console.error('Erro ao registrar voto', err);
      alert("Falha ao registrar voto. Tente novamente.");
    }
  });

  return { 
    activePoll: query.data, 
    loading: query.isLoading && query.data === undefined, 
    error: (
      query.error &&
      typeof (query.error as { message?: unknown }).message === 'string'
        ? String((query.error as { message: string }).message)
        : null
    ),
    hasVoted, 
    submitVote: voteMutation.mutateAsync,
    refresh: query.refetch,
  };
};

