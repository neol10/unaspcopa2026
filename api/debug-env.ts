export default async function handler(req, res) {
  const envKeys = Object.keys(process.env);
  const info = {
    hasServiceKey: envKeys.includes('SUPABASE_SERVICE_ROLE_KEY') || envKeys.includes('SUPABASE_SERVICE_KEY'),
    hasAnonKey: envKeys.includes('VITE_SUPABASE_ANON_KEY') || envKeys.includes('SUPABASE_ANON_KEY'),
    hasUrl: envKeys.includes('VITE_SUPABASE_URL') || envKeys.includes('SUPABASE_URL'),
    hasVapidPublic: envKeys.includes('VAPID_PUBLIC_KEY') || envKeys.includes('VITE_VAPID_PUBLIC_KEY'),
    hasVapidPrivate: envKeys.includes('VAPID_PRIVATE_KEY') || envKeys.includes('VITE_VAPID_PRIVATE_KEY'),
    vapidPublicPrefix: (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').substring(0, 10),
  };
  return res.status(200).json(info);
}
