import type { QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

const prefetchedRoutes = new Set<string>();

const routeChunkPrefetchers: Record<string, () => Promise<unknown>> = {
  '/': () => import('../pages/Home/Home'),
  '/classificacao': () => import('../pages/Standings/Standings'),
  '/rankings': () => import('../pages/Rankings/Rankings'),
  '/equipes': () => import('../pages/Teams/Teams'),
  '/jogadores': () => import('../pages/Players/Players'),
  '/central-da-partida': () => import('../pages/MatchCenter/MatchCenter'),
  '/jogos': () => import('../pages/Brackets/Brackets'),
  '/galeria': () => import('../pages/Gallery/Gallery'),
  '/admin': () => import('../pages/Admin/Admin'),
};

const prefetchQueriesByRoute = async (path: string, queryClient: QueryClient) => {
  if (path === '/classificacao') {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: ['teams'],
        queryFn: async () => {
          const { data, error } = await supabase.from('teams').select('*').order('name');
          if (error) throw error;
          return data ?? [];
        },
        staleTime: 60_000,
      }),
      queryClient.prefetchQuery({
        queryKey: ['matches', 'all'],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('matches')
            .select('id, team_a_id, team_b_id, team_a_score, team_b_score, match_date, location, status, round')
            .order('match_date', { ascending: true });
          if (error) throw error;
          return data ?? [];
        },
        staleTime: 30_000,
      }),
    ]);
    return;
  }

  if (path === '/equipes') {
    await queryClient.prefetchQuery({
      queryKey: ['teams'],
      queryFn: async () => {
        const { data, error } = await supabase.from('teams').select('*').order('name');
        if (error) throw error;
        return data ?? [];
      },
      staleTime: 60_000,
    });
    return;
  }

  if (path === '/jogadores') {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: ['players', 'all'],
        queryFn: async () => {
          const { data, error } = await supabase.from('players').select('*, teams(name)').order('name');
          if (error) throw error;
          return data ?? [];
        },
        staleTime: 60_000,
      }),
      queryClient.prefetchQuery({
        queryKey: ['teams'],
        queryFn: async () => {
          const { data, error } = await supabase.from('teams').select('*').order('name');
          if (error) throw error;
          return data ?? [];
        },
        staleTime: 60_000,
      }),
    ]);
    return;
  }

  if (path === '/central-da-partida' || path === '/jogos') {
    await queryClient.prefetchQuery({
      queryKey: ['matches', 'all'],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('matches')
          .select('id, team_a_id, team_b_id, team_a_score, team_b_score, match_date, location, status, round')
          .order('match_date', { ascending: true });
        if (error) throw error;
        return data ?? [];
      },
      staleTime: 30_000,
    });
  }

  if (path === '/galeria') {
    await queryClient.prefetchQuery({
      queryKey: ['gallery'],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('gallery')
          .select('*')
          .order('created_at', { ascending: false });

        if (error?.code === '42P01') {
          return [];
        }

        if (error) throw error;
        return data ?? [];
      },
      retry: false,
      staleTime: 30_000,
    });
  }
};

export const prefetchRouteIntent = (path: string, queryClient: QueryClient) => {
  if (!path) return;
  if (prefetchedRoutes.has(path)) return;

  prefetchedRoutes.add(path);

  const prefetchChunk = routeChunkPrefetchers[path];
  if (prefetchChunk) {
    void prefetchChunk().catch(() => {
      // Evita quebrar interação do usuário por falha em prefetch.
    });
  }

  void prefetchQueriesByRoute(path, queryClient).catch(() => {
    // Prefetch é oportunista e não deve mostrar erro para o usuário.
  });
};
