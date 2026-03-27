export type GoalOverlayPayload = {
  team: string;
  player: string;
};

const EVENT_NAME = 'copaunasp:goal';

export const emitGoalOverlay = (payload: GoalOverlayPayload) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<GoalOverlayPayload>(EVENT_NAME, { detail: payload }));
};

export const onGoalOverlay = (handler: (payload: GoalOverlayPayload) => void) => {
  if (typeof window === 'undefined') return () => {};
  const listener = (ev: Event) => {
    const custom = ev as CustomEvent<GoalOverlayPayload>;
    if (!custom?.detail) return;
    handler(custom.detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
};
