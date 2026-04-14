export type Division = 'masculino' | 'feminino';

export const DEFAULT_DIVISION: Division = 'masculino';
export const DIVISION_STORAGE_KEY = 'copa_unasp_division_v1';

export const normalizeDivision = (raw: unknown): Division => {
  return raw === 'feminino' ? 'feminino' : 'masculino';
};

export const readStoredDivision = (): Division => {
  if (typeof window === 'undefined') return DEFAULT_DIVISION;
  try {
    const raw = localStorage.getItem(DIVISION_STORAGE_KEY);
    return normalizeDivision(raw);
  } catch {
    return DEFAULT_DIVISION;
  }
};

export const writeStoredDivision = (division: Division) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DIVISION_STORAGE_KEY, division);
  } catch {
    // noop
  }
};
