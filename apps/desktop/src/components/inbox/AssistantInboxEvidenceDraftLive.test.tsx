// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { assertNoSideEffectActionControls, assertNoForbiddenActionText } from "./inboxInvariant";
import type { EvidenceDraftInput } from "../../lib/evidenceDraft";

afterEach(() => cleanup());

// Engine E4A — Evidence Draft LIVE input seam. The PREVIEW-only Batch 24 surface
// now also renders a REAL draft passed via live.evidenceDraft (projected upstream
// by the pure projectEvidenceDraft). No producer, no send, no write.

const NOW = Date.parse("2026-06-18T12:00:00.000Z");

const liveDraft: EvidenceDraftInput = {
  id: "live-draft-1",
  title: "live status draft",
  sources: [
    { id: "source-001", label: "live build log", observedAt: "2026-06-18T11:30:00.000Z" }, // 30m → fresh
    { id: "source-002", label: "live prior check", observedAt: "2026-06-10T12:00:00.000Z" }, // ~8d → stale
  ],
  claims: [
    { id: "c1", text: "live system observed clean", refs: ["source-001"] },
    { id: "c2", text: "an older signal is still present", refs: ["source-002"] },
    { id: "c3", text: "downstream impact not yet assessed", refs: [] }, // unbacked → ask slot
  ],
};

describe("E4A — Evidence Draft LIVE input seam", () => {
  it("LIVE renders a real draft: claims, numbered footnotes, freshness chips, ask slot", () => {
    render(<AssistantInboxContainer live={{ evidenceDraft: liveDraft, nowMs: NOW }} />);
    expect(screen.getByTestId("evidence-draft-card")).toBeTruthy();
    expect(screen.getByTestId("evidence-draft-title").textContent).toContain("live status draft");
    // footnotes numbered from the live draft's refs
    expect(screen.getByTestId("evidence-draft-footnote-1").textContent).toContain("source-001");
    expect(screen.getByTestId("evidence-draft-freshness-1").getAttribute("data-freshness")).toBe("fresh");
    expect(screen.getByTestId("evidence-draft-freshness-2").getAttribute("data-freshness")).toBe("stale");
    // claim → footnote markers + unbacked claim falls into the missing-info/ask slot
    expect(screen.getByTestId("evidence-draft-claim-c1").textContent).toContain("[1]");
    expect(screen.getByTestId("evidence-draft-ask-c3")).toBeTruthy();
  });

  it("LIVE with no evidenceDraft shows no card (honest empty)", () => {
    render(<AssistantInboxContainer live={{}} />);
    expect(screen.queryByTestId("evidence-draft-card")).toBeNull();
  });

  it("PREVIEW still renders the example draft (unchanged)", () => {
    render(<AssistantInboxContainer />); // PREVIEW
    expect(screen.getByTestId("evidence-draft-card")).toBeTruthy();
    expect(screen.getByTestId("evidence-draft-title").textContent).toContain("example-system");
  });

  it("no PREVIEW fixture leaks into a LIVE draft", () => {
    render(<AssistantInboxContainer live={{ evidenceDraft: liveDraft, nowMs: NOW }} />);
    // the live draft has 2 footnotes + claim ids c1..c3 — the example's 4th footnote
    // and claim-N ids must NOT appear (no fixture leak into LIVE)
    expect(screen.queryByTestId("evidence-draft-footnote-4")).toBeNull();
    expect(screen.queryByTestId("evidence-draft-claim-claim-1")).toBeNull();
    expect(screen.getByTestId("evidence-draft-title").textContent).not.toContain("example-system");
  });

  it("the LIVE draft card is read-only (no buttons, no side-effect/domain text)", () => {
    render(<AssistantInboxContainer live={{ evidenceDraft: liveDraft, nowMs: NOW }} />);
    const card = screen.getByTestId("evidence-draft-card");
    expect(card.querySelectorAll("button").length).toBe(0);
    assertNoSideEffectActionControls(card);
    assertNoForbiddenActionText(card);
  });
});
