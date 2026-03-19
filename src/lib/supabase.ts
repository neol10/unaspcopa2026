import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase credentials missing! Check your .env file.');
}

const createSupabaseClient = () => createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Evita conflito de Lock causado pelo React StrictMode
    // que monta cada componente 2x em desenvolvimento
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    multiTab: false,
    storageKey: 'copa-unasp-auth',
  },
  global: {
    // Timeout mais curto para evitar requests pendurados
    fetch: (url, options) => {
      const asString = typeof url === 'string' ? url : url.toString();

      // Timeouts balanceados para estabilidade em rede móvel/instável.
      // Auth: 30s, Realtime: 45s, Storage (upload): 180s, Queries padrão: 20s
      const timeoutMs = asString.includes('/auth/v1/')
        ? 30000
        : asString.includes('/realtime/v1/')
          ? 45000
          : asString.includes('/storage/v1/')
            ? 180000
          : 20000;
      const controller = new AbortController();

      if (options?.signal) {
        if (options.signal.aborted) {
          controller.abort();
        } else {
          options.signal.addEventListener('abort', () => controller.abort(), { once: true });
        }
      }

      const abortTimeoutId = setTimeout(() => controller.abort(), timeoutMs);

      return fetch(url, { ...options, signal: controller.signal }).finally(() => {
        clearTimeout(abortTimeoutId);
      });
    },
  }
});

const createStorageClient = () => createClient(supabaseUrl, supabaseAnonKey, {
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
