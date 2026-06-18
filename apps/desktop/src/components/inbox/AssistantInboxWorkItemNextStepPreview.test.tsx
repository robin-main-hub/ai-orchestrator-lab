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
  id: "draft-next-step",
  title: "next-step draft",
  sources: [
    { id: "ev-1", label: "linked evidence", observedAt: "2026-06-18T11:00:00.000Z" },
  ],
  claims: [{ id: "claim-a", text: "linked claim", refs: ["ev-1"] }],
};

const linkedCandidate: WorkItemCandidateInput = {
  id: "wic-next-linked",
  title: "linked next candidate",
  kind: "patch",
  lane: "now",
  status: "blocked",
  risk: "high",
  reason: "patch safety blocked",
  sourceRefs: ["mission-alpha"],
  evidenceRefs: ["ev-1", "ev-missing"],
};

const emptyCandidate: WorkItemCandidateInput = {
  id: "wic-next-empty",
  title: "empty next candidate",
  kind: "memory",
  lane: "watch",
  status: "candidate",
  risk: "low",
  reason: "memory hygiene",
};

describe("E9 — WorkItem Candidate next-step preview UI", () => {
  it("shows preview-only/not-committed labels in the candidate detail drawer", () => {
    render(
      <AssistantInboxContainer
        live={{ evidenceDraft: liveDraft, workItemCandidates: [linkedCandidate], nowMs: NOW }}
      />,
    );

    fireEvent.click(screen.getByTestId("wic-row-wic-next-linked"));

    const preview = screen.getByTestId("wic-next-step-preview");
    expect(preview.getAttribute("data-risk")).toBe("high");
    expect(preview.textContent).toContain("preview only");
    expect(preview.textContent).toContain("not committed");
    expect(preview.textContent).toContain("no lifecycle transition");
    expect(screen.getByTestId("wic-next-step-candidate").textContent).toContain("wic-next-linked");
    expect(screen.getByTestId("wic-next-step-state").textContent).toContain("now");
    expect(screen.getByTestId("wic-next-step-state").textContent).toContain("blocked");
    expect(screen.getByTestId("wic-next-step-state").textContent).toContain("high");
  });

  it("shows available/missing refs and linked draft claims when present", () => {
    render(
      <AssistantInboxContainer
        live={{ evidenceDraft: liveDraft, workItemCandidates: [linkedCandidate], nowMs: NOW }}
      />,
    );

    fireEvent.click(screen.getByTestId("wic-row-wic-next-linked"));

    expect(screen.getByTestId("wic-next-step-sourceRefs").textContent).toContain("mission-alpha");
    expect(screen.getByTestId("wic-next-step-evidenceRefs").textContent).toContain("ev-1");
    expect(screen.getByTestId("wic-next-step-missingEvidence").textContent).toContain("ev-missing");
    expect(screen.getByTestId("wic-next-step-draftClaims").textContent).toContain("claim-a");
    expect(screen.getByTestId("wic-next-step-draftFootnotes").textContent).toContain("[1]");
    expect(screen.getByTestId("wic-next-step-riskNotes").textContent).toContain("high risk candidate");
    expect(screen.getByTestId("wic-next-step-riskNotes").textContent).toContain("blocked candidate");
    expect(screen.getByTestId("wic-next-step-operator-note").textContent).toContain(
      "Review candidate wic-next-linked",
    );
  });

  it("shows honest empty states when refs and draft links are absent", () => {
    render(<AssistantInboxContainer live={{ workItemCandidates: [emptyCandidate], nowMs: NOW }} />);

    fireEvent.click(screen.getByTestId("wic-row-wic-next-empty"));

    expect(screen.getByTestId("wic-next-step-sourceRefs").textContent).toContain("none / unknown");
    expect(screen.getByTestId("wic-next-step-evidenceRefs").textContent).toContain("none / unknown");
    expect(screen.getByTestId("wic-next-step-missingSource").textContent).toContain("source refs unknown");
    expect(screen.getByTestId("wic-next-step-missingEvidence").textContent).toContain("evidence refs unknown");
    expect(screen.getByTestId("wic-next-step-draftClaims").textContent).toContain("no linked draft claims");
    expect(screen.getByTestId("wic-next-step-draftFootnotes").textContent).toContain("no linked draft footnotes");
  });

  it("PREVIEW renders an example next-step preview, while LIVE does not receive PREVIEW refs", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("wic-row-wic-patch-patch-002"));
    expect(screen.getByTestId("wic-next-step-preview").textContent).toContain("source-001");

    cleanup();
    render(<AssistantInboxContainer live={{ workItemCandidates: [emptyCandidate], nowMs: NOW }} />);
    fireEvent.click(screen.getByTestId("wic-row-wic-next-empty"));
    expect(screen.getByTestId("wic-next-step-preview").textContent).not.toContain("source-001");
  });

  it("keeps next-step preview local-detail only with no side-effect controls", () => {
    render(
      <AssistantInboxContainer
        live={{ evidenceDraft: liveDraft, workItemCandidates: [linkedCandidate], nowMs: NOW }}
      />,
    );

    fireEvent.click(screen.getByTestId("wic-row-wic-next-linked"));
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
