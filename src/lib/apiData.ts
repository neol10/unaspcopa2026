type QueryValue = string | number | boolean | null | undefined;

const buildQuery = (params?: Record<string, QueryValue>) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

export const fetchPublicData = async <T,>(resource: string, params?: Record<string, QueryValue>) => {
  const response = await fetch(`/api/public-data${buildQuery({ resource, ...params })}`);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    let message = body || `Falha ao carregar ${resource}`;
    try {
      const parsed = JSON.parse(body) as { error?: unknown; message?: unknown; hint?: unknown };
      if (typeof parsed?.error === 'string' && parsed.error) message = parsed.error;
      if (typeof parsed?.message === 'string' && parsed.message) message = parsed.message;
      if (typeof parsed?.hint === 'string' && parsed.hint) message = `${message} (${parsed.hint})`;
    } catch {
      // keep raw body
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
};
