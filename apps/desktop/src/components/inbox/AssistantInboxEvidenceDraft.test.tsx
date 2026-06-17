// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { assertNoSideEffectActionControls, assertNoForbiddenActionText } from "./inboxInvariant";

afterEach(() => cleanup());

// Batch 24 — Evidence Draft / Footnote Surface: a read-only draft of claims with
// numbered evidence footnotes, freshness chips, and a missing-info/ask slot.

describe("Batch 24 — Evidence Draft card", () => {
  it("PREVIEW shows the draft title and a numbered footnotes table", () => {
    render(<AssistantInboxContainer />); // PREVIEW
    const card = screen.getByTestId("evidence-draft-card");
    expect(card).toBeTruthy();
    expect(screen.getByTestId("evidence-draft-title").textContent).toContain("example-system");
    // four known refs → four footnotes
    expect(screen.getByTestId("evidence-draft-footnote-1")).toBeTruthy();
    expect(screen.getByTestId("evidence-draft-footnote-4")).toBeTruthy();
    expect(screen.getByTestId("evidence-draft-footnote-1").textContent).toContain("source-001");
  });

  it("scores each footnote with a freshness chip (fresh / aging / stale / unknown)", () => {
    render(<AssistantInboxContainer />);
    expect(screen.getByTestId("evidence-draft-freshness-1").getAttribute("data-freshness")).toBe("fresh");
    expect(screen.getByTestId("evidence-draft-freshness-2").getAttribute("data-freshness")).toBe("aging");
    expect(screen.getByTestId("evidence-draft-freshness-3").getAttribute("data-freshness")).toBe("stale");
    expect(screen.getByTestId("evidence-draft-freshness-4").getAttribute("data-freshness")).toBe("unknown");
    // a stale footnote present → the header warning chip shows
    expect(screen.getByTestId("evidence-draft-stale-count").getAttribute("data-stale-count")).toBe("1");
  });

  it("links claims to footnote markers and surfaces unbacked claims in the ask slot", () => {
    render(<AssistantInboxContainer />);
    expect(screen.getByTestId("evidence-draft-claim-claim-1").getAttribute("data-supported")).toBe("true");
    expect(screen.getByTestId("evidence-draft-claim-claim-1").textContent).toContain("[1]");
    expect(screen.getByTestId("evidence-draft-claim-claim-2").textContent).toContain("[2][3]");
    // claim-4 has no source → marked unsupported and listed under missing info / ask
    expect(screen.getByTestId("evidence-draft-claim-claim-4").getAttribute("data-supported")).toBe("false");
    const missing = screen.getByTestId("evidence-draft-missing");
    expect(missing.getAttribute("data-missing-count")).toBe("1");
    expect(screen.getByTestId("evidence-draft-ask-claim-4").textContent).toContain("ask the operator");
  });

  it("is PREVIEW-only — never appears in LIVE (no fixture leak)", () => {
    render(<AssistantInboxContainer live={{}} />);
    expect(screen.queryByTestId("evidence-draft-card")).toBeNull();
  });

  it("is read-only: no buttons, no side-effect/domain text", () => {
    render(<AssistantInboxContainer />);
    const card = screen.getByTestId("evidence-draft-card");
    expect(card.querySelectorAll("button").length).toBe(0);
    assertNoSideEffectActionControls(card);
    assertNoForbiddenActionText(card);
  });
});
