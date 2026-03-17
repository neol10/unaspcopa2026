import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface News {
  id: string;
  title: string;
  summary: string;
  content: string;
  image_url: string;
  published_at: string;
}

export const useNews = (limit?: number) => {
  const query = useQuery({
    queryKey: ['news', limit || 'all'],
    queryFn: async () => {
      let q = supabase.from('news').select('*').order('published_at', { ascending: false });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data as News[]) || [];
    },
    staleTime: 1000 * 60 * 10, // 10 min
    gcTime: 1000 * 60 * 30,    // 30 min
  });

  return { 
    news: query.data || [], 
    loading: query.isLoading, 
    refresh: query.refetch 
  };
};
