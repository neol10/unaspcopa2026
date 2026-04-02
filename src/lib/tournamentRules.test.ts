import { describe, expect, it } from 'vitest';
import {
  detectTournamentPhase,
  isValidKnockoutCode,
  KNOCKOUT_ROUND_LABELS,
} from './tournamentRules';

describe('tournamentRules', () => {
  it('returns grupos when there are no knockout matches', () => {
    const phase = detectTournamentPhase([
      { round: 1, status: 'agendado' },
      { round: 2, status: 'finalizado' },
    ]);

    expect(phase).toBe('grupos');
  });

  it('returns earliest pending knockout phase', () => {
    const phase = detectTournamentPhase([
      { round: 1001, status: 'agendado' },
      { round: 1002, status: 'agendado' },
      { round: 1003, status: 'agendado' },
    ]);

    expect(phase).toBe('quartas');
  });

  it('returns latest present knockout phase when all are finished', () => {
    const phase = detectTournamentPhase([
      { round: 1000, status: 'finalizado' },
      { round: 1001, status: 'finalizado' },
      { round: 1002, status: 'finalizado' },
      { round: 1003, status: 'finalizado' },
    ]);

    expect(phase).toBe('final');
  });

  it('accepts valid knockout codes only', () => {
    expect(isValidKnockoutCode(1000)).toBe(true);
    expect(isValidKnockoutCode(1004)).toBe(true);
    expect(isValidKnockoutCode(999)).toBe(false);
    expect(isValidKnockoutCode(1005)).toBe(false);
  });

  it('exposes expected round labels', () => {
    expect(KNOCKOUT_ROUND_LABELS[1000]).toBe('Oitavas');
    expect(KNOCKOUT_ROUND_LABELS[1001]).toBe('Quartas');
    expect(KNOCKOUT_ROUND_LABELS[1002]).toBe('Semi');
    expect(KNOCKOUT_ROUND_LABELS[1003]).toBe('Final');
  });
});
