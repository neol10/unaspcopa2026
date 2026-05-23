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
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return json(res, 500, { error: 'Supabase configuration missing on server' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { bucket = 'images', folder = 'uploads', fileName, dataUrl, contentType } = body as { bucket?: string; folder?: string; fileName?: string; dataUrl?: string; contentType?: string };
    if (!fileName || !dataUrl) return json(res, 400, { error: 'fileName and dataUrl required' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // dataUrl format: data:[<mediatype>][;base64],<data>
    const matches = String(dataUrl).match(/^data:(.+?);base64,(.+)$/);
    if (!matches) return json(res, 400, { error: 'Invalid dataUrl format' });
    const mime = contentType || matches[1];
    const b64 = matches[2];
    const buffer = Buffer.from(b64, 'base64');
    const filePath = `${folder}/${fileName}`;

    const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, buffer, { contentType: mime, upsert: false });
    if (uploadError) return json(res, 500, { error: String(uploadError.message || uploadError) });

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return json(res, 200, { publicUrl: data.publicUrl });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('upload-player-photo error', err);
    return json(res, 500, { error: String(err) });
  }
}
