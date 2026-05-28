import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { fetchPublicData } from '../lib/apiData';

export interface MatchEvent {
  id: string;
  match_id: string;
  player_id: string | null;
  user_id?: string | null;
  author_name?: string | null;
  event_type: 'gol' | 'amarelo' | 'vermelho' | 'falta' | 'substituicao' | 'comentario' | 'momento';
  minute: number;
  team_id?: string | null;
  assistant_id?: string | null;
  commentary?: string;
  metadata?: { goal_type?: string | null } | null;
  players?: { name: string; photo_url?: string };
  assistant_player?: { name: string; photo_url?: string };
  created_at?: string;
}

type EventRow = Omit<MatchEvent, 'players' | 'assistant_player'> & { created_at?: string };

type PlayerRow = {
  id: string;
  name: string | null;
  photo_url: string | null;
};

export const useMatchEvents = (matchId: string, onNewEvent?: (event: MatchEvent) => void) => {
  const queryClient = useQueryClient();
  const onNewEventRef = useRef(onNewEvent);
  
  // Atualiza o ref sempre que a função mudar, sem disparar efeitos
  useEffect(() => {
    onNewEventRef.current = onNewEvent;
  }, [onNewEvent]);
  const cacheKey = `match_events_cache_v1_${matchId || 'none'}`;

  const loadCachedEvents = () => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts: number; data: MatchEvent[] };
      if (!parsed?.ts || !Array.isArray(parsed.data)) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveCachedEvents = (data: MatchEvent[]) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // noop
    }
  };

  const cached = loadCachedEvents();

  const query = useQuery({
    queryKey: ['match_events', matchId],
    queryFn: async () => {
      if (!matchId) return [];
      const payload = await fetchPublicData<{ data: EventRow[] }>('match_events', { matchId });
      const rows = payload.data || [];
      const playerMap: Record<string, { name: string; photo_url?: string }> = {};
      rows.forEach((row) => {
        const player = row as unknown as MatchEvent & { players?: { name?: string; photo_url?: string }; assistant_player?: { name?: string; photo_url?: string } };
        if (player.player_id && player.players) playerMap[player.player_id] = { name: player.players.name || 'Atleta', photo_url: player.players.photo_url || undefined };
        if (player.assistant_id && player.assistant_player) playerMap[player.assistant_id] = { name: player.assistant_player.name || 'Atleta', photo_url: player.assistant_player.photo_url || undefined };
      });

      const result = rows.map((row) => ({
        ...row,
        players: row.player_id ? playerMap[row.player_id] || { name: 'Atleta' } : undefined,
        assistant_player: row.assistant_id ? playerMap[row.assistant_id] || { name: 'Atleta' } : undefined,
      })) as MatchEvent[];
      saveCachedEvents(result);
      return result;
    },
    enabled: !!matchId,
    initialData: cached?.data ?? undefined,
    initialDataUpdatedAt: cached?.ts ?? undefined,
    placeholderData: (prev) => prev,
    staleTime: 1000 * 15, // 15 segundos
    // Se o realtime falhar, polling mais rápido na Central para o placar/ações não "atrasarem".
    refetchInterval: () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        if (path.startsWith('/central-da-partida')) return 5000;
      }
      return 1000 * 30;
    },
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`public:match_events:${matchId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'match_events', 
        filter: `match_id=eq.${matchId}` 
      }, (payload) => {
        if (payload.eventType === 'INSERT' && onNewEventRef.current) {
          const eventData = payload.new as EventRow;

          const ids = [eventData.player_id, eventData.assistant_id].filter(
            (v): v is string => typeof v === 'string' && v.length > 0
          );

          if (ids.length > 0) {
            supabase
              .from('players')
              .select('id, name, photo_url')
              .in('id', ids)
              .then(({ data }) => {
                const map: Record<string, { name: string; photo_url?: string }> = Object.fromEntries(
                  ((data as unknown as PlayerRow[]) || []).map((p) => [
                    String(p.id),
                    { name: String(p.name || 'Atleta'), photo_url: p.photo_url || undefined },
                  ]),
                );

                onNewEventRef.current?.({
                  ...eventData,
                  players: eventData.player_id ? map[eventData.player_id] || { name: 'Atleta' } : undefined,
                  assistant_player: eventData.assistant_id ? map[eventData.assistant_id] || { name: 'Atleta' } : undefined,
                } as MatchEvent);
              });
          } else {
            onNewEventRef.current?.(eventData as MatchEvent);
          }
        }
        queryClient.invalidateQueries({ queryKey: ['match_events', matchId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, queryClient]);

  return { 
    events: query.data || [], 
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

