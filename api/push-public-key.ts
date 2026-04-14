import type { VercelRequest, VercelResponse } from '@vercel/node';

const readEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res
      .status(200)
      .setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin'])
      .setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers'])
      .setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods'])
      .send('ok');
  }

  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET, OPTIONS').json({ error: 'Method Not Allowed' });
  }

  const publicKey = readEnv('VAPID_PUBLIC_KEY', 'VITE_VAPID_PUBLIC_KEY');
  if (!publicKey) {
    return res.status(500).json({ error: 'Missing VAPID_PUBLIC_KEY' });
  }

  return res
    .status(200)
    .setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin'])
    .setHeader('Cache-Control', 'no-store, max-age=0')
    .json({ publicKey });
}
