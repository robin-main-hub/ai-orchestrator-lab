// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { buildInboxPaletteCommands } from "../../lib/inboxPaletteCommands";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
  collectActionControls,
} from "./inboxInvariant";
import type { WorkItemCandidateInput } from "../../lib/workItemCandidate";

beforeEach(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
});

afterEach(() => cleanup());

const candidates: WorkItemCandidateInput[] = [
  {
    id: "wic-now-patch",
    title: "blocked patch candidate",
    kind: "patch",
    lane: "now",
    status: "blocked",
    risk: "high",
    sourceRefs: ["mission-alpha"],
    evidenceRefs: ["ev-alpha"],
    observed: true,
    reason: "patch safety blocked",
  },
  {
    id: "wic-soon-runner",
    title: "runner heartbeat followup",
    kind: "runner",
    lane: "soon",
    status: "candidate",
    risk: "medium",
    evidenceRefs: ["ev-runner"],
    observed: true,
    reason: "runner heartbeat stale",
  },
  {
    id: "wic-watch-memory",
    title: "memory hygiene review",
    kind: "memory",
    lane: "watch",
    status: "candidate",
    risk: "low",
    sourceRefs: ["memory-console"],
    observed: false,
    reason: "memory eval hygiene",
  },
];

function renderBoard() {
  return render(<AssistantInboxContainer live={{ workItemCandidates: candidates }} />);
}

describe("E7 — WorkItem Candidate Board / Triage View", () => {
  it("renders summary counts by lane, risk, kind, and ref presence", () => {
    renderBoard();

    expect(screen.getByTestId("wic-summary-total").getAttribute("data-count")).toBe("3");
    expect(screen.getByTestId("wic-summary-lane-now").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-summary-lane-soon").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-summary-lane-watch").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-summary-risk-high").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-summary-risk-medium").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-summary-risk-low").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-summary-kind-patch").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-summary-kind-runner").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-summary-kind-memory").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-summary-sourceRefs").getAttribute("data-count")).toBe("2");
    expect(screen.getByTestId("wic-summary-evidenceRefs").getAttribute("data-count")).toBe("2");
  });

  it("filters locally by lane, risk, and kind", () => {
    renderBoard();

    fireEvent.click(screen.getByTestId("wic-filter-lane-now"));
    expect(screen.getByTestId("wic-row-wic-now-patch")).toBeTruthy();
    expect(screen.queryByTestId("wic-row-wic-soon-runner")).toBeNull();

    fireEvent.click(screen.getByTestId("wic-filter-lane-all"));
    fireEvent.click(screen.getByTestId("wic-filter-risk-medium"));
    expect(screen.getByTestId("wic-row-wic-soon-runner")).toBeTruthy();
    expect(screen.queryByTestId("wic-row-wic-now-patch")).toBeNull();

    fireEvent.click(screen.getByTestId("wic-filter-risk-all"));
    fireEvent.click(screen.getByTestId("wic-filter-kind-memory"));
    expect(screen.getByTestId("wic-row-wic-watch-memory")).toBeTruthy();
    expect(screen.queryByTestId("wic-row-wic-soon-runner")).toBeNull();
  });

  it("filters locally by source/evidence ref presence and search text", () => {
    renderBoard();

    fireEvent.click(screen.getByTestId("wic-filter-sourceRefs"));
    expect(screen.getByTestId("wic-row-wic-now-patch")).toBeTruthy();
    expect(screen.getByTestId("wic-row-wic-watch-memory")).toBeTruthy();
    expect(screen.queryByTestId("wic-row-wic-soon-runner")).toBeNull();

    fireEvent.click(screen.getByTestId("wic-filter-sourceRefs-all"));
    fireEvent.click(screen.getByTestId("wic-filter-evidenceRefs"));
    expect(screen.getByTestId("wic-row-wic-now-patch")).toBeTruthy();
    expect(screen.getByTestId("wic-row-wic-soon-runner")).toBeTruthy();
    expect(screen.queryByTestId("wic-row-wic-watch-memory")).toBeNull();

    fireEvent.click(screen.getByTestId("wic-filter-evidenceRefs-all"));
    fireEvent.change(screen.getByTestId("wic-search"), { target: { value: "heartbeat" } });
    expect(screen.getByTestId("wic-row-wic-soon-runner")).toBeTruthy();
    expect(screen.queryByTestId("wic-row-wic-now-patch")).toBeNull();
  });

  it("command palette and deck jump to WorkItem Candidates as local-view only", () => {
    const dispatch = vi.fn();
    const cmds = buildInboxPaletteCommands({ goInbox: vi.fn(), dispatch, applyView: vi.fn() });
    const entry = cmds.find((c) => c.id === "inbox.workItemCandidates")!;
    expect(entry.label).toBe("WorkItem Candidates 열기");
    expect(entry.hint).toBe("작업 후보 보기 · 확정 없음");
    entry.run();
    expect(dispatch).toHaveBeenCalledWith("focusSection", "work-item-candidates");

    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    renderBoard();
    const deckButton = screen.getByTestId("command-deck-work-item-candidates");
    expect(deckButton.getAttribute("data-action-scope")).toBe("local-view");
    fireEvent.click(deckButton);
    expect(spy).toHaveBeenCalled();
  });

  it("keeps E6 detail drawer working from filtered rows", () => {
    renderBoard();

    fireEvent.click(screen.getByTestId("wic-filter-kind-runner"));
    fireEvent.click(screen.getByTestId("wic-row-wic-soon-runner"));

    expect(screen.getByTestId("work-item-candidate-detail-drawer")).toBeTruthy();
    expect(screen.getByTestId("wic-detail-field-id").textContent).toContain("wic-soon-runner");
  });

  it("stays candidate-only with local-view/local-detail controls only", () => {
    renderBoard();
    const card = screen.getByTestId("work-item-candidates-card");

    assertNoSideEffectActionControls(card);
    assertNoForbiddenActionText(card);
    for (const control of collectActionControls(card)) {
      expect(["local-view", "local-detail"]).toContain(control.getAttribute("data-action-scope"));
    }
    expect((card.textContent ?? "").toLowerCase()).not.toMatch(
      /create workitem|create work item|committed workitem|launch|eventstorage|server write|runner dispatch|patch apply/,
    );
  });
});
