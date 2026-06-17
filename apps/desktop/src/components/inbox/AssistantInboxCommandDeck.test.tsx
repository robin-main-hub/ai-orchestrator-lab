// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
  collectActionControls,
} from "./inboxInvariant";

beforeEach(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

// Batch 16 LINE B — Command Deck: real local-view <button>s for fast operation.
// The keystone proof that the upgraded invariant accepts local view buttons.

const DECK_IDS = [
  "my-desk",
  "today",
  "blocked",
  "failures",
  "runner",
  "learning",
  "replay",
  "source-dock",
  "patch-candidates",
  "clear",
];

describe("Batch 16 LINE B — Command Deck", () => {
  it("renders all local-view deck buttons, each scoped local-view", () => {
    render(<AssistantInboxContainer />);
    const deck = screen.getByTestId("command-deck");
    for (const id of DECK_IDS) {
      expect(screen.getByTestId(`command-deck-${id}`)).toBeTruthy();
    }
    const controls = collectActionControls(deck);
    expect(controls.length).toBe(DECK_IDS.length);
    expect(controls.every((b) => b.getAttribute("data-action-scope") === "local-view")).toBe(true);
  });

  it("KEYSTONE: the upgraded invariant accepts the deck (buttons allowed, no side effect)", () => {
    const { container } = render(<AssistantInboxContainer />);
    // real <button>s are present now...
    expect(container.querySelectorAll("button").length).toBeGreaterThan(0);
    // ...and the invariant passes because they are scoped local-view view controls.
    assertNoSideEffectActionControls(container);
    assertNoForbiddenActionText(container);
  });

  it("clicking Blocked focuses blocked; Today applies the Today preset", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("command-deck-blocked"));
    expect(screen.getByTestId("assistant-inbox-stat-view").textContent).toContain("Blocked");
    fireEvent.click(screen.getByTestId("command-deck-today"));
    expect(screen.getByTestId("assistant-inbox-stat-view").textContent).toContain("Today");
  });

  it("Clear Filters resets to the My Desk combo", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("command-deck-failures"));
    expect(screen.getByTestId("assistant-inbox-stat-view").textContent).toContain("Failures");
    fireEvent.click(screen.getByTestId("command-deck-clear"));
    expect(screen.getByTestId("assistant-inbox-stat-view").textContent).toContain("My Desk");
  });

  it("Source Dock button scrolls the dock (view-only) without changing seat", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<AssistantInboxContainer />); // PREVIEW
    fireEvent.click(screen.getByTestId("command-deck-source-dock"));
    expect(spy).toHaveBeenCalled();
    // still PREVIEW (jump never changes the seat)
    expect(screen.getByTestId("assistant-inbox-status-strip").getAttribute("data-mode")).toBe(
      "preview",
    );
  });

  it("Replay button switches the seat to replay (a local view/seat toggle)", () => {
    render(<AssistantInboxContainer live={{}} />); // starts LIVE
    fireEvent.click(screen.getByTestId("command-deck-replay"));
    expect(screen.getByTestId("assistant-inbox-status-strip").getAttribute("data-mode")).toBe(
      "replay",
    );
  });

  it("does not fire any callback on mount (no auto-action)", () => {
    const spy = vi.fn();
    render(
      <div onClick={spy}>
        <AssistantInboxContainer />
      </div>,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
