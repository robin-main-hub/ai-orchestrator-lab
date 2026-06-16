// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { activeViewPreset, VIEW_PRESETS } from "./AssistantInbox";
import { AssistantInboxContainer } from "./AssistantInboxContainer";

afterEach(() => cleanup());

const NOW = Date.parse("2026-06-17T12:00:00.000Z");
const EVENTS = [
  { id: "e1", type: "runner.gate.changed", createdAt: "2026-06-17T09:00:00.000Z" }, // runner today
  { id: "e2", type: "sandbox.error_card", createdAt: "2026-06-17T08:00:00.000Z" }, // failure today
];
const view = (id: string) => screen.getByTestId(`inbox-view-${id}`) as HTMLInputElement;
const q = (id: string) => screen.queryByTestId(id);

describe("Batch 11 — LINE A: saved view presets (view-only)", () => {
  it("activeViewPreset matches the default desk combo (pure)", () => {
    expect(activeViewPreset("all", "all", "")?.id).toBe("my-desk");
    expect(VIEW_PRESETS.map((p) => p.id)).toContain("blocked");
  });

  it("defaults to My Desk and applies presets as view-only filter combos", () => {
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    expect(screen.getByTestId("inbox-views").getAttribute("data-active-view")).toBe("my-desk");
    expect(view("my-desk").checked).toBe(true);

    // Blocked preset → focus blocked (only blocked lane, cards hidden)
    fireEvent.click(view("blocked"));
    expect(q("work-lane-blocked")).toBeTruthy();
    expect(q("work-lane-today")).toBeNull();
    expect(q("assistant-inbox-section-evidence")).toBeNull();

    // Failures preset → category failure refines the Today lane
    fireEvent.click(view("failures"));
    expect(screen.getByTestId("work-lane-today").getAttribute("data-count")).toBe("1");
  });

  it("Replay preset jumps to the REPLAY seat", () => {
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    fireEvent.click(view("replay"));
    expect(screen.getByTestId("assistant-inbox").getAttribute("data-view-mode")).toBe("replay");
  });

  it("adds no side-effect action control (no buttons)", () => {
    const { container } = render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    expect(container.querySelectorAll("button").length).toBe(0);
  });
});
