import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase credentials missing! Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Evita conflito de Lock causado pelo React StrictMode
    // que monta cada componente 2x em desenvolvimento
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: 'copa-unasp-auth',
  },
  global: {
    // Timeout mais curto para evitar requests pendurados
    fetch: (url, options) => {
      const asString = typeof url === 'string' ? url : url.toString();

      // Auth (sessão/refresh) pode ser mais lento em rede móvel/baixa;
      // não queremos derrubar o boot do app por um timeout agressivo.
      const timeoutMs = asString.includes('/auth/v1/')
        ? 30000
        : asString.includes('/realtime/v1/') || asString.includes('/storage/v1/')
          ? 30000
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

      let hardTimeoutId: ReturnType<typeof setTimeout> | undefined;
      const hardTimeoutPromise = new Promise<Response>((_, reject) => {
        hardTimeoutId = setTimeout(() => {
          reject(new Error('Request timeout'));
        }, timeoutMs + 4000);
      });

      const fetchPromise = fetch(url, { ...options, signal: controller.signal });

      return Promise.race([fetchPromise, hardTimeoutPromise]).finally(() => {
        clearTimeout(abortTimeoutId);
        if (hardTimeoutId) clearTimeout(hardTimeoutId);
      });
    },
  }
});
