import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const readEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
};

const SUPABASE_URL = readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE');

const json = (res: VercelResponse, status: number, body: unknown) => res.status(status).json(body);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') return json(res, 405, { error: 'Method Not Allowed' });
  const NO_SUPABASE = !SUPABASE_URL || !SUPABASE_KEY;
  if (NO_SUPABASE) {
    console.warn('public-data: SUPABASE config missing, returning safe fallback responses. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env to enable live data.');
    // don't return 500 here — return safe fallbacks below so the UI can render instead of showing a 500
  }

  try {
    // Cliente Supabase com controle padrão do Vercel
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const resource = String(req.query.resource || '');
    const division = String(req.query.division || '').trim();
    const teamId = String(req.query.teamId || '').trim();
    const matchId = String(req.query.matchId || '').trim();
    const round = String(req.query.round || '').trim();
    const limit = Number(req.query.limit || 0) || 0;

    // Cache CDN: Vercel serve resposta cacheada por 30s, stale por mais 2 min.
    // Isso evita cold-starts contínuos no Supabase e acelera imensamente o Admin e os menus.
    if (!['profile_role', 'tournament_config'].includes(resource)) {
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    }

    if (resource === 'profile_role') {
      const uid = String(req.query.uid || '').trim();
      if (!uid) return json(res, 400, { error: 'uid required' });
      const { data, error } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
      if (error) throw error;
      return json(res, 200, { role: data?.role === 'admin' ? 'admin' : 'user' });
    }

    if (resource === 'matches') {
      let q = supabase
        .from('matches')
        .select('id, team_a_id, team_b_id, team_a_score, team_b_score, match_date, location, status, round, night, match_mvp_player_id, match_mvp_description, timer_started_at, timer_offset_seconds, is_timer_running, teams_a:teams!team_a_id(name, badge_url, group), teams_b:teams!team_b_id(name, badge_url, group)')
        .order('match_date', { ascending: true });
      if (division) q = q.or(`division.eq.${division},division.is.null`);
      if (limit) q = q.limit(limit);
      if (NO_SUPABASE) return json(res, 200, { data: [] });
      const { data, error } = await q;
      if (error) throw error;
      return json(res, 200, { data: data || [] });
    }

    if (resource === 'teams') {
      let q = supabase.from('teams').select('id, name, badge_url, group, leader, primary_color, division').order('name');
      if (division) q = q.eq('division', division);
      if (NO_SUPABASE) return json(res, 200, { data: [] });
      const { data, error } = await q;
      if (error) throw error;
      return json(res, 200, { data: data || [] });
    }

    if (resource === 'players') {
      if (NO_SUPABASE) return json(res, 200, { data: [] });
      const baseFields = 'id, division, team_id, name, number, position, photo_url, goals_count, yellow_cards, red_cards, suspensions_served, assists, clean_sheets, bio';

      let joinedQuery = supabase
        .from('players')
        .select(`${baseFields}, teams(name, badge_url, group, leader, primary_color)`)
        .order('name');
      if (division) joinedQuery = joinedQuery.eq('division', division);
      if (teamId) joinedQuery = joinedQuery.eq('team_id', teamId);

      const joinedRes = await joinedQuery;
      if (!joinedRes.error) {
        return json(res, 200, { data: joinedRes.data || [] });
      }

      // Server-side telemetry (best-effort): record fallback when players join fails
      try {
        await supabase.from('fallback_logs').insert([{ event: 'players_join_failed', details: JSON.stringify({ division, teamId, error: String((joinedRes.error as any)?.message || joinedRes.error), ts: new Date().toISOString() }), created_at: new Date().toISOString() }]);
      } catch (e) {
        // ignore logging failures
        // eslint-disable-next-line no-console
        console.warn('public-data: fallback logging insert failed', e);
      }

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

      return json(res, 200, { data: enriched });
    }

    if (resource === 'news') {
      if (NO_SUPABASE) return json(res, 200, { data: [] });
      let q = supabase.from('news').select('*');
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return json(res, 200, { data: data || [] });
    }

    if (resource === 'tournament_config') {
      if (NO_SUPABASE) return json(res, 200, { data: null });
      let q = supabase.from('tournament_config').select('*');
      if (division) q = q.eq('division', division);
      const { data, error } = await q.maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return json(res, 200, { data: data || null });
    }

    if (resource === 'match_events') {
      if (!matchId) return json(res, 400, { error: 'matchId required' });
      if (NO_SUPABASE) return json(res, 200, { data: [] });
      const { data, error } = await supabase
        .from('match_events')
        .select('id, match_id, player_id, assistant_id, user_id, author_name, event_type, minute, commentary, metadata, created_at, players:player_id(name, photo_url), assistant_player:assistant_id(name, photo_url)')
        .eq('match_id', matchId)
        .order('minute', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return json(res, 200, { data: data || [] });
    }

    if (req.method === 'GET' && resource === 'match_winner_votes') {
      if (!matchId) return json(res, 400, { error: 'matchId required' });
      if (NO_SUPABASE) return json(res, 200, { data: [], userVote: null });
      const includeProfiles = String(req.query.includeProfiles || '').trim() === '1' || String(req.query.includeProfiles || '').trim().toLowerCase() === 'true';
      const userId = String(req.query.userId || '').trim();
      const { data, error } = await supabase.from('match_winner_votes').select('vote, user_id').eq('match_id', matchId);
      if (error) throw error;

      let responseData: unknown[] = data || [];
      if (includeProfiles && responseData.length > 0) {
        const userIds = Array.from(new Set(responseData.map((item) => String((item as { user_id?: string | null }).user_id || '')).filter(Boolean)));
        if (userIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase.from('profiles').select('id, email').in('id', userIds);
          if (profilesError) throw profilesError;
          responseData = responseData.map((item) => {
            const current = item && typeof item === 'object' ? item as Record<string, unknown> : {};
            return {
              ...current,
              profiles: profilesData?.find((profile) => profile.id === (current.user_id as string | undefined)) || { email: 'Anônimo' },
            };
          });
        }
      }

      const userVote = userId
        ? (data || []).find((item) => String((item as { user_id?: string | null }).user_id || '') === userId)?.vote || null
        : null;

      return json(res, 200, { data: responseData, userVote });
    }

    if (req.method === 'POST' && resource === 'polls') {
      if (NO_SUPABASE) return json(res, 200, { ok: true });
      const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
      const pollId = String((body as { pollId?: unknown; poll_id?: unknown }).pollId || (body as { pollId?: unknown; poll_id?: unknown }).poll_id || '').trim();
      const optionId = String((body as { optionId?: unknown; option_id?: unknown }).optionId || (body as { optionId?: unknown; option_id?: unknown }).option_id || '').trim();
      if (!pollId || !optionId) return json(res, 400, { error: 'pollId and optionId required' });

      const { error: rpcError } = await supabase.rpc('increment_poll_vote', {
        poll_id_param: pollId,
        option_id_param: optionId,
      });
      if (!rpcError) return json(res, 200, { ok: true, method: 'rpc' });

      const { data: pollRow, error: fetchError } = await supabase.from('polls').select('id, options').eq('id', pollId).maybeSingle();
      if (fetchError) throw fetchError;
      if (!pollRow) return json(res, 404, { error: 'Poll not found' });

      const options = (() => {
        const raw = (pollRow as { options?: unknown }).options;
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }
        return [];
      })().map((option, index) => {
        if (!option || typeof option !== 'object') return option;
        const candidate = option as { id?: unknown; votes?: unknown };
        const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : `opt_${index}`;
        const votes = Number(candidate.votes || 0);
        if (id !== optionId) {
          return { ...candidate, id, votes: Number.isFinite(votes) ? votes : 0 };
        }
        return { ...candidate, id, votes: (Number.isFinite(votes) ? votes : 0) + 1 };
      });

      const { error: updateError } = await supabase.from('polls').update({ options }).eq('id', pollId);
      if (updateError) throw updateError;
      return json(res, 200, { ok: true, method: 'row-update' });
    }

    if (req.method === 'POST' && resource === 'match_winner_votes') {
      if (NO_SUPABASE) return json(res, 200, { ok: true });
      const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
      const bodyMatchId = String((body as { matchId?: unknown; match_id?: unknown }).matchId || (body as { matchId?: unknown; match_id?: unknown }).match_id || matchId || '').trim();
      const userId = String((body as { userId?: unknown; user_id?: unknown }).userId || (body as { userId?: unknown; user_id?: unknown }).user_id || '').trim();
      const vote = String((body as { vote?: unknown }).vote || '').trim();
      if (!bodyMatchId || !userId || !vote) return json(res, 400, { error: 'matchId, userId and vote required' });

      const { error } = await supabase.from('match_winner_votes').upsert(
        { match_id: bodyMatchId, user_id: userId, vote },
        { onConflict: 'match_id,user_id' }
      );
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && resource === 'round_mvp_votes') {
      if (NO_SUPABASE) return json(res, 200, { ok: true });
      const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
      const userId = String(body.userId || '').trim();
      const playerId = String(body.playerId || '').trim();
      const bodyRound = String(body.round || '').trim();
      if (!userId || !playerId || !bodyRound) return json(res, 400, { error: 'userId, playerId and round required' });

      // O usuário votou antes? Não podemos usar upsert sem onConflict explícito. Mas RLS foi removido, então insert
      // Mas para evitar erro caso não tenha UUID PK
      const { error } = await supabase.from('round_mvp_votes').insert({ user_id: userId, player_id: playerId, round: bodyRound });
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    if (req.method === 'DELETE' && resource === 'round_mvp_votes') {
      if (NO_SUPABASE) return json(res, 200, { ok: true });
      const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
      const userId = String(body.userId || req.query.userId || '').trim();
      const bodyRound = String(body.round || req.query.round || '').trim();
      if (!userId || !bodyRound) return json(res, 400, { error: 'userId and round required' });

      const { error } = await supabase.from('round_mvp_votes').delete().match({ user_id: userId, round: bodyRound });
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    if (resource === 'polls') {
      if (NO_SUPABASE) return json(res, 200, { data: null });
      const { data, error } = await supabase
        .from('polls')
        .select('id, question, options, active, created_at')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return json(res, 200, { data: data || null });
    }

    if (resource === 'round_mvp_votes') {
      if (!round) return json(res, 400, { error: 'round required' });
      const userId = String(req.query.userId || '').trim();
      if (NO_SUPABASE) return json(res, 200, { data: [] });
      
      let query = supabase
        .from('round_mvp_votes')
        .select('player_id, players(id, name, number, teams(name))')
        .eq('round', round);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return json(res, 200, { data: data || [] });
    }    if (resource === 'rankings') {
      if (NO_SUPABASE) {
        return json(res, 200, { players: [], votes: [], events: [], matches: [] });
      }

      // Busca paralela: jogadores + partidas ao mesmo tempo
      const [playersRes, matchesRes] = await Promise.all([
        supabase
          .from('players')
          .select('id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, team_id, teams(name, badge_url, group, leader, primary_color)')
          .eq('division', division),
        supabase
          .from('matches')
          .select('id, match_date, round, night, status, match_mvp_player_id, match_mvp_description, team_a_id, team_b_id, team_a_score, team_b_score')
          .eq('division', division)
          .order('match_date', { ascending: true }),
      ]);

      let rankingPlayers = playersRes.data || [];
      if (playersRes.error) {
        try {
          await supabase.from('fallback_logs').insert([{ event: 'rankings_players_join_fallback', details: JSON.stringify({ division, error: String((playersRes.error as any)?.message || playersRes.error), ts: new Date().toISOString() }), created_at: new Date().toISOString() }]);
        } catch (_e) { /* ignore */ }
        const fallbackPlayers = await supabase
          .from('players')
          .select('id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, team_id')
          .eq('division', division);
        if (fallbackPlayers.error) throw fallbackPlayers.error;
        rankingPlayers = (fallbackPlayers.data || []).map((p) => ({ ...p, teams: null }));
      }
      if (matchesRes.error) throw matchesRes.error;

      const matchIds = (matchesRes.data || [])
        .map((m) => m.id)
        .filter((id): id is string => Boolean(id));

      // Se não há partidas, retorna imediatamente sem queries adicionais
      if (matchIds.length === 0) {
        return json(res, 200, {
          players: rankingPlayers,
          votes: [],
          events: [],
          matches: matchesRes.data || [],
        });
      }

      // Busca votos e eventos em paralelo, em um único batch (sem loop sequencial)
      // Supabase aceita até 200-500 IDs em .in() sem problemas de performance
      const CHUNK = 200;
      const fetchAllInBatches = async <Row,>(
        queryFactory: (ids: string[]) => Promise<{ data: Row[] | null; error: Error | null }>,
      ): Promise<Row[]> => {
        const rows: Row[] = [];
        for (let i = 0; i < matchIds.length; i += CHUNK) {
          const ids = matchIds.slice(i, i + CHUNK);
          const { data, error } = await queryFactory(ids);
          if (error) throw error;
          if (Array.isArray(data) && data.length > 0) rows.push(...data);
        }
        return rows;
      };

      // Ambas as queries rodam em paralelo
      const [votesData, eventsData] = await Promise.all([
        fetchAllInBatches<{ player_id: string; match_id: string }>(async (ids) =>
          supabase.from('match_mvp_votes').select('player_id, match_id').in('match_id', ids)
        ),
        fetchAllInBatches<{ match_id: string; player_id: string | null; assistant_id: string | null; event_type: string; minute: number; metadata: unknown }>(async (ids) =>
          supabase
            .from('match_events')
            .select('match_id, player_id, assistant_id, event_type, minute, metadata')
            .in('match_id', ids)
            .in('event_type', ['gol', 'assistencia'])
        ),
      ]);


      return json(res, 200, {
        players: rankingPlayers,
        votes: votesData,
        events: eventsData,
        matches: matchesRes.data || [],
      });
    }

    return json(res, 400, { error: `Unknown resource: ${resource}` });

  } catch (err: unknown) {
    const raw = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message = typeof raw?.message === 'string' ? raw.message : (err instanceof Error ? err.message : String(err));
    const details = typeof raw?.details === 'string' ? raw.details : undefined;
    const hint = typeof raw?.hint === 'string' ? raw.hint : undefined;
    const code = typeof raw?.code === 'string' ? raw.code : undefined;
    console.error('public-data error:', err);

    // Detect Supabase/Cloudflare timeout (522) and return safe fallbacks so UI can still render.
    const text = String(message).toLowerCase();
    const isTimeout = text.includes('522') || text.includes('connection timed out') || text.includes('timeout') || (hint && String(hint).toLowerCase().includes('supabase'));
    if (isTimeout) {
      console.warn('public-data: Supabase timeout detected, returning safe fallback for', String(req.query.resource || ''));
      const resource = String(req.query.resource || '').trim();
      switch (resource) {
        case 'profile_role':
          return json(res, 200, { role: 'user' });
        case 'matches':
        case 'teams':
        case 'players':
        case 'news':
        case 'match_events':
        case 'match_winner_votes':
        case 'round_mvp_votes':
          return json(res, 200, { data: [] });
        case 'tournament_config':
          return json(res, 200, { data: null });
        case 'rankings':
          return json(res, 200, { players: [], votes: [], events: [], matches: [] });
        default:
          return json(res, 200, { data: [] });
      }
    }

    return json(res, 500, { error: message, details, hint, code });
  }
}
