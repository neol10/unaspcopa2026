import { useEffect, useState } from 'react';
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
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNews = async () => {
    try {
      setLoading(true);
      let query = supabase.from('news').select('*').order('published_at', { ascending: false });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      setNews(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, []);

  return { news, loading, refresh: fetchNews };
};
