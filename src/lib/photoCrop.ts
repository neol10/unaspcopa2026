export type PhotoCrop = { x: number; y: number };

const clamp01 = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const splitHash = (url: string) => {
  const raw = String(url || '').trim();
  const idx = raw.indexOf('#');
  if (idx < 0) return { base: raw, hash: '' };
  return { base: raw.slice(0, idx), hash: raw.slice(idx + 1) };
};

export const parsePhotoCropFromUrl = (url: string): { src: string; crop: PhotoCrop | null; objectPosition?: string } => {
  const { base, hash } = splitHash(url);
  const src = base || String(url || '').trim();
  if (!hash) return { src, crop: null };

  const m = hash.match(/^pos=(\d{1,3})(?:[,x](\d{1,3}))?$/i);
  if (!m) return { src, crop: null };

  const x = clamp01(Number(m[1]));
  const y = clamp01(Number(m[2] ?? '50'));
  const crop = { x, y };
  return { src, crop, objectPosition: `${x}% ${y}%` };
};

export const setPhotoCropOnUrl = (url: string, x: number, y: number) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const { base } = splitHash(raw);
  const cx = Math.round(clamp01(x));
  const cy = Math.round(clamp01(y));
  return `${base || raw}#pos=${cx},${cy}`;
};

export const clearPhotoCropFromUrl = (url: string) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const { base } = splitHash(raw);
  return base || raw;
};
