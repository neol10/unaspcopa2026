import { useEffect, useState } from 'react';
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
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGallery = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('gallery')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGallery();
  }, []);

  return { items, loading, refresh: fetchGallery };
};
