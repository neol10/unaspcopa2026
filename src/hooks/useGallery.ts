import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface GalleryItem {
  id: string;
  title: string;
  description: string;
  media_url: string;
  media_type: 'image' | 'video';
  created_at: string;
}

const isGalleryTableMissing = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  if (error.code === '42P01') return true;
  return (error.message || '').toLowerCase().includes('relation') && (error.message || '').toLowerCase().includes('gallery');
};

export const useGallery = () => {
  const query = useQuery({
    queryKey: ['gallery'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gallery')
        .select('*')
        .order('created_at', { ascending: false });

      // Evita flood de 404 no console quando a tabela ainda não foi criada.
      if (isGalleryTableMissing(error)) {
        return [] as GalleryItem[];
      }

      if (error) throw error;
      return (data as GalleryItem[]) || [];
    },
    retry: false,
  });

  const rawError = query.error as { code?: string; message?: string } | null;
  const unavailable = isGalleryTableMissing(rawError);

  return { 
    items: query.data || [], 
    loading: query.isLoading && query.data === undefined, 
    refresh: query.refetch,
    unavailable,
  };
};

