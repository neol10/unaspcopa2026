import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const info: any = {
    keys: Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('VAPID')),
    results: {}
  };

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

  if (url && serviceKey) {
    try {
      const client = createClient(url, serviceKey);
      
      // Test 1: Count
      const countRes = await client.from('push_subscriptions').select('*', { count: 'exact', head: true });
      info.results.serviceRoleCount = countRes.error ? { error: countRes.error.message } : { count: countRes.count };

      // Test 2: Try insert
      const testSub = {
        endpoint: 'https://test.com/' + Date.now(),
        subscription: { endpoint: 'test', keys: { p256dh: 'test', auth: 'test' } },
        user_id: 'debug-test-user'
      };
      const insertRes = await client.from('push_subscriptions').insert(testSub);
      info.results.serviceRoleInsert = insertRes.error ? { error: insertRes.error.message } : { success: true };

    } catch (e: any) {
      info.results.serviceRoleError = { error: e.message };
    }
  }

  if (url && anonKey) {
    try {
      const client = createClient(url, anonKey);
      const { count, error } = await client.from('push_subscriptions').select('*', { count: 'exact', head: true });
      info.results.anon = error ? { error: error.message } : { count };
    } catch (e: any) {
      info.results.anon = { error: e.message };
    }
  }

  return res.status(200).json(info);
}
