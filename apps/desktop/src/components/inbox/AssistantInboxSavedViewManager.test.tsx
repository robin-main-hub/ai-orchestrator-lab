// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const NOW = Date.parse("2026-06-17T12:00:00.000Z");
const live = { recentEvents: [{ id: "e1", type: "runner.gate.changed", createdAt: "2026-06-17T09:00:00.000Z" }], nowMs: NOW };
const q = (id: string) => screen.queryByTestId(id);
const name = () => screen.getByTestId("saved-view-name") as HTMLInputElement;

const saveCurrentAs = (label: string) => {
  fireEvent.change(name(), { target: { value: label } });
  fireEvent.click(screen.getByTestId("saved-view-save"));
};

describe("Batch 12 — LINE B/C: user saved view manager (local UI pref)", () => {
  it("is hidden unless persistence is on (keeps the read-only default inbox)", () => {
    render(<AssistantInboxContainer live={live} />); // no persist
    expect(q("saved-view-manager")).toBeNull();
  });

  it("saves the current view locally, applies it, and deletes it", () => {
    render(<AssistantInboxContainer live={live} persistViewMode />);
    expect(q("saved-view-manager")).toBeTruthy();
    expect(q("saved-view-empty")).toBeTruthy();

    // capture focus=blocked into a named view
    fireEvent.click(screen.getByTestId("inbox-focus-blocked"));
    saveCurrentAs("blocked-desk");
    expect(q("saved-view-blocked-desk")).toBeTruthy();

    // move away, then apply the saved view → focus restored
    fireEvent.click(screen.getByTestId("inbox-focus-all"));
    expect(q("work-lane-today")).toBeTruthy();
    fireEvent.click(screen.getByTestId("saved-view-apply-blocked-desk"));
    expect(q("work-lane-today")).toBeNull(); // focus=blocked re-applied

    // delete (local) → gone
    fireEvent.click(screen.getByTestId("saved-view-delete-blocked-desk"));
    expect(q("saved-view-blocked-desk")).toBeNull();
    expect(q("saved-view-empty")).toBeTruthy();
  });

  it("persists saved views across mounts (localStorage)", () => {
    render(<AssistantInboxContainer live={live} persistViewMode />);
    saveCurrentAs("keep-me");
    cleanup();
    render(<AssistantInboxContainer live={live} persistViewMode />);
    expect(q("saved-view-keep-me")).toBeTruthy();
  });

  it("every manager button is a local-preference control (no side-effect action)", () => {
    const { container } = render(<AssistantInboxContainer live={live} persistViewMode />);
    fireEvent.click(screen.getByTestId("inbox-focus-blocked"));
    saveCurrentAs("v1");
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThan(0);
    expect(
      buttons.every((b) => b.getAttribute("data-action-scope") === "local-preference"),
    ).toBe(true);
  });

  it("a saved PREVIEW view never leaks fixtures into LIVE", () => {
    render(<AssistantInboxContainer live={live} persistViewMode />);
    fireEvent.click(screen.getByTestId("inbox-mode-option-preview"));
    saveCurrentAs("preview-view");
    fireEvent.click(screen.getByTestId("inbox-mode-option-live"));
    expect(q("evidence-card-evidence-001")).toBeNull(); // no fixture in LIVE
  });

  it("manager controls carry no OS side-effect action words", () => {
    const { container } = render(<AssistantInboxContainer live={live} persistViewMode />);
    const text = (container.textContent ?? "").toLowerCase();
    for (const banned of ["approve", "send", "dispatch", "run tool", "append event"]) {
      expect(text.includes(banned)).toBe(false);
    }
    expect(container.textContent).toContain("로컬 전용"); // clearly labeled local
  });
});
