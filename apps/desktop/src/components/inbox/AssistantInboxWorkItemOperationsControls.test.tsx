// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
  collectActionControls,
} from "./inboxInvariant";
import type { EvidenceDraftInput } from "../../lib/evidenceDraft";
import type { WorkItemCandidateInput } from "../../lib/workItemCandidate";

beforeEach(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
});

afterEach(() => cleanup());

const draft: EvidenceDraftInput = {
  id: "draft-controls",
  title: "controls draft",
  sources: [{ id: "ev-ready", label: "ready evidence", observedAt: "2026-06-18T10:00:00.000Z" }],
  claims: [{ id: "claim-ready", text: "ready claim", refs: ["ev-ready"] }],
};

const candidates: WorkItemCandidateInput[] = [
  {
    id: "wic-blocked",
    title: "Blocked patch",
    kind: "patch",
    lane: "now",
    status: "blocked",
    risk: "high",
    sourceRefs: ["mission-alpha"],
    evidenceRefs: ["ev-risk"],
    createdAt: "2026-06-18T09:00:00.000Z",
    reason: "patch safety blocked",
  },
  {
    id: "wic-needs-evidence",
    title: "Needs evidence",
    kind: "source",
    lane: "now",
    status: "candidate",
    risk: "medium",
    sourceRefs: ["source-stale"],
    createdAt: "2026-06-18T11:00:00.000Z",
    reason: "source stale",
  },
  {
    id: "wic-zulu",
    title: "Zulu candidate",
    kind: "runner",
    lane: "soon",
    status: "candidate",
    risk: "medium",
    sourceRefs: ["runner-z"],
    evidenceRefs: ["ev-z"],
    createdAt: "2026-06-18T12:00:00.000Z",
    reason: "runner stale",
  },
  {
    id: "wic-alpha",
    title: "Alpha candidate",
    kind: "evidence",
    lane: "soon",
    status: "observed",
    risk: "low",
    sourceRefs: ["source-ready"],
    evidenceRefs: ["ev-ready"],
    observed: true,
    createdAt: "2026-06-18T10:00:00.000Z",
    reason: "evidence present",
  },
];

function renderControls() {
  return render(<AssistantInboxContainer live={{ evidenceDraft: draft, workItemCandidates: candidates }} />);
}

function rowIds(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('[data-testid^="wic-row-"]')).map((el) =>
    el.getAttribute("data-testid")!.replace("wic-row-", ""),
  );
}

describe("E11 PR3 — WorkItem Candidate operations controls", () => {
  it("filters by local quick scope without changing the underlying summary", () => {
    renderControls();

    fireEvent.click(screen.getByTestId("wic-ops-scope-attention"));
    expect(screen.getByTestId("work-item-candidates-card").getAttribute("data-visible")).toBe("2");
    expect(screen.getByTestId("wic-row-wic-blocked")).toBeTruthy();
    expect(screen.getByTestId("wic-row-wic-needs-evidence")).toBeTruthy();
    expect(screen.queryByTestId("wic-row-wic-alpha")).toBeNull();
    expect(screen.getByTestId("wic-summary-total").getAttribute("data-count")).toBe("4");

    fireEvent.click(screen.getByTestId("wic-ops-scope-ready"));
    expect(screen.getByTestId("work-item-candidates-card").getAttribute("data-visible")).toBe("1");
    expect(screen.getByTestId("wic-row-wic-alpha")).toBeTruthy();

    fireEvent.click(screen.getByTestId("wic-ops-scope-linked"));
    expect(screen.getByTestId("work-item-candidates-card").getAttribute("data-visible")).toBe("1");
    expect(screen.getByTestId("wic-row-wic-alpha")).toBeTruthy();
  });

  it("groups locally by readiness and risk", () => {
    renderControls();

    fireEvent.click(screen.getByTestId("wic-ops-groupby-readiness"));
    expect(screen.getByTestId("work-item-candidates-card").getAttribute("data-group-mode")).toBe(
      "readiness",
    );
    expect(screen.getByTestId("wic-ops-dynamic-group-blocked").textContent).toContain("Blocked patch");
    expect(screen.getByTestId("wic-ops-dynamic-group-ready").textContent).toContain("Alpha candidate");

    fireEvent.click(screen.getByTestId("wic-ops-groupby-risk"));
    expect(screen.getByTestId("work-item-candidates-card").getAttribute("data-group-mode")).toBe("risk");
    expect(screen.getByTestId("wic-ops-dynamic-group-risk-high").textContent).toContain("Blocked patch");
    expect(screen.getByTestId("wic-ops-dynamic-group-risk-low").textContent).toContain("Alpha candidate");
  });

  it("sorts visible candidates locally by title", () => {
    renderControls();

    fireEvent.click(screen.getByTestId("wic-filter-lane-soon"));
    expect(rowIds(screen.getByTestId("wic-ops-group-soon"))).toEqual(["wic-zulu", "wic-alpha"]);

    fireEvent.click(screen.getByTestId("wic-ops-sort-title"));
    expect(screen.getByTestId("work-item-candidates-card").getAttribute("data-sort-mode")).toBe("title");
    expect(rowIds(screen.getByTestId("wic-ops-group-soon"))).toEqual(["wic-alpha", "wic-zulu"]);
  });

  it("adds a local-view keyboard jump to WorkItem Candidates", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    renderControls();

    fireEvent.keyDown(screen.getByTestId("assistant-inbox"), { key: "w" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("inbox-shortcuts-hint").textContent).toContain("후보");
  });

  it("keeps operations controls local-view only with no side-effect controls", () => {
    renderControls();
    const card = screen.getByTestId("work-item-candidates-card");

    assertNoSideEffectActionControls(card);
    assertNoForbiddenActionText(card);
    expect(within(card).getByTestId("wic-ops-controls")).toBeTruthy();
    for (const control of collectActionControls(card)) {
      expect(["local-view", "local-detail"]).toContain(control.getAttribute("data-action-scope"));
    }
    expect((card.textContent ?? "").toLowerCase()).not.toMatch(
      /create workitem|create work item|committed workitem|launch|eventstorage|server write|runner dispatch|patch apply/,
    );
  });
});
