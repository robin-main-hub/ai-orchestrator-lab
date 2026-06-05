import type { CenterMode } from "../types";

export type FocusHistory = Partial<Record<CenterMode, string>>;

export const createInitialFocusHistory = (): Record<CenterMode, string> => ({
  conversation: "",
  debate: "",
  tmux: "",
  cockpit: "",
});

const fallbackFocusSelectors: Record<CenterMode, string> = {
  conversation: 'textarea[data-focus-id="composer-textarea"]',
  debate: '[data-focus-id="debate-table-container"]',
  tmux: '[data-focus-id="tmux-swarm-board-container"]',
  cockpit: '[data-focus-id="cockpit-container"]',
};

export function createFocusSelector(focusId: string) {
  const escapedFocusId = focusId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `[data-focus-id="${escapedFocusId}"]`;
}

export function getFallbackFocusSelector(mode: CenterMode) {
  return fallbackFocusSelectors[mode];
}

export function getRestoreFocusSelector(mode: CenterMode, focusHistory: FocusHistory) {
  const focusId = focusHistory[mode];
  return focusId ? createFocusSelector(focusId) : getFallbackFocusSelector(mode);
}
