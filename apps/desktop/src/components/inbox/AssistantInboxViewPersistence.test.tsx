// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";

const KEY = "ai-orchestrator.inbox-view-filters.v1";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const NOW = Date.parse("2026-06-17T12:00:00.000Z");
const EVENTS = [{ id: "e1", type: "runner.gate.changed", createdAt: "2026-06-17T09:00:00.000Z" }];
const search = () => screen.getByTestId("inbox-search") as HTMLInputElement;
const focusRadio = (f: string) => screen.getByTestId(`inbox-focus-${f}`) as HTMLInputElement;
const catRadio = (c: string) => screen.getByTestId(`inbox-category-${c}`) as HTMLInputElement;
const q = (id: string) => screen.queryByTestId(id);

describe("Batch 11 — LINE B: active view persistence (local UI pref)", () => {
  it("remembers focus / category / search across mounts when persistence is on", () => {
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} persistViewMode />);
    fireEvent.click(catRadio("runner"));
    fireEvent.change(search(), { target: { value: "gate" } });
    fireEvent.click(focusRadio("blocked"));

    cleanup(); // fresh mount → initializer re-reads localStorage
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} persistViewMode />);
    expect(focusRadio("blocked").checked).toBe(true);
    expect(catRadio("runner").checked).toBe(true);
    expect(search().value).toBe("gate");
    expect(q("work-lane-blocked")).toBeTruthy();
    expect(q("work-lane-today")).toBeNull(); // focus blocked restored
  });

  it("does not persist when persistence is off", () => {
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    fireEvent.click(focusRadio("blocked"));
    expect(localStorage.getItem(KEY)).toBeNull();
    cleanup();
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    expect(focusRadio("all").checked).toBe(true); // default, not remembered
  });

  it("falls back to defaults when the stored view is invalid", () => {
    localStorage.setItem(KEY, JSON.stringify({ focus: "replay", category: "nope", query: 5 }));
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} persistViewMode />);
    expect(focusRadio("all").checked).toBe(true);
    expect(catRadio("all").checked).toBe(true);
    expect(search().value).toBe("");
  });
});
