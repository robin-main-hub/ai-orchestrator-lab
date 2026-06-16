// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";

afterEach(() => cleanup());

const NOW = Date.parse("2026-06-17T12:00:00.000Z");
const EVENTS = [
  { id: "e1", type: "runner.gate.changed", createdAt: "2026-06-17T09:00:00.000Z" }, // runner
  { id: "e2", type: "memory.candidate_suggested", createdAt: "2026-06-17T08:00:00.000Z" }, // memory
];
const live = { recentEvents: EVENTS, nowMs: NOW };
const viewMode = () => screen.getByTestId("assistant-inbox").getAttribute("data-view-mode");
const q = (id: string) => screen.queryByTestId(id);
const laneCount = (id: string) => screen.getByTestId(`work-lane-${id}`).getAttribute("data-count");

describe("Batch 11 — LINE C: command-bus (palette → inbox view, view-only)", () => {
  it("mode command jumps the seat (handled by the container)", () => {
    const { rerender } = render(<AssistantInboxContainer live={live} />);
    expect(viewMode()).toBe("live");
    rerender(<AssistantInboxContainer live={live} command={{ kind: "mode", value: "replay", nonce: 1 }} />);
    expect(viewMode()).toBe("replay");
  });

  it("focus command narrows the region (handled by the inbox)", () => {
    const { rerender } = render(<AssistantInboxContainer live={live} />);
    rerender(<AssistantInboxContainer live={live} command={{ kind: "focus", value: "blocked", nonce: 1 }} />);
    expect(q("work-lane-blocked")).toBeTruthy();
    expect(q("work-lane-today")).toBeNull();
  });

  it("category command filters, and clear resets the whole view", () => {
    const { rerender } = render(<AssistantInboxContainer live={live} />);
    expect(laneCount("today")).toBe("2");
    rerender(<AssistantInboxContainer live={live} command={{ kind: "category", value: "runner", nonce: 1 }} />);
    expect(laneCount("today")).toBe("1");
    rerender(<AssistantInboxContainer live={live} command={{ kind: "clear", nonce: 2 }} />);
    expect(laneCount("today")).toBe("2");
    expect((screen.getByTestId("inbox-category-all") as HTMLInputElement).checked).toBe(true);
  });

  it("the command bus adds no buttons (view-only)", () => {
    const { container } = render(
      <AssistantInboxContainer live={live} command={{ kind: "focus", value: "blocked", nonce: 1 }} />,
    );
    expect(container.querySelectorAll("button").length).toBe(0);
  });

  it("re-applies the SAME command when re-issued (nonce bump → effect re-runs)", () => {
    const { rerender } = render(<AssistantInboxContainer live={live} />);
    // First issue: focus blocked
    rerender(<AssistantInboxContainer live={live} command={{ kind: "focus", value: "blocked", nonce: 1 }} />);
    expect(q("work-lane-today")).toBeNull();
    // User manually returns to all
    fireEvent.click(screen.getByTestId("inbox-focus-all"));
    expect(q("work-lane-today")).toBeTruthy();
    // Re-issue the SAME command (same kind/value, fresh nonce) → re-applies
    rerender(<AssistantInboxContainer live={live} command={{ kind: "focus", value: "blocked", nonce: 2 }} />);
    expect(q("work-lane-today")).toBeNull();
  });
});
