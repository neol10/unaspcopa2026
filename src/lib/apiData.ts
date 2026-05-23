import { supabase } from './supabase';
import { trackFallback } from './telemetry';

type QueryValue = string | number | boolean | null | undefined;

const buildQuery = (params?: Record<string, QueryValue>) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

// Bypass da rota de API Serverless em desenvolvimento apenas.
// Em produção preferimos usar a API serverless para evitar CORS e expor chaves.
const _bypassEnv = String(import.meta.env.VITE_BYPASS_SERVERLESS || '').trim().toLowerCase();
const bypassServerless = _bypassEnv
  ? _bypassEnv === 'true'
  : !Boolean(import.meta.env.PROD); // default: true in dev, false in production

export const fetchPublicData = async <T,>(resource: string, params?: Record<string, QueryValue>): Promise<T> => {
  if (bypassServerless) {
    const division = params?.division ? String(params.division).trim() : '';
    const teamId = params?.teamId ? String(params.teamId).trim() : '';
    const matchId = params?.matchId ? String(params.matchId).trim() : '';
    const round = params?.round ? String(params.round).trim() : '';
    const limit = Number(params?.limit || 0) || 0;

    if (resource === 'profile_role') {
      const uid = params?.uid ? String(params.uid).trim() : '';
      if (!uid) throw new Error('uid required');
      const { data, error } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
      if (error) throw error;
      return { role: data?.role === 'admin' ? 'admin' : 'user' } as unknown as T;
    }

    if (resource === 'matches') {
      let q = supabase
        .from('matches')
        .select('id, team_a_id, team_b_id, team_a_score, team_b_score, match_date, location, status, round, night, match_mvp_player_id, match_mvp_description, timer_started_at, timer_offset_seconds, is_timer_running, teams_a:teams!team_a_id(name, badge_url, group), teams_b:teams!team_b_id(name, badge_url, group)')
        .order('match_date', { ascending: true });
      if (division) q = q.or(`division.eq.${division},division.is.null`);
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return { data: data || [] } as unknown as T;
    }

    if (resource === 'teams') {
      let q = supabase.from('teams').select('id, name, badge_url, group, leader, primary_color, division').order('name');
      if (division) q = q.eq('division', division);
      const { data, error } = await q;
      if (error) throw error;
      return { data: data || [] } as unknown as T;
    }

    if (resource === 'players') {
      const baseFields = 'id, division, team_id, name, number, position, photo_url, goals_count, yellow_cards, red_cards, suspensions_served, assists, clean_sheets, bio';

      let joinedQuery = supabase
        .from('players')
        .select(`${baseFields}, teams(name, badge_url, group, leader, primary_color)`)
        .order('name');
      if (division) joinedQuery = joinedQuery.eq('division', division);
      if (teamId) joinedQuery = joinedQuery.eq('team_id', teamId);

      const joinedRes = await joinedQuery;
      if (!joinedRes.error) {
        return { data: joinedRes.data || [] } as unknown as T;
      }

      // Telemetria: registrar que o join com teams falhou (best-effort)
      try {
        void trackFallback('players_join_failed', { division, teamId, error: String((joinedRes.error as any)?.message || joinedRes.error) });
      } catch {
        // noop
      }

      // Fallback resiliente: evita derrubar a tela quando o join com teams falha.
      let flatQuery = supabase.from('players').select(baseFields).order('name');
      if (division) flatQuery = flatQuery.eq('division', division);
      if (teamId) flatQuery = flatQuery.eq('team_id', teamId);
      const { data: playersData, error: flatError } = await flatQuery;
      if (flatError) throw flatError;

      const teamIds = Array.from(new Set((playersData || []).map((p) => String((p as { team_id?: string }).team_id || '')).filter(Boolean)));
      let teamsById: Record<string, { name?: string; badge_url?: string; group?: string; leader?: string; primary_color?: string | null }> = {};

      if (teamIds.length > 0) {
        const { data: teamsData } = await supabase
          .from('teams')
          .select('id, name, badge_url, group, leader, primary_color')
          .in('id', teamIds);

        teamsById = (teamsData || []).reduce((acc, team) => {
          acc[String(team.id)] = {
            name: team.name,
            badge_url: team.badge_url,
            group: team.group,
            leader: team.leader,
            primary_color: team.primary_color,
          };
          return acc;
        }, {} as Record<string, { name?: string; badge_url?: string; group?: string; leader?: string; primary_color?: string | null }>);
      }

      const enriched = (playersData || []).map((player) => ({
        ...player,
        teams: teamsById[String((player as { team_id?: string }).team_id || '')] || null,
      }));

      return { data: enriched } as unknown as T;
    }

    if (resource === 'news') {
      let q = supabase.from('news').select('*');
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return { data: data || [] } as unknown as T;
    }

    if (resource === 'tournament_config') {
      let q = supabase.from('tournament_config').select('*');
      if (division) q = q.eq('division', division);
      const { data, error } = await q.maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return { data: data || null } as unknown as T;
    }

    if (resource === 'match_events') {
      if (!matchId) throw new Error('matchId required');
      const { data, error } = await supabase
        .from('match_events')
        .select('id, match_id, player_id, assistant_id, user_id, author_name, event_type, minute, commentary, metadata, created_at, players:player_id(name, photo_url), assistant_player:assistant_id(name, photo_url)')
        .eq('match_id', matchId)
        .order('minute', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return { data: data || [] } as unknown as T;
    }

    if (resource === 'match_winner_votes') {
      if (!matchId) throw new Error('matchId required');
      const includeProfiles = params?.includeProfiles === '1' || String(params?.includeProfiles || '').toLowerCase() === 'true';
      const userId = params?.userId ? String(params.userId).trim() : '';
      const { data, error } = await supabase.from('match_winner_votes').select('vote, user_id').eq('match_id', matchId);
      if (error) throw error;

      let responseData: any[] = data || [];
      if (includeProfiles && responseData.length > 0) {
        const userIds = Array.from(new Set(responseData.map((item) => String(item.user_id || '')).filter(Boolean)));
        if (userIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase.from('profiles').select('id, email').in('id', userIds);
          if (profilesError) throw profilesError;
          responseData = responseData.map((item) => ({
            ...item,
            profiles: profilesData?.find((profile) => profile.id === item.user_id) || { email: 'Anônimo' },
          }));
        }
      }

      const userVote = userId
        ? (data || []).find((item) => String(item.user_id || '') === userId)?.vote || null
        : null;

      return { data: responseData, userVote } as unknown as T;
    }

    if (resource === 'polls') {
      const { data, error } = await supabase
        .from('polls')
        .select('id, question, options, active, created_at')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return { data: data || null } as unknown as T;
    }

    if (resource === 'round_mvp_votes') {
      if (!round) throw new Error('round required');
      const userId = params?.userId ? String(params.userId).trim() : '';
      let q = supabase
        .from('round_mvp_votes')
        .select('player_id, user_id, players(id, name, number, teams(name))')
        .eq('round', round);
      if (userId) q = q.eq('user_id', userId);
      const { data, error } = await q;
      if (error) throw error;
      return { data: data || [] } as unknown as T;
    }

    if (resource === 'rankings') {
      console.log('[apiData] Starting rankings fetch for division:', division);
      const fetchStart = performance.now();
      
      const matchesBaseQuery = supabase
        .from('matches')
        .select('id, match_date, round, night, status, match_mvp_player_id, match_mvp_description, team_a_id, team_b_id, team_a_score, team_b_score')
        .order('match_date', { ascending: true })
        .eq('division', division);

      const [playersRes, matchesRes] = await Promise.all([
        supabase
          .from('players')
          .select('id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, team_id, teams(name, badge_url, group, leader, primary_color)')
          .eq('division', division),
        matchesBaseQuery,
      ]);
      
      console.log('[apiData] Players + matches fetch took', (performance.now() - fetchStart).toFixed(0), 'ms');
      console.log('[apiData] Players count:', playersRes.data?.length, 'Matches count:', matchesRes.data?.length);

      let rankingPlayers = playersRes.data || [];
      if (playersRes.error) {
        try { void trackFallback('rankings_players_join_fallback', { division, error: String((playersRes.error as any)?.message || playersRes.error) }); } catch {}
        const fallbackPlayers = await supabase
          .from('players')
          .select('id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, team_id')
          .eq('division', division);
        if (fallbackPlayers.error) throw fallbackPlayers.error;
        rankingPlayers = (fallbackPlayers.data || []).map((p) => ({ ...p, teams: null }));
      }
      if (matchesRes.error) throw matchesRes.error;

      const matchIds = (matchesRes.data || []).map((match) => match.id).filter((id): id is string => Boolean(id));
      console.log('[apiData] Match IDs to fetch:', matchIds.length);

      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      const fetchBatches = async <Row,>(
        queryFactory: (ids: string[]) => Promise<{ data: Row[] | null; error: Error | null }>,
        chunkSize = 100,
        retries = 1,
      ) => {
        const batchStart = performance.now();
        const rows: Row[] = [];
        let batchCount = 0;
        for (let i = 0; i < matchIds.length; i += chunkSize) {
          const ids = matchIds.slice(i, i + chunkSize);
          batchCount++;
          let attempt = 0;
          while (attempt <= retries) {
            try {
              const { data, error } = await queryFactory(ids);
              if (error) throw error;
              if (Array.isArray(data) && data.length > 0) rows.push(...data);
              break;
            } catch (e) {
              attempt += 1;
              if (attempt > retries) throw e;
              // exponential backoff jitter
              const backoff = 100 * Math.pow(2, attempt) + Math.round(Math.random() * 50);
              // eslint-disable-next-line no-await-in-loop
              await sleep(backoff);
            }
          }
        }
        console.log('[apiData] Batch fetch took', (performance.now() - batchStart).toFixed(0), 'ms for', batchCount, 'batches, returned', rows.length, 'rows');
        return rows;
      };

      let votesData: Array<{ player_id: string; match_id: string }> = [];
      let eventsData: Array<{ match_id: string; player_id?: string | null; assistant_id?: string | null; event_type: string; minute: number; metadata: unknown }> = [];

      try {
        const votesEventsStart = performance.now();
        const results = await Promise.all([
          matchIds.length > 0
            ? fetchBatches<{ player_id: string; match_id: string }>((ids) =>
                supabase.from('match_mvp_votes').select('player_id, match_id').in('match_id', ids)
              )
            : Promise.resolve([]),
          matchIds.length > 0
            ? fetchBatches<{ match_id: string; player_id: string | null; assistant_id: string | null; event_type: string; minute: number; metadata: unknown }>((ids) =>
                supabase
                  .from('match_events')
                  .select('match_id, player_id, assistant_id, event_type, minute, metadata')
                  .in('match_id', ids)
                  .in('event_type', ['gol', 'assistencia'])
              )
            : Promise.resolve([]),
        ]);
        console.log('[apiData] Votes + events fetch took', (performance.now() - votesEventsStart).toFixed(0), 'ms');
        votesData = results[0] as any;
        eventsData = results[1] as any;
        console.log('[apiData] Votes count:', votesData.length, 'Events count:', eventsData.length);
      } catch (e) {
        try {
          void trackFallback('rankings_batch_error', { division, error: String(e) });
        } catch {}
        // If direct supabase batching fails, fallback to serverless endpoint which may have different networking
        try {
          const resp = await fetch(`/api/public-data?resource=rankings&division=${encodeURIComponent(String(division))}`);
          if (resp.ok) {
            const json = await resp.json();
            votesData = (json.votes || []) as any;
            eventsData = (json.events || []) as any;
          } else {
            throw new Error(`serverless fallback failed: ${resp.status}`);
          }
        } catch (e2) {
          // rethrow original error if fallback also fails
          throw e;
        }
      }

      return {
        players: rankingPlayers,
        votes: votesData,
        events: eventsData,
        matches: matchesRes.data || [],
      } as unknown as T;
    }

    throw new Error(`Unknown resource in direct query mode: ${resource}`);
  }

  const response = await fetch(`/api/public-data${buildQuery({ resource, ...params })}`);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let message = body || `Falha ao carregar ${resource}`;
    try {
      const parsed = JSON.parse(body) as { error?: unknown; message?: unknown; hint?: unknown };
      if (typeof parsed?.error === 'string' && parsed.error) message = parsed.error;
      if (typeof parsed?.message === 'string' && parsed.message) message = parsed.message;
      if (typeof parsed?.hint === 'string' && parsed.hint) message = `${message} (${parsed.hint})`;
    } catch {
      // keep raw body
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
};
