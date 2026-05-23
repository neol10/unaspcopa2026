export const isProbablyMobile = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(max-width: 768px)').matches || window.innerWidth <= 768;
};

export const readFreshCache = <T,>(key: string, maxAgeMs: number) => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: T };
    if (!parsed?.ts || Date.now() - parsed.ts > maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const shouldUseClientCache = () => {
  // Cache local acelera rankings/jogadores no mobile, reduzindo telas vazias longas.
  return true;
};
