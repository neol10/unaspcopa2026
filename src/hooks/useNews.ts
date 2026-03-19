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

type NewsRow = News & {
  created_at?: string;
};

const parseNewsTime = (row: Partial<NewsRow>) => {
  const raw = (row.published_at || row.created_at || '') as string;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
};

export const useNews = (limit?: number) => {
  const query = useQuery({
    queryKey: ['news', limit || 'all'],
    queryFn: async () => {
      // Evita depender de coluna específica para ordenação (ex.: published_at)
      // e reduz chance de travar por erro de schema/RLS.
      let q = supabase.from('news').select('*');
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;

      const items = ((data as NewsRow[]) || []).slice();
      items.sort((a, b) => parseNewsTime(b) - parseNewsTime(a));
      return items as News[];
    },
    staleTime: 1000 * 60 * 10, // 10 min
    gcTime: 1000 * 60 * 30,    // 30 min
    retry: 1,
    retryDelay: 1000,
  });

  return { 
    news: query.data || [], 
    loading: query.isLoading,
    error: (query.error as any)?.message || null,
    refresh: query.refetch 
  };
};
