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

export const useGallery = () => {
  const query = useQuery({
    queryKey: ['gallery'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gallery')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as GalleryItem[]) || [];
    }
  });

  return { 
    items: query.data || [], 
    loading: query.isLoading && query.data === undefined, 
    refresh: query.refetch 
  };
};

