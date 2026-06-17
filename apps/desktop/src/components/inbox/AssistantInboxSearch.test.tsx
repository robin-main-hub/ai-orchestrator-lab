// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { assertNoSideEffectActionControls } from "./inboxInvariant";
import { AssistantInboxContainer } from "./AssistantInboxContainer";

afterEach(() => cleanup());

const NOW = Date.parse("2026-06-17T12:00:00.000Z");
const EVENTS = [
  { id: "e1", type: "runner.gate.changed", createdAt: "2026-06-17T09:00:00.000Z" },
  { id: "e2", type: "memory.candidate_suggested", createdAt: "2026-06-17T08:00:00.000Z" },
  { id: "e3", type: "learning.hypothesis_verified", createdAt: "2026-06-15T08:00:00.000Z" },
];
const inbox = () => screen.getByTestId("assistant-inbox");
const search = () => screen.getByTestId("inbox-search") as HTMLInputElement;
const type = (v: string) => fireEvent.change(search(), { target: { value: v } });
const laneCount = (id: string) =>
  screen.getByTestId(`work-lane-${id}`).getAttribute("data-count");
const modeRadio = (m: string) => screen.getByTestId(`inbox-mode-option-${m}`) as HTMLInputElement;

describe("Batch 10 — LINE A/D: local inbox search (view-only)", () => {
  it("filters Today lane rows by substring and is honest about no matches", () => {
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    expect(laneCount("today")).toBe("2"); // runner + memory today
    type("runner");
    expect(laneCount("today")).toBe("1");
    type("zzz-no-match");
    expect(laneCount("today")).toBe("0");
    expect(screen.getByTestId("work-lane-empty-today").textContent).toContain("검색 결과 없음");
  });

  it("filters REPLAY rows and clears with Esc", () => {
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    fireEvent.click(modeRadio("replay"));
    expect(screen.getByTestId("replay-deck").getAttribute("data-count")).toBe("3");
    type("learning");
    expect(screen.getByTestId("replay-deck").getAttribute("data-count")).toBe("1");
    fireEvent.keyDown(inbox(), { key: "Escape" });
    expect(screen.getByTestId("replay-deck").getAttribute("data-count")).toBe("3"); // cleared
  });

  it("'/' focuses the search input", () => {
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    expect(document.activeElement).not.toBe(search());
    fireEvent.keyDown(inbox(), { key: "/" });
    expect(document.activeElement).toBe(search());
  });

  it("adds no side-effect action control (no buttons; no approve/run/send text)", () => {
    const { container } = render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    assertNoSideEffectActionControls(container);
    const text = (container.textContent ?? "").toLowerCase();
    for (const banned of ["approve", "enable", "run ", "send", "apply", "dispatch"]) {
      expect(text.includes(banned)).toBe(false);
    }
  });
});
