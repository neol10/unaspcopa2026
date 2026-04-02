export type TournamentPhase = 'grupos' | 'oitavas' | 'quartas' | 'semifinal' | 'final';

export type MatchPhaseInput = {
  round: number;
  status: 'agendado' | 'ao_vivo' | 'finalizado';
};

export const KNOCKOUT_PHASE_BY_ROUND: Record<number, TournamentPhase> = {
  1000: 'oitavas',
  1001: 'quartas',
  1002: 'semifinal',
  1003: 'final',
};

export const KNOCKOUT_ROUND_LABELS: Record<number, string> = {
  1000: 'Oitavas',
  1001: 'Quartas',
  1002: 'Semi',
  1003: 'Final',
  1004: '3o Lugar',
};

export const isValidKnockoutCode = (round: number) => {
  return round >= 1000 && round <= 1004;
};

export const detectTournamentPhase = (matches: MatchPhaseInput[]): TournamentPhase => {
  const knockout = matches.filter((m) => m.round >= 1000);
  if (knockout.length === 0) return 'grupos';

  const pendingCodes = Array.from(new Set(
    knockout
      .filter((m) => m.status !== 'finalizado')
      .map((m) => m.round)
      .filter((round): round is number => round in KNOCKOUT_PHASE_BY_ROUND)
  )).sort((a, b) => a - b);

  if (pendingCodes.length > 0) {
    return KNOCKOUT_PHASE_BY_ROUND[pendingCodes[0]];
  }

  const presentCodes = Array.from(new Set(
    knockout
      .map((m) => m.round)
      .filter((round): round is number => round in KNOCKOUT_PHASE_BY_ROUND)
  )).sort((a, b) => b - a);

  return presentCodes.length > 0 ? KNOCKOUT_PHASE_BY_ROUND[presentCodes[0]] : 'grupos';
};
