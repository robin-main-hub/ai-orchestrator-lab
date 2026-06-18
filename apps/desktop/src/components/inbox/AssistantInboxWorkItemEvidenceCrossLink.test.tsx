// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
  collectActionControls,
} from "./inboxInvariant";
import type { EvidenceDraftInput } from "../../lib/evidenceDraft";
import type { WorkItemCandidateInput } from "../../lib/workItemCandidate";

afterEach(() => cleanup());

const NOW = Date.parse("2026-06-18T12:00:00.000Z");

const liveDraft: EvidenceDraftInput = {
  id: "draft-cross-link",
  title: "cross-link draft",
  sources: [
    { id: "ev-1", label: "live evidence one", observedAt: "2026-06-18T11:00:00.000Z" },
    { id: "ev-2", label: "live evidence two", observedAt: "2026-06-18T10:00:00.000Z" },
  ],
  claims: [
    { id: "claim-a", text: "first linked claim", refs: ["ev-1"] },
    { id: "claim-b", text: "second claim", refs: ["ev-2"] },
  ],
};

const linkedCandidate: WorkItemCandidateInput = {
  id: "wic-linked-live",
  title: "linked live candidate",
  kind: "patch",
  lane: "now",
  status: "blocked",
  risk: "high",
  evidenceRefs: ["ev-1"],
  reason: "patch safety blocked",
};

const unmatchedCandidate: WorkItemCandidateInput = {
  id: "wic-unmatched-live",
  title: "unmatched live candidate",
  kind: "source",
  lane: "watch",
  status: "candidate",
  risk: "low",
  evidenceRefs: ["missing-ref"],
  reason: "source health stale",
};

describe("E8 — WorkItem Candidate ↔ Evidence Draft cross-link UI", () => {
  it("shows related draft evidence in the candidate detail drawer when refs overlap", () => {
    render(
      <AssistantInboxContainer
        live={{ evidenceDraft: liveDraft, workItemCandidates: [linkedCandidate, unmatchedCandidate], nowMs: NOW }}
      />,
    );

    fireEvent.click(screen.getByTestId("wic-row-wic-linked-live"));

    const crossLinks = screen.getByTestId("wic-draft-cross-links");
    expect(crossLinks.getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-draft-cross-link-ev-1").textContent).toContain("[1]");
    expect(screen.getByTestId("wic-draft-cross-link-ev-1").textContent).toContain("claim-a");
    expect(screen.getByTestId("wic-draft-cross-link-ev-1").textContent).toContain("live evidence one");
  });

  it("shows an honest empty state in candidate detail when no draft refs match", () => {
    render(
      <AssistantInboxContainer
        live={{ evidenceDraft: liveDraft, workItemCandidates: [linkedCandidate, unmatchedCandidate], nowMs: NOW }}
      />,
    );

    fireEvent.click(screen.getByTestId("wic-row-wic-unmatched-live"));

    expect(screen.getByTestId("wic-draft-cross-links").getAttribute("data-count")).toBe("0");
    expect(screen.getByTestId("wic-draft-cross-link-empty").textContent).toContain(
      "no matching draft evidence",
    );
  });

  it("shows related candidate counts on Evidence Draft footnotes", () => {
    render(
      <AssistantInboxContainer
        live={{ evidenceDraft: liveDraft, workItemCandidates: [linkedCandidate, unmatchedCandidate], nowMs: NOW }}
      />,
    );

    expect(screen.getByTestId("evidence-draft-related-candidate-count").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("evidence-draft-footnote-related-1").textContent).toContain("1 candidate");
    expect(screen.queryByTestId("evidence-draft-footnote-related-2")).toBeNull();
  });

  it("does not fake LIVE links when draft or candidates are absent", () => {
    render(<AssistantInboxContainer live={{ workItemCandidates: [linkedCandidate], nowMs: NOW }} />);

    expect(screen.queryByTestId("evidence-draft-card")).toBeNull();
    fireEvent.click(screen.getByTestId("wic-row-wic-linked-live"));
    expect(screen.getByTestId("wic-draft-cross-link-empty").textContent).toContain(
      "no matching draft evidence",
    );

    cleanup();
    render(<AssistantInboxContainer live={{ evidenceDraft: liveDraft, nowMs: NOW }} />);
    expect(screen.queryByTestId("evidence-draft-related-candidate-count")).toBeNull();
  });

  it("PREVIEW shows cross-links only from overlapping fixture refs", () => {
    render(<AssistantInboxContainer />);

    expect(screen.getByTestId("evidence-draft-related-candidate-count").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("evidence-draft-footnote-related-1").textContent).toContain("1 candidate");
  });

  it("keeps cross-link UI read-only and locally scoped", () => {
    render(
      <AssistantInboxContainer
        live={{ evidenceDraft: liveDraft, workItemCandidates: [linkedCandidate], nowMs: NOW }}
      />,
    );

    const draftCard = screen.getByTestId("evidence-draft-card");
    assertNoSideEffectActionControls(draftCard);
    assertNoForbiddenActionText(draftCard);

    fireEvent.click(screen.getByTestId("wic-row-wic-linked-live"));
    const drawer = screen.getByTestId("work-item-candidate-detail-drawer");
    assertNoSideEffectActionControls(drawer);
    assertNoForbiddenActionText(drawer);
    for (const control of collectActionControls(drawer)) {
      expect(control.getAttribute("data-action-scope")).toBe("local-detail");
    }
    expect((drawer.textContent ?? "").toLowerCase()).not.toMatch(
      /create work item|launch|eventstorage|server write|runner dispatch|patch apply/,
    );
  });
});
