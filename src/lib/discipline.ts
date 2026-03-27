export type CardCounts = {
  yellow_cards?: number | null;
  red_cards?: number | null;
};

export type SuspensionStatus = {
  isSuspended: boolean;
  suspendedGames: number;
  reason: 'red' | 'yellow' | null;
};

// Rules (Copa Unasp 2026):
// - Every 2 yellow cards => 1 match suspension
// - Every 1 red card => 1 match suspension
// This helper only computes the number of suspensions earned from total cards.
// Consuming code decides how to apply “serving” those suspensions.
export const getSuspensionFromCards = (counts: CardCounts): SuspensionStatus => {
  const yellows = Math.max(0, Number(counts.yellow_cards || 0));
  const reds = Math.max(0, Number(counts.red_cards || 0));

  const yellowSuspensions = Math.floor(yellows / 2);
  const redSuspensions = reds;
  const suspendedGames = yellowSuspensions + redSuspensions;

  if (suspendedGames <= 0) {
    return { isSuspended: false, suspendedGames: 0, reason: null };
  }

  // Prefer red as the primary reason if any.
  const reason: SuspensionStatus['reason'] = reds > 0 ? 'red' : 'yellow';
  return { isSuspended: true, suspendedGames, reason };
};
