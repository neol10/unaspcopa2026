import { useState, useEffect } from 'react';
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
  const [hasVoted, setHasVoted] = useState(false);

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
      return (data as Poll) || null;
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
    gcTime: 1000 * 60 * 30,  // 30 minutos em memória
  });

  useEffect(() => {
    if (query.data) {
      const voted = localStorage.getItem(`poll_voted_${query.data.id}`);
      setHasVoted(!!voted);
    }
  }, [query.data]);

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
      if (!optionId || !query.data) return;
      localStorage.setItem(`poll_voted_${query.data.id}`, 'true');
      setHasVoted(true);
      queryClient.invalidateQueries({ queryKey: ['activePoll'] });
    },
    onError: (err: any) => {
      console.error("Erro ao registrar voto", err);
      alert("Falha ao registrar voto. Tente novamente.");
    }
  });

  return { 
    activePoll: query.data, 
    loading: query.isLoading, 
    hasVoted, 
    submitVote: voteMutation.mutateAsync 
  };
};
