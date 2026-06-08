import type { CenterMode } from "../types";

export type FocusHistory = Partial<Record<CenterMode, string>>;

export const createInitialFocusHistory = (): Record<CenterMode, string> => ({
  agents: "",
  annex: "",
  cockpit: "",
  conversation: "",
  debate: "",
  tmux: "",
});

const fallbackFocusSelectors: Record<CenterMode, string> = {
  agents: '[data-focus-id="agent-skill-profile-panel"]',
  annex: '[data-focus-id="debate-annex-container"]',
  cockpit: '[data-focus-id="cockpit-container"]',
  conversation: 'textarea[data-focus-id="composer-textarea"]',
  debate: '[data-focus-id="debate-table-container"]',
  tmux: '[data-focus-id="tmux-swarm-board-container"]',
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
