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
    throw new Error(body || `Falha ao carregar ${resource}`);
  }
  return (await response.json()) as T;
};
