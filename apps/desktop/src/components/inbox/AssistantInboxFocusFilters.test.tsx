// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { assertNoSideEffectActionControls } from "./inboxInvariant";
import { AssistantInboxContainer } from "./AssistantInboxContainer";

afterEach(() => cleanup());

const NOW = Date.parse("2026-06-17T12:00:00.000Z");
const EVENTS = [
  { id: "e1", type: "runner.gate.changed", createdAt: "2026-06-17T09:00:00.000Z" }, // today runner
  { id: "e2", type: "memory.candidate_suggested", createdAt: "2026-06-17T08:00:00.000Z" }, // today memory
];
const focus = (f: string) => screen.getByTestId(`inbox-focus-${f}`) as HTMLInputElement;
const cat = (c: string) => screen.getByTestId(`inbox-category-${c}`) as HTMLInputElement;
const q = (id: string) => screen.queryByTestId(id);

describe("Batch 10 — LINE C: focus views (view-only region narrowing)", () => {
  it("today focus shows only today/recent lanes and hides the card grid", () => {
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    expect(q("work-lane-rail")).toBeTruthy();
    expect(q("assistant-inbox-section-evidence")).toBeTruthy();

    fireEvent.click(focus("today"));
    expect(q("work-lane-today")).toBeTruthy();
    expect(q("work-lane-blocked")).toBeNull(); // other lanes hidden
    expect(q("assistant-inbox-section-evidence")).toBeNull(); // cards hidden
  });

  it("blocked focus shows only the blocked lane; warnings focus shows cards, hides lanes", () => {
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    fireEvent.click(focus("blocked"));
    expect(q("work-lane-blocked")).toBeTruthy();
    expect(q("work-lane-today")).toBeNull();

    fireEvent.click(focus("warnings"));
    expect(q("work-lane-rail")).toBeNull(); // lanes hidden
    expect(q("assistant-inbox-section-evidence")).toBeTruthy(); // cards shown
  });

  it("replay focus jumps to the REPLAY seat", () => {
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    fireEvent.click(focus("replay"));
    expect(screen.getByTestId("assistant-inbox").getAttribute("data-view-mode")).toBe("replay");
    expect(q("replay-deck")).toBeTruthy();
  });
});

describe("Batch 10 — LINE B: category filter refines the event lanes", () => {
  it("narrows the Today lane by category (view-only); 'all' restores it", () => {
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    expect(screen.getByTestId("work-lane-today").getAttribute("data-count")).toBe("2");
    fireEvent.click(cat("runner"));
    expect(screen.getByTestId("work-lane-today").getAttribute("data-count")).toBe("1");
    fireEvent.click(cat("all"));
    expect(screen.getByTestId("work-lane-today").getAttribute("data-count")).toBe("2");
  });

  it("the filter bar adds no side-effect action control (no buttons)", () => {
    const { container } = render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    assertNoSideEffectActionControls(container);
  });
});
