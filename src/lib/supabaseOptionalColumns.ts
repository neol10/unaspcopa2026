type MaybePostgrestError = {
  message?: unknown;
  details?: unknown;
  code?: unknown;
  hint?: unknown;
} | null | undefined;

type OptionalColumnStatus = 'unknown' | 'present' | 'missing';

let divisionColumnStatus: OptionalColumnStatus = 'unknown';
let nightColumnStatus: OptionalColumnStatus = 'unknown';

export const getDivisionColumnStatus = (): OptionalColumnStatus => divisionColumnStatus;
export const markDivisionColumnMissing = () => {
  divisionColumnStatus = 'missing';
};

export const markDivisionColumnPresent = () => {
  divisionColumnStatus = 'present';
};

export const getNightColumnStatus = (): OptionalColumnStatus => nightColumnStatus;

export const markNightColumnMissing = () => {
  nightColumnStatus = 'missing';
};

export const markNightColumnPresent = () => {
  nightColumnStatus = 'present';
};

export const isMissingColumnError = (err: MaybePostgrestError, column: string) => {
  const msg = typeof err?.message === 'string' ? err.message : '';
  const details = typeof err?.details === 'string' ? err.details : '';
  const hint = typeof err?.hint === 'string' ? err.hint : '';
  const code = typeof err?.code === 'string' ? err.code : '';

  const haystack = `${msg} ${details} ${hint}`.toLowerCase();
  const needle = String(column).toLowerCase();

  // Postgres: 42703 = undefined_column
  if (code === '42703') return true;

  // PostgREST geralmente devolve "column <table>.<col> does not exist"
  if (haystack.includes('does not exist') && haystack.includes('column') && haystack.includes(needle)) {
    return true;
  }

  // Alguns casos vêm como "schema cache"
  if (haystack.includes('schema cache') && haystack.includes(needle)) {
    return true;
  }

  return false;
};
