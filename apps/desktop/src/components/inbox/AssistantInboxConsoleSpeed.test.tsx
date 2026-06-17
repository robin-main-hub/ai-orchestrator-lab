// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { assertNoSideEffectActionControls } from "./inboxInvariant";

beforeEach(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

const inbox = () => screen.getByTestId("assistant-inbox");

// Batch 19 — Operator Console speed polish: view-only keyboard accelerators,
// a discoverable shortcuts hint, and a patch-count at-a-glance chip.

describe("Batch 19 — keyboard accelerators (view-only)", () => {
  it("'s' jumps to the Source Dock, 'p' jumps to Patch Candidates (scroll only)", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<AssistantInboxContainer />); // PREVIEW (dock + patch lane present)
    fireEvent.keyDown(inbox(), { key: "s" });
    expect(spy).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(inbox(), { key: "p" });
    expect(spy).toHaveBeenCalledTimes(2);
    // seat unchanged by the jumps
    expect(screen.getByTestId("assistant-inbox-status-strip").getAttribute("data-mode")).toBe(
      "preview",
    );
  });

  it("'b' focuses Blocked, 'c' clears back to My Desk (view filters only)", () => {
    render(<AssistantInboxContainer />);
    fireEvent.keyDown(inbox(), { key: "b" });
    expect(screen.getByTestId("assistant-inbox-stat-view").textContent).toContain("Blocked");
    fireEvent.keyDown(inbox(), { key: "c" });
    expect(screen.getByTestId("assistant-inbox-stat-view").textContent).toContain("My Desk");
  });

  it("accelerators are suppressed while typing in the search box", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<AssistantInboxContainer />);
    const search = screen.getByTestId("inbox-search") as HTMLInputElement;
    search.focus();
    fireEvent.keyDown(search, { key: "s" });
    fireEvent.keyDown(search, { key: "p" });
    expect(spy).not.toHaveBeenCalled(); // typing "s"/"p" must not trigger jumps
  });

  it("a modifier-held key does not trigger an accelerator", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<AssistantInboxContainer />);
    fireEvent.keyDown(inbox(), { key: "s", metaKey: true });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("Batch 19 — at-a-glance + discoverability", () => {
  it("shows the shortcuts hint row (display-only, no buttons)", () => {
    render(<AssistantInboxContainer />);
    const hint = screen.getByTestId("inbox-shortcuts-hint");
    expect(hint.textContent).toContain("소스독");
    expect(hint.querySelectorAll("button").length).toBe(0);
  });

  it("shows a patch-count chip in the console when patch candidates exist (PREVIEW)", () => {
    render(<AssistantInboxContainer />); // 3 example patch candidates
    expect(screen.getByTestId("assistant-inbox-stat-patch").textContent).toContain("3");
  });

  it("LIVE empty → no patch-count chip (honest)", () => {
    render(<AssistantInboxContainer live={{}} />);
    expect(screen.queryByTestId("assistant-inbox-stat-patch")).toBeNull();
  });

  it("the console + accelerators add no side-effect controls", () => {
    const { container } = render(<AssistantInboxContainer />);
    assertNoSideEffectActionControls(container);
  });
});
