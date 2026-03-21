import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase env vars' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error, count } = await supabase
    .from('push_subscriptions')
    .select('*', { count: 'exact' });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({
    count: count || data.length,
    subscriptions: data.map(s => ({
      id: s.id,
      created_at: s.created_at,
      user_id: s.user_id,
      endpoint_prefix: s.endpoint?.substring(0, 30) || (s.subscription?.endpoint?.substring(0, 30)),
    }))
  });
}
