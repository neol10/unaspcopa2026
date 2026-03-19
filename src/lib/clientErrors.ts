type ClientErrorInsert = {
  source: string;
  message: string;
  stack?: string | null;
  path?: string | null;
  user_agent?: string | null;
  app_version?: string | null;
  extra?: unknown;
};

const QUEUE_KEY = 'copa_unasp_client_errors_queue';
const LAST_SENT_KEY = 'copa_unasp_client_errors_last_sent';
const DISABLED_KEY = 'copa_unasp_client_errors_disabled';

let reporterDisabled: boolean | null = null;

const getAppVersion = () => {
  try {
    return localStorage.getItem('app_version');
  } catch {
    return null;
  }
};

const safeParse = (raw: string | null) => {
  if (!raw) return [] as ClientErrorInsert[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ClientErrorInsert[]) : [];
  } catch {
    return [] as ClientErrorInsert[];
  }
};

const loadQueue = () => {
  try {
    return safeParse(localStorage.getItem(QUEUE_KEY));
  } catch {
    return [] as ClientErrorInsert[];
  }
};

const isReporterDisabled = () => {
  if (reporterDisabled != null) return reporterDisabled;

  try {
    reporterDisabled = sessionStorage.getItem(DISABLED_KEY) === '1';
  } catch {
    reporterDisabled = false;
  }

  return reporterDisabled;
};

const disableReporter = () => {
  reporterDisabled = true;
  try {
    sessionStorage.setItem(DISABLED_KEY, '1');
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // ignore
  }
};

const isPermanentInsertError = (err: unknown) => {
  const raw = err as { code?: unknown; message?: unknown; details?: unknown; status?: unknown };
  const code = typeof raw?.code === 'string' ? raw.code : '';
  const status = typeof raw?.status === 'number' ? raw.status : 0;
  const message = typeof raw?.message === 'string' ? raw.message.toLowerCase() : '';
  const details = typeof raw?.details === 'string' ? raw.details.toLowerCase() : '';

  if (status === 400 || status === 401 || status === 403 || status === 404) return true;
  if (code === '42501' || code === '42P01' || code.startsWith('PGRST')) return true;

  return (
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    message.includes('does not exist') ||
    details.includes('row-level security')
  );
};

const saveQueue = (queue: ClientErrorInsert[]) => {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-25)));
  } catch {
    // ignore
  }
};

const shouldThrottle = (signature: string) => {
  try {
    const raw = sessionStorage.getItem(LAST_SENT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { sig: string; ts: number };
    if (parsed.sig !== signature) return false;
    return Date.now() - parsed.ts < 15_000;
  } catch {
    return false;
  }
};

const markSent = (signature: string) => {
  try {
    sessionStorage.setItem(LAST_SENT_KEY, JSON.stringify({ sig: signature, ts: Date.now() }));
  } catch {
    // ignore
  }
};

export const reportClientError = (payload: Omit<ClientErrorInsert, 'app_version'>) => {
  if (import.meta.env.DEV || isReporterDisabled()) return;

  const item: ClientErrorInsert = {
    ...payload,
    app_version: getAppVersion(),
  };

  const signature = `${item.source}::${item.message}::${item.path || ''}`.slice(0, 200);
  if (shouldThrottle(signature)) return;
  markSent(signature);

  const queue = loadQueue();
  queue.push(item);
  saveQueue(queue);

  // Tenta enviar em background (não bloqueia UI)
  void flushClientErrorQueue();
};

export const flushClientErrorQueue = async () => {
  if (import.meta.env.DEV || isReporterDisabled()) return;
  if (!navigator.onLine) return;

  const queue = loadQueue();
  if (queue.length === 0) return;

  try {
    const { supabase } = await import('./supabase');
    const batch = queue.slice(0, 10);

    const { error } = await supabase.from('client_errors').insert(batch);
    if (error) throw error;

    const remaining = queue.slice(batch.length);
    saveQueue(remaining);

    if (remaining.length > 0) {
      // envia em lotes sem travar
      setTimeout(() => void flushClientErrorQueue(), 800);
    }
  } catch (err) {
    if (isPermanentInsertError(err)) {
      disableReporter();
      return;
    }

    // Se falhar, mantém na fila
  }
};

export const reportErrorFromWindowEvent = (e: unknown, source: string) => {
  const evt = e as {
    message?: unknown;
    reason?: unknown;
    error?: { stack?: unknown; name?: unknown };
  };

  const reason = evt?.reason as { message?: unknown; stack?: unknown; name?: unknown } | undefined;
  const message =
    (typeof evt?.message === 'string' ? evt.message : '') ||
    (typeof reason?.message === 'string' ? reason.message : '') ||
    (typeof evt?.reason === 'string' ? evt.reason : '') ||
    'Erro desconhecido';

  const stack = (evt?.error?.stack ?? reason?.stack) || null;
  const path = window.location?.pathname || null;

  reportClientError({
    source,
    message: String(message),
    stack: stack ? String(stack) : null,
    path,
    user_agent: navigator.userAgent,
    extra: {
      name: evt?.error?.name ?? reason?.name,
    },
  });
};
