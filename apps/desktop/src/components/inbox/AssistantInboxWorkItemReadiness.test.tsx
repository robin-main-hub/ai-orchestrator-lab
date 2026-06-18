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

const liveDraft: EvidenceDraftInput = {
  id: "draft-readiness",
  title: "readiness draft",
  sources: [
    { id: "ev-ready", label: "ready evidence", observedAt: "2026-06-18T11:00:00.000Z" },
  ],
  claims: [{ id: "claim-ready", text: "ready claim", refs: ["ev-ready"] }],
};

const readyCandidate: WorkItemCandidateInput = {
  id: "wic-ready",
  title: "ready candidate",
  kind: "evidence",
  lane: "soon",
  status: "observed",
  risk: "low",
  sourceRefs: ["source-ready"],
  evidenceRefs: ["ev-ready"],
  observed: true,
  reason: "evidence present",
};

const blockedCandidate: WorkItemCandidateInput = {
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
};

const emptyCandidate: WorkItemCandidateInput = {
  id: "wic-empty",
  title: "empty context candidate",
  kind: "memory",
  lane: "watch",
  status: "candidate",
  risk: "medium",
  reason: "memory hygiene",
};

function renderReadiness() {
  return render(
    <AssistantInboxContainer
      live={{
        evidenceDraft: liveDraft,
        workItemCandidates: [blockedCandidate, readyCandidate, emptyCandidate],
      }}
    />,
  );
}

describe("E10 — WorkItem Candidate readiness/confidence UI", () => {
  it("renders readiness chips on the candidate board", () => {
    renderReadiness();

    const ready = screen.getByTestId("wic-readiness-chip-wic-ready");
    expect(ready.getAttribute("data-readiness")).toBe("ready");
    expect(ready.getAttribute("data-confidence")).toBe("high");
    expect(ready.textContent).toContain("ready");

    const blocked = screen.getByTestId("wic-readiness-chip-wic-blocked");
    expect(blocked.getAttribute("data-readiness")).toBe("blocked");
    expect(blocked.getAttribute("data-confidence")).toBe("low");
    expect(blocked.textContent).toContain("blocked");
  });

  it("renders readiness section in the candidate detail drawer", () => {
    renderReadiness();

    fireEvent.click(screen.getByTestId("wic-row-wic-ready"));

    const section = screen.getByTestId("wic-readiness-section");
    expect(section.getAttribute("data-readiness")).toBe("ready");
    expect(section.getAttribute("data-confidence")).toBe("high");
    expect(screen.getByTestId("wic-readiness-state").textContent).toContain("ready");
    expect(screen.getByTestId("wic-readiness-state").textContent).toContain("high");
    expect(screen.getByTestId("wic-readiness-reasons").textContent).toContain("linked draft evidence present");
    expect(screen.getByTestId("wic-readiness-target").textContent).toContain("linked draft evidence");
  });

  it("shows missing refs and unknown confidence honestly", () => {
    renderReadiness();

    fireEvent.click(screen.getByTestId("wic-row-wic-empty"));

    expect(screen.getByTestId("wic-readiness-section").getAttribute("data-readiness")).toBe("needs-evidence");
    expect(screen.getByTestId("wic-readiness-section").getAttribute("data-confidence")).toBe("unknown");
    expect(screen.getByTestId("wic-readiness-missing-source").textContent).toContain("source refs unknown");
    expect(screen.getByTestId("wic-readiness-missing-evidence").textContent).toContain("evidence refs unknown");
  });

  it("shows blocked risk blockers in detail", () => {
    renderReadiness();

    fireEvent.click(screen.getByTestId("wic-row-wic-blocked"));

    expect(screen.getByTestId("wic-readiness-section").getAttribute("data-readiness")).toBe("blocked");
    expect(screen.getByTestId("wic-readiness-risk-blockers").textContent).toContain("high risk candidate");
    expect(screen.getByTestId("wic-readiness-risk-blockers").textContent).toContain("blocked candidate");
  });

  it("lets the next-step preview reference readiness without changing lifecycle", () => {
    renderReadiness();

    fireEvent.click(screen.getByTestId("wic-row-wic-ready"));

    expect(screen.getByTestId("wic-next-step-readiness").textContent).toContain("readiness · ready");
    expect(screen.getByTestId("wic-next-step-readiness").textContent).toContain("confidence · high");
    expect(screen.getByTestId("wic-next-step-preview").textContent).toContain("preview only");
    expect(screen.getByTestId("wic-next-step-preview").textContent).toContain("not committed");
  });

  it("keeps PREVIEW/LIVE separated for readiness context", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("wic-row-wic-patch-patch-002"));
    expect(screen.getByTestId("wic-readiness-section").textContent).toContain("source-001");

    cleanup();
    render(<AssistantInboxContainer live={{ workItemCandidates: [emptyCandidate] }} />);
    fireEvent.click(screen.getByTestId("wic-row-wic-empty"));
    expect(screen.getByTestId("wic-readiness-section").textContent).not.toContain("source-001");
  });

  it("stays read-only with no side-effect controls", () => {
    renderReadiness();
    const board = screen.getByTestId("work-item-candidates-card");
    assertNoSideEffectActionControls(board);
    assertNoForbiddenActionText(board);

    fireEvent.click(screen.getByTestId("wic-row-wic-ready"));
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
