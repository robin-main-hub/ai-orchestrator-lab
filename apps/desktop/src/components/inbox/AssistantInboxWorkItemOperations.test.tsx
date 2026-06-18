// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
} from "./inboxInvariant";
import type { EvidenceDraftInput } from "../../lib/evidenceDraft";
import type { WorkItemCandidateInput } from "../../lib/workItemCandidate";

afterEach(() => cleanup());

const liveDraft: EvidenceDraftInput = {
  id: "draft-ops",
  title: "operations draft",
  sources: [
    { id: "ev-ready", label: "ready evidence", observedAt: "2026-06-18T11:00:00.000Z" },
  ],
  claims: [{ id: "claim-ready", text: "ready claim", refs: ["ev-ready"] }],
};

const candidates: WorkItemCandidateInput[] = [
  {
    id: "wic-blocked",
    title: "blocked candidate",
    kind: "patch",
    lane: "now",
    status: "blocked",
    risk: "high",
    sourceRefs: ["mission-alpha"],
    evidenceRefs: ["ev-risk"],
    observed: true,
    reason: "patch safety blocked",
  },
  {
    id: "wic-needs-evidence",
    title: "needs evidence candidate",
    kind: "source",
    lane: "now",
    status: "candidate",
    risk: "medium",
    sourceRefs: ["source-stale"],
    reason: "source stale",
  },
  {
    id: "wic-ready",
    title: "ready candidate",
    kind: "evidence",
    lane: "watch",
    status: "observed",
    risk: "low",
    sourceRefs: ["source-ready"],
    evidenceRefs: ["ev-ready"],
    observed: true,
    reason: "evidence present",
  },
];

function renderOperations() {
  return render(
    <AssistantInboxContainer live={{ evidenceDraft: liveDraft, workItemCandidates: candidates }} />,
  );
}

describe("E11 — WorkItem Candidate operations room board", () => {
  it("renders compact operations summary counts", () => {
    renderOperations();

    const summary = screen.getByTestId("wic-operations-summary");
    expect(summary.getAttribute("data-total")).toBe("3");
    expect(screen.getByTestId("wic-ops-summary-ready").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-ops-summary-needs-evidence").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-ops-summary-blocked").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-ops-summary-confidence-high").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-ops-summary-confidence-low").getAttribute("data-count")).toBe("2");
    expect(screen.getByTestId("wic-ops-summary-linked-draft").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-ops-summary-next-blockers").getAttribute("data-count")).toBe("2");
  });

  it("renders grouped operations sections while preserving rows", () => {
    renderOperations();

    expect(screen.getByTestId("wic-ops-group-now").textContent).toContain("blocked candidate");
    expect(screen.getByTestId("wic-ops-group-now").textContent).toContain("needs evidence candidate");
    expect(screen.getByTestId("wic-ops-group-watch").textContent).toContain("ready candidate");
    expect(screen.getByTestId("wic-ops-group-blocked-needs-evidence").textContent).toContain("blocked candidate");
    expect(screen.getByTestId("wic-ops-group-blocked-needs-evidence").textContent).toContain(
      "needs evidence candidate",
    );
    expect(screen.getByTestId("wic-row-wic-ready")).toBeTruthy();
  });

  it("renders PREVIEW candidates in the grouped board", () => {
    render(<AssistantInboxContainer />);

    expect(screen.getByTestId("work-item-candidates-card").getAttribute("data-total")).not.toBe("0");
    expect(screen.getByTestId("wic-ops-group-now")).toBeTruthy();
    expect(screen.getByTestId("wic-ops-group-watch")).toBeTruthy();
  });

  it("keeps LIVE empty honest when candidate inputs are absent", () => {
    render(<AssistantInboxContainer live={{ workItemCandidates: [] }} />);

    expect(screen.getByTestId("work-item-candidates-empty").textContent).toContain("작업 후보 신호 없음");
    expect(screen.getByTestId("wic-operations-summary").getAttribute("data-total")).toBe("0");
  });

  it("stays read-only with no side-effect controls", () => {
    renderOperations();
    const card = screen.getByTestId("work-item-candidates-card");

    assertNoSideEffectActionControls(card);
    assertNoForbiddenActionText(card);
    expect((card.textContent ?? "").toLowerCase()).not.toMatch(
      /create work item|launch|eventstorage|server write|runner dispatch|patch apply/,
    );
  });
});
