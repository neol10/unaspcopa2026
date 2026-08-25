/**
 * Helper to get a safe team label, defaulting to fallback if name is empty.
 */
export const getTeamLabel = (name: string | null | undefined, fallback: string = 'Equipe'): string => {
  const trimmed = (name || '').trim();
  return trimmed ? trimmed : fallback;
};

/**
 * Helper to get a three-letter uppercase team short name.
 */
export const getTeamShortName = (name: string | null | undefined, fallback: string = '???'): string => {
  const trimmed = (name || '').trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/\s+/g, '').slice(0, 3).toUpperCase();
};

export const isKnockoutRound = (roundText: string | null | undefined): boolean => {
  const clean = String(roundText || '').toLowerCase().trim();
  const num = Number(clean);
  if (Number.isFinite(num) && num >= 1000) return true;
  return (
    clean.includes('final') || 
    clean.includes('semi') || 
    clean.includes('quarta') || 
    clean.includes('oitava') ||
    clean.includes('terceiro') ||
    clean.includes('3o') ||
    clean.includes('3º')
  );
};

/**
 * Formatting for match period display.
 */
export const formatMatchPeriod = (status: string, period: string | null): string => {
  if (status !== 'ao_vivo') return status.toUpperCase();
  return period || 'AO VIVO';
};
