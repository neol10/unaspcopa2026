import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  payload: any;
  created_at: string;
}

export const useNotifications = (limit = 5) => {
  return useQuery({
    queryKey: ['notifications', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data as Notification[]) || [];
    },
    staleTime: 1000 * 60, // 1 min
    refetchOnWindowFocus: true,
  });
};
