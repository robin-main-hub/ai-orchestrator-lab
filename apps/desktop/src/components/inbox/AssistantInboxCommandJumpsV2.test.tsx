// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { assertNoSideEffectActionControls, assertNoForbiddenActionText } from "./inboxInvariant";
import { AssistantInboxContainer } from "./AssistantInboxContainer";

// jsdom has no scrollIntoView — stub it so the focusSection jump effects can run.
beforeEach(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

// Batch 25 LINE J — Command Palette Power Pass: new local-view jump targets
// (Operator Console + Evidence Draft) wired through the focusSection command bus.

describe("Batch 25 — Operator Console jump (view-only)", () => {
  it("scrolls the Operator Console status strip into view on a focusSection command", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(
      <AssistantInboxContainer
        command={{ kind: "focusSection", value: "operator-console", nonce: 1 }}
      />,
    );
    expect(screen.getByTestId("assistant-inbox-status-strip")).toBeTruthy();
    expect(spy).toHaveBeenCalled();
    // the jump never changes the seat (stays PREVIEW) and adds no side-effect control
    assertNoSideEffectActionControls(screen.getByTestId("assistant-inbox"));
  });
});

describe("Batch 25 — Evidence Draft jump (view-only, PREVIEW-only)", () => {
  it("scrolls the Evidence Draft card into view in PREVIEW", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(
      <AssistantInboxContainer
        command={{ kind: "focusSection", value: "evidence-draft", nonce: 1 }}
      />,
    );
    expect(screen.getByTestId("evidence-draft-card")).toBeTruthy();
    expect(spy).toHaveBeenCalled();
    assertNoSideEffectActionControls(screen.getByTestId("assistant-inbox"));
    assertNoForbiddenActionText(screen.getByTestId("evidence-draft-card"));
  });

  it("is an honest no-op in LIVE (no draft card, no scroll, no throw)", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(
      <AssistantInboxContainer
        live={{}}
        command={{ kind: "focusSection", value: "evidence-draft", nonce: 1 }}
      />,
    );
    expect(screen.queryByTestId("evidence-draft-card")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
