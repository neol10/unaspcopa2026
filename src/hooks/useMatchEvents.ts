import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface MatchEvent {
  id: string;
  match_id: string;
  player_id: string | null;
  user_id?: string | null;
  author_name?: string | null;
  event_type: 'gol' | 'amarelo' | 'vermelho' | 'falta' | 'substituicao' | 'comentario' | 'momento';
  minute: number;
  assistant_id?: string | null;
  commentary?: string;
  players?: { name: string; photo_url?: string };
  created_at?: string;
}

type EventRow = Omit<MatchEvent, 'players'> & { created_at?: string };

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
      const { data, error } = await supabase
        .from('match_events')
        .select('id, match_id, player_id, user_id, author_name, event_type, minute, assistant_id, commentary, created_at')
        .eq('match_id', matchId)
        .order('minute', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = (data as EventRow[]) || [];
      const playerIds = Array.from(new Set(rows.map((row) => row.player_id).filter(Boolean))) as string[];

      let playerMap: Record<string, { name: string; photo_url?: string }> = {};
      if (playerIds.length > 0) {
        const { data: playersData } = await supabase.from('players').select('id, name, photo_url').in('id', playerIds);
        if (playersData) {
          playerMap = Object.fromEntries(playersData.map((p) => [
            p.id as string,
            { name: String(p.name || 'Atleta'), photo_url: p.photo_url || undefined },
          ]));
        }
      }

      const result = rows.map((row) => ({
        ...row,
        players: row.player_id ? playerMap[row.player_id] || { name: 'Atleta' } : undefined,
      })) as MatchEvent[];
      saveCachedEvents(result);
      return result;
    },
    enabled: !!matchId,
    initialData: cached?.data ?? [],
    initialDataUpdatedAt: cached?.ts,
    placeholderData: (prev) => prev,
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
          if (eventData.player_id) {
            supabase.from('players').select('name, photo_url').eq('id', eventData.player_id).single().then(({ data }) => {
              onNewEventRef.current?.({
                ...eventData,
                players: { name: String(data?.name || 'Atleta'), photo_url: data?.photo_url || undefined },
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

