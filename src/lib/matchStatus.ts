export type DerivedMatchStatus = 'agendado' | 'ao_vivo' | 'finalizado';

export type MatchStatusLike = {
  status?: string | null;
  match_date?: string | null;
  is_timer_running?: boolean | null;
  timer_started_at?: string | null;
  timer_offset_seconds?: number | null;
};

const MAX_LIVE_SECONDS = 4 * 60 * 60; // 4h: evita jogo "preso" como ao vivo
const MAX_LIVE_PAST_MS = 4 * 60 * 60 * 1000; // 4h após o horário do jogo
const MAX_LIVE_FUTURE_MS = 6 * 60 * 60 * 1000; // 6h antes do horário do jogo

const parseMs = (value?: string | null) => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

export const getLiveSeconds = (match: MatchStatusLike, nowMs = Date.now()) => {
  if (match.status !== 'ao_vivo') return null;

  const offset = typeof match.timer_offset_seconds === 'number' ? match.timer_offset_seconds : 0;
  if (match.is_timer_running && match.timer_started_at) {
    const startedAtMs = parseMs(match.timer_started_at);
    if (startedAtMs === null) return offset;
    const diffSeconds = Math.floor((nowMs - startedAtMs) / 1000);
    return offset + Math.max(0, diffSeconds);
  }

  return offset;
};

export const deriveMatchStatus = (match: MatchStatusLike, nowMs = Date.now()): DerivedMatchStatus => {
  const raw = match.status;

  if (raw === 'agendado' || raw === 'finalizado') return raw;

  // Qualquer coisa diferente de 'ao_vivo' cai no default mais seguro.
  if (raw !== 'ao_vivo') return 'agendado';

  const liveSeconds = getLiveSeconds(match, nowMs);
  const matchDateMs = parseMs(match.match_date);

  // Timer absurdo = certamente não está mais ao vivo.
  if (typeof liveSeconds === 'number' && liveSeconds > MAX_LIVE_SECONDS) {
    if (typeof matchDateMs === 'number' && matchDateMs > nowMs) return 'agendado';
    return 'finalizado';
  }

  // Se o horário do jogo é muito distante, não consideramos "ao vivo".
  if (typeof matchDateMs === 'number') {
    if (nowMs - matchDateMs > MAX_LIVE_PAST_MS) return 'finalizado';
    if (matchDateMs - nowMs > MAX_LIVE_FUTURE_MS) return 'agendado';
  }

  return 'ao_vivo';
};

export const isActuallyLive = (match: MatchStatusLike, nowMs = Date.now()) => {
  return deriveMatchStatus(match, nowMs) === 'ao_vivo';
};
