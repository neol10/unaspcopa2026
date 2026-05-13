import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

export interface AuthResult {
  user: { id: string; email?: string } | null;
  role: 'admin' | 'user' | null;
  error?: string;
  statusCode?: number;
}

const missingEnv = () => {
  if (!SUPABASE_URL) return 'Missing SUPABASE_URL';
  if (!SUPABASE_ANON_KEY) return 'Missing SUPABASE_ANON_KEY';
  return null;
};

/**
 * Verifies the Supabase JWT from the Authorization header
 * and optionally checks for administrative privileges.
 */
export async function verifyAuth(
  authHeader: string | undefined,
  requireAdmin = false,
): Promise<AuthResult> {
  if (!authHeader) {
    return { user: null, role: null, error: 'Missing Authorization header', statusCode: 401 };
  }

  const envErr = missingEnv();
  if (envErr) {
    return { user: null, role: null, error: envErr, statusCode: 500 };
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return { user: null, role: null, error: 'Invalid or expired token', statusCode: 401 };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return { user, role: 'user', error: 'Profile not found', statusCode: 403 };
  }

  const role = profile.role as 'admin' | 'user';

  if (requireAdmin && role !== 'admin') {
    return { user, role, error: 'Forbidden: Admin access required', statusCode: 403 };
  }

  return { user, role };
}
