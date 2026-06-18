// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
} from "./inboxInvariant";
import type { EvidenceDraftInput } from "../../lib/evidenceDraft";
import type { WorkItemCandidateInput } from "../../lib/workItemCandidate";

afterEach(() => cleanup());

const draft: EvidenceDraftInput = {
  id: "draft-signals",
  title: "signals draft",
  sources: [{ id: "ev-alpha", label: "alpha evidence", observedAt: "2026-06-18T11:00:00.000Z" }],
  claims: [{ id: "claim-alpha", text: "alpha claim", refs: ["ev-alpha"] }],
};

const candidates: WorkItemCandidateInput[] = [
  {
    id: "wic-signal-board",
    title: "signal board candidate",
    kind: "patch",
    lane: "now",
    status: "blocked",
    risk: "high",
    sourceRefs: ["mission-alpha"],
    evidenceRefs: ["ev-alpha", "ev-missing"],
    reason: "patch safety blocked",
  },
  {
    id: "wic-signal-empty",
    title: "signal empty candidate",
    kind: "memory",
    lane: "watch",
    status: "candidate",
    risk: "low",
    reason: "memory hygiene",
  },
];

function renderSignals() {
  return render(<AssistantInboxContainer live={{ evidenceDraft: draft, workItemCandidates: candidates }} />);
}

describe("E14 — WorkItem Candidate signal chips and origin summary", () => {
  it("renders compact board signal chips from refs and derived context", () => {
    renderSignals();

    const row = within(screen.getByTestId("wic-row-wic-signal-board"));
    expect(row.getByTestId("wic-signal-chip-wic-signal-board-patch-linked").textContent).toContain("patch-linked");
    expect(row.getByTestId("wic-signal-chip-wic-signal-board-source-linked").textContent).toContain("source-linked");
    expect(row.getByTestId("wic-signal-chip-wic-signal-board-evidence-linked").textContent).toContain(
      "evidence-linked",
    );
    expect(row.getByTestId("wic-signal-chip-wic-signal-board-draft-linked").textContent).toContain("draft-linked");
    expect(row.getByTestId("wic-signal-chip-wic-signal-board-missing-evidence").textContent).toContain(
      "missing-evidence",
    );
    expect(row.getByTestId("wic-signal-chip-wic-signal-board-blocked-risk").textContent).toContain("blocked-risk");
  });

  it("renders a read-only origin summary in candidate detail", () => {
    renderSignals();

    fireEvent.click(screen.getByTestId("wic-row-wic-signal-board"));

    const summary = screen.getByTestId("wic-signal-summary");
    expect(summary.textContent).toContain("origin · patch");
    expect(summary.textContent).toContain("signals · 5");
    expect(summary.textContent).toContain("missing · next-step");
    expect(summary.textContent).toContain("unresolved refs · mission-alpha, ev-alpha, ev-missing");
    expect(summary.textContent).toContain("readiness · blocked");
    assertNoSideEffectActionControls(summary);
    assertNoForbiddenActionText(summary);
  });

  it("renders honest missing signal state without fake resolution", () => {
    renderSignals();

    const row = within(screen.getByTestId("wic-row-wic-signal-empty"));
    expect(row.getByTestId("wic-signal-chip-wic-signal-empty-memory-linked").textContent).toContain("memory-linked");
    expect(row.getByTestId("wic-signal-chip-wic-signal-empty-source-linked").textContent).toContain(
      "source missing",
    );
    expect(row.getByTestId("wic-signal-chip-wic-signal-empty-evidence-linked").textContent).toContain(
      "evidence missing",
    );

    fireEvent.click(screen.getByTestId("wic-row-wic-signal-empty"));
    const summary = screen.getByTestId("wic-signal-summary");
    expect(summary.textContent).toContain("missing · source, evidence, draft, next-step");
    expect(summary.textContent).toContain("unresolved refs · none / unknown");
  });
});
