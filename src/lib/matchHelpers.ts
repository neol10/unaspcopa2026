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

/**
 * Checks if a round is a knockout phase.
 */
export const isKnockoutRound = (roundText: string | null | undefined): boolean => {
  const clean = String(roundText || '').toLowerCase();
  return (
    clean.includes('final') || 
    clean.includes('semi') || 
    clean.includes('quarta') || 
    clean.includes('oitava')
  );
};

/**
 * Formatting for match period display.
 */
export const formatMatchPeriod = (status: string, period: string | null): string => {
  if (status !== 'ao_vivo') return status.toUpperCase();
  return period || 'AO VIVO';
};
