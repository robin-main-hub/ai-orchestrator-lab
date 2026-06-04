import { describe, expect, it } from "vitest";
import {
  createFocusSelector,
  getFallbackFocusSelector,
  getRestoreFocusSelector,
} from "./focusRestoration";

describe("focus restoration selectors", () => {
  it("uses the last focused element for the requested mode when available", () => {
    expect(
      getRestoreFocusSelector("debate", {
        conversation: "composer-textarea",
        debate: "agent-card-reviewer",
        tmux: "tmux-swarm-board-container",
      }),
    ).toBe('[data-focus-id="agent-card-reviewer"]');
  });

  it("falls back to the mode primary focus target when history is missing", () => {
    expect(getRestoreFocusSelector("conversation", {})).toBe(
      'textarea[data-focus-id="composer-textarea"]',
    );
    expect(getRestoreFocusSelector("debate", {})).toBe(
      '[data-focus-id="debate-table-container"]',
    );
    expect(getRestoreFocusSelector("tmux", {})).toBe(
      '[data-focus-id="tmux-swarm-board-container"]',
    );
  });

  it("escapes quoted focus ids before building data-focus selectors", () => {
    expect(createFocusSelector('agent-card-a"b')).toBe(
      '[data-focus-id="agent-card-a\\"b"]',
    );
  });

  it("exposes stable fallback selectors for App mode restoration", () => {
    expect(getFallbackFocusSelector("conversation")).toBe(
      'textarea[data-focus-id="composer-textarea"]',
    );
    expect(getFallbackFocusSelector("debate")).toBe(
      '[data-focus-id="debate-table-container"]',
    );
    expect(getFallbackFocusSelector("tmux")).toBe(
      '[data-focus-id="tmux-swarm-board-container"]',
    );
  });
});
