import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface PollOption {
  id: string;
  text: string;
  votes: number;
  image_url?: string;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  active: boolean;
}

const normalizePoll = (value: unknown): Poll | null => {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<Poll> & { options?: unknown };
  const rawOptions = candidate.options;

  const optionsSource = (() => {
    if (Array.isArray(rawOptions)) return rawOptions;
    if (typeof rawOptions === 'string') {
      try {
        const parsed = JSON.parse(rawOptions) as unknown;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  })();

  const options: PollOption[] = optionsSource
    .map((opt, index) => {
      if (!opt || typeof opt !== 'object') return null;
      const optionCandidate = opt as Partial<PollOption>;
      const text = typeof optionCandidate.text === 'string' ? optionCandidate.text.trim() : '';
      if (!text) return null;
      const votes = Number(optionCandidate.votes ?? 0);
      const imageUrl = typeof optionCandidate.image_url === 'string' ? optionCandidate.image_url.trim() : '';
      return {
        id: typeof optionCandidate.id === 'string' && optionCandidate.id.trim()
          ? optionCandidate.id
          : `opt_${index}`,
        text,
        votes: Number.isFinite(votes) ? votes : 0,
        image_url: imageUrl || undefined,
      };
    })
    .filter((opt): opt is PollOption => Boolean(opt));

  if (typeof candidate.id !== 'string' || typeof candidate.question !== 'string') return null;

  return {
    id: candidate.id,
    question: candidate.question,
    options,
    active: Boolean(candidate.active),
  };
};

export const usePolls = () => {
  const queryClient = useQueryClient();
  const [localVotedMap, setLocalVotedMap] = useState<Record<string, true>>({});
  const cacheKey = 'poll_active_cache_v1';

  const loadCachedPoll = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts: number; data: unknown };
      if (!parsed?.ts) return null;
      return {
        ts: parsed.ts,
        data: normalizePoll(parsed.data),
      };
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
      const result = normalizePoll(data);
      saveCachedPoll(result);
      return result;
    },
    initialData: cached?.data ?? null,
    initialDataUpdatedAt: cached?.ts,
    placeholderData: (prev) => prev,
    staleTime: 1000 * 20,
    gcTime: 1000 * 60 * 30,  // 30 minutos em memória
    refetchInterval: 1000 * 30,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
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

