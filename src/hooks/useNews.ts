import { useQuery } from '@tanstack/react-query';
import { fetchPublicData } from '../lib/apiData';

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
  const cacheKey = `news_cache_v1_${limit || 'all'}`;

  const loadCachedNews = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts: number; data: News[] };
      if (!parsed?.ts || !Array.isArray(parsed.data)) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveCachedNews = (data: News[]) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // noop
    }
  };

  const cached = loadCachedNews();

  const query = useQuery({
    queryKey: ['news', limit || 'all'],
    queryFn: async () => {
      const payload = await fetchPublicData<{ data: NewsRow[] }>('news', { limit: limit || '' });
      const items = (payload.data || []).slice();
      items.sort((a, b) => parseNewsTime(b) - parseNewsTime(a));
      const result = items as News[];
      saveCachedNews(result);
      return result;
    },
    initialData: cached?.data ?? [],
    initialDataUpdatedAt: cached?.ts,
    placeholderData: (prev) => prev,
    staleTime: 1000 * 30,      // 30s
    gcTime: 1000 * 60 * 30,    // 30 min
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 1,
    retryDelay: 1000,
  });

  return { 
    news: query.data || [], 
    loading: query.isLoading && query.data === undefined,
    error: (
      query.error &&
      typeof (query.error as { message?: unknown }).message === 'string'
        ? String((query.error as { message: string }).message)
        : null
    ),
    refresh: query.refetch 
  };
};

