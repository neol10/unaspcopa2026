export type Court = 'QUADRA 1' | 'QUADRA 2';

export const COURT_OPTIONS: Court[] = ['QUADRA 1', 'QUADRA 2'];
export const DEFAULT_COURT: Court = 'QUADRA 1';

export const parseCourtFromLocation = (location: string | null | undefined): Court | null => {
  const raw = String(location || '').toUpperCase();
  if (raw.includes('QUADRA 1')) return 'QUADRA 1';
  if (raw.includes('QUADRA 2')) return 'QUADRA 2';
  return null;
};

export const stripCourtFromLocation = (location: string | null | undefined): string | null => {
  const raw = typeof location === 'string' ? location : '';
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Remove sufixos comuns: " - QUADRA 1" / "– QUADRA 2" / etc.
  const without = trimmed.replace(/\s*[-–—]\s*QUADRA\s*[12]\s*$/i, '').trim();
  return without || null;
};

export const splitLocationCourt = (location: string | null | undefined) => {
  return {
    base: stripCourtFromLocation(location),
    court: parseCourtFromLocation(location),
  };
};

export const buildLocationFromCourt = (baseLocation: string, court: Court) => `${baseLocation} - ${court}`;
