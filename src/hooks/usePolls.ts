import { useEffect, useState } from 'react';
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
  const [activePoll, setActivePoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasVoted, setHasVoted] = useState(false);

  const fetchActivePoll = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('polls')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
        
      if (error) throw error; // maybeSingle() retorna null sem erro quando não encontra registro
      
      if (data) {
        setActivePoll(data);
        // Verifica no localStorage se ja votou nesta
        const voted = localStorage.getItem(`poll_voted_${data.id}`);
        setHasVoted(!!voted);
      }
    } catch (err: any) {
      console.error("Erro ao buscar enquete", err);
    } finally {
      setLoading(false);
    }
  };

  const submitVote = async (optionId: string) => {
    if (!activePoll || hasVoted) return;
    
    // Calcula as novas opcoes somando voto
    const updatedOptions = activePoll.options.map(opt => 
      opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt
    );

    try {
      const { error } = await supabase.rpc('increment_poll_vote', {
        poll_id_param: activePoll.id,
        option_id_param: optionId
      });
        
      if (error) throw error;
      
      // Atualiza estado local
      setActivePoll({ ...activePoll, options: updatedOptions });
      setHasVoted(true);
      localStorage.setItem(`poll_voted_${activePoll.id}`, 'true');
      
    } catch (err: any) {
      console.error("Erro ao registrar voto", err);
      alert("Falha ao registrar voto. Tente novamente.");
    }
  };

  useEffect(() => {
    fetchActivePoll();
  }, []);

  return { activePoll, loading, hasVoted, submitVote };
};
