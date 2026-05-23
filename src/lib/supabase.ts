import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasSupabaseEnv) {
  console.error('Supabase credentials missing! Check your .env file.');
}

const fallbackSupabaseUrl = 'https://example.invalid';
const fallbackSupabaseAnonKey = 'placeholder-anon-key';

const createSupabaseClient = () => createClient(supabaseUrl || fallbackSupabaseUrl, supabaseAnonKey || fallbackSupabaseAnonKey, {
  auth: {
    // autoRefreshToken habilitado para renovar tokens automaticamente e manter sessão ativa.
    // Sem isso, usuários ficam "deslogados" após o token expirar (~1h).
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: 'copa-unasp-auth',
  },
  global: {
    // Timeout mais curto para evitar requests pendurados
    fetch: (url, options) => {
      const asString = typeof url === 'string' ? url : url.toString();

      // Timeouts balanceados para estabilidade em rede móvel/instável.
      // Auth: 20s, Realtime: 45s, Storage (upload): 180s, Queries padrão: 45s
      const timeoutMs = asString.includes('/auth/v1/')
        ? 20000
        : asString.includes('/realtime/v1/')
          ? 45000
          : asString.includes('/storage/v1/')
            ? 180000
          : 45000;
      const controller = new AbortController();
      let parentAbortHandler: (() => void) | null = null;

      if (options?.signal) {
        if (options.signal.aborted) {
          controller.abort(options.signal.reason);
        } else {
          parentAbortHandler = () => controller.abort(options.signal?.reason);
          options.signal.addEventListener('abort', parentAbortHandler, { once: true });
        }
      }

      const abortTimeoutId = setTimeout(() => {
        controller.abort(new DOMException('Supabase request timeout', 'TimeoutError'));
      }, timeoutMs);

      return fetch(url, { ...options, signal: controller.signal }).finally(() => {
        clearTimeout(abortTimeoutId);
        if (options?.signal && parentAbortHandler) {
          options.signal.removeEventListener('abort', parentAbortHandler);
        }
      });
    },
  }
});

const createStorageClient = () => createClient(supabaseUrl || fallbackSupabaseUrl, supabaseAnonKey || fallbackSupabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: (url, options) => fetch(url, options),
  }
});

type SupabaseClientSingleton = ReturnType<typeof createSupabaseClient>;

declare global {
  interface Window {
    __copaSupabaseClient?: SupabaseClientSingleton;
    __copaSupabaseStorageClient?: SupabaseClientSingleton;
  }
}

export const supabase: SupabaseClientSingleton =
  typeof window !== 'undefined'
    ? (window.__copaSupabaseClient ?? (window.__copaSupabaseClient = createSupabaseClient()))
    : createSupabaseClient();

export const supabaseStorage: SupabaseClientSingleton =
  typeof window !== 'undefined'
    ? (window.__copaSupabaseStorageClient ?? (window.__copaSupabaseStorageClient = createStorageClient()))
    : createStorageClient();
