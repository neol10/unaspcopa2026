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
const SUPABASE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');

const json = (res: VercelResponse, status: number, body: unknown) => res.status(status).json(body);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method Not Allowed' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return json(res, 500, { error: 'Missing Supabase config' });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const resource = String(req.query.resource || '');
    const division = String(req.query.division || '').trim();
    const teamId = String(req.query.teamId || '').trim();
    const matchId = String(req.query.matchId || '').trim();
    const round = String(req.query.round || '').trim();
    const limit = Number(req.query.limit || 0) || 0;

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
      const { data, error } = await q;
      if (error) throw error;
      return json(res, 200, { data: data || [] });
    }

    if (resource === 'teams') {
      let q = supabase.from('teams').select('id, name, badge_url, group, leader, primary_color, division').order('name');
      if (division) q = q.eq('division', division);
      const { data, error } = await q;
      if (error) throw error;
      return json(res, 200, { data: data || [] });
    }

    if (resource === 'players') {
      let q = supabase.from('players').select('*, teams(name, badge_url, group, leader, primary_color)').order('name');
      if (division) q = q.eq('division', division);
      if (teamId) q = q.eq('team_id', teamId);
      const { data, error } = await q;
      if (error) throw error;
      return json(res, 200, { data: data || [] });
    }

    if (resource === 'news') {
      let q = supabase.from('news').select('*');
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return json(res, 200, { data: data || [] });
    }

    if (resource === 'tournament_config') {
      let q = supabase.from('tournament_config').select('*');
      if (division) q = q.eq('division', division);
      const { data, error } = await q.maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return json(res, 200, { data: data || null });
    }

    if (resource === 'match_events') {
      if (!matchId) return json(res, 400, { error: 'matchId required' });
      const { data, error } = await supabase
        .from('match_events')
        .select('id, match_id, player_id, assistant_id, user_id, author_name, event_type, minute, commentary, metadata, created_at, players:player_id(name, photo_url), assistant_player:assistant_id(name, photo_url)')
        .eq('match_id', matchId)
        .order('minute', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return json(res, 200, { data: data || [] });
    }

    if (resource === 'match_winner_votes') {
      if (!matchId) return json(res, 400, { error: 'matchId required' });
      const { data, error } = await supabase.from('match_winner_votes').select('vote, user_id').eq('match_id', matchId);
      if (error) throw error;
      return json(res, 200, { data: data || [] });
    }

    if (resource === 'round_mvp_votes') {
      if (!round) return json(res, 400, { error: 'round required' });
      const { data, error } = await supabase
        .from('round_mvp_votes')
        .select('player_id, players(id, name, number, teams(name))')
        .eq('round', round);
      if (error) throw error;
      return json(res, 200, { data: data || [] });
    }

    if (resource === 'rankings') {
      const [playersRes, votesRes, eventsRes, matchesRes] = await Promise.all([
        supabase.from('players').select('id, name, number, position, photo_url, goals_count, assists, yellow_cards, red_cards, clean_sheets, team_id, teams:team_id(name, badge_url, group, leader, primary_color)').eq('division', division),
        supabase.from('match_mvp_votes').select('player_id').eq('matches.division', division),
        supabase.from('match_events').select('match_id, player_id, assistant_id, event_type, minute, metadata, matches:match_id!inner(round, night, division)').eq('matches.division', division).in('event_type', ['gol', 'assistencia']),
        supabase.from('matches').select('id, round, night, status, team_a_id, team_b_id, team_a_score, team_b_score').eq('division', division),
      ]);
      if (playersRes.error) throw playersRes.error;
      if (votesRes.error) throw votesRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (matchesRes.error) throw matchesRes.error;
      return json(res, 200, {
        players: playersRes.data || [],
        votes: votesRes.data || [],
        events: eventsRes.data || [],
        matches: matchesRes.data || [],
      });
    }

    return json(res, 400, { error: `Unknown resource: ${resource}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('public-data error:', err);
    return json(res, 500, { error: msg });
  }
}
