// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { assertNoSideEffectActionControls } from "./inboxInvariant";
import { AssistantInboxContainer } from "./AssistantInboxContainer";

afterEach(() => cleanup());

const EVENTS = [
  { id: "e1", type: "runner.gate.changed", createdAt: "2026-06-17T09:00:00.000Z" }, // runner
  { id: "e2", type: "learning.hypothesis_verified", createdAt: "2026-06-16T09:00:00.000Z" }, // learning
  { id: "e3", type: "session.started", createdAt: "2026-06-15T09:00:00.000Z" }, // system
  { id: "e4", type: "memory.candidate_suggested", createdAt: "2026-06-14T09:00:00.000Z" }, // memory
];
const modeRadio = (m: string) => screen.getByTestId(`inbox-mode-option-${m}`) as HTMLInputElement;
const filterRadio = (f: string) => screen.getByTestId(`replay-filter-${f}`) as HTMLInputElement;
const deck = () => screen.getByTestId("replay-deck");

describe("Batch 9 — LINE C: REPLAY read-only category filters", () => {
  it("filters the replay by generic category without mutating the data", () => {
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS }} />);
    fireEvent.click(modeRadio("replay"));

    // all (default) shows every event
    expect(deck().getAttribute("data-filter")).toBe("all");
    expect(deck().getAttribute("data-count")).toBe("4");

    fireEvent.click(filterRadio("runner"));
    expect(deck().getAttribute("data-filter")).toBe("runner");
    expect(deck().getAttribute("data-count")).toBe("1");

    fireEvent.click(filterRadio("learning"));
    expect(deck().getAttribute("data-count")).toBe("1");

    fireEvent.click(filterRadio("failure"));
    expect(deck().getAttribute("data-count")).toBe("0"); // none → honest empty
    expect(screen.getByTestId("replay-deck-empty")).toBeTruthy();

    // back to all restores the full set — proves the filter never mutated the data
    fireEvent.click(filterRadio("all"));
    expect(deck().getAttribute("data-count")).toBe("4");
  });

  it("offers all seven read-only filters and adds no buttons", () => {
    const { container } = render(<AssistantInboxContainer live={{ recentEvents: EVENTS }} />);
    fireEvent.click(modeRadio("replay"));
    for (const f of ["all", "failure", "learning", "runner", "memory", "approval", "system"]) {
      expect(screen.getByTestId(`replay-filter-${f}`)).toBeTruthy();
    }
    assertNoSideEffectActionControls(container);
  });
});
