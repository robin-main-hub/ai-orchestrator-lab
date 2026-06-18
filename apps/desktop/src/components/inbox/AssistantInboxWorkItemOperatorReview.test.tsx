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
    id: "wic-review-ready",
    title: "ready candidate",
    kind: "evidence",
    lane: "watch",
    status: "observed",
    risk: "low",
    sourceRefs: ["source-ready"],
    evidenceRefs: ["ev-ready"],
    observed: true,
    createdAt: "2026-06-18T12:00:00.000Z",
    reason: "evidence present",
  },
  {
    id: "wic-review-missing",
    title: "missing evidence candidate",
    kind: "source",
    lane: "soon",
    status: "candidate",
    risk: "medium",
    sourceRefs: ["source-missing"],
    reason: "source stale",
  },
  {
    id: "wic-review-blocked",
    title: "blocked candidate",
    kind: "patch",
    lane: "now",
    status: "blocked",
    risk: "high",
    sourceRefs: ["mission-alpha"],
    evidenceRefs: ["ev-risk"],
    reason: "patch safety blocked",
  },
];

function renderReview() {
  return render(<AssistantInboxContainer live={{ workItemCandidates: candidates }} />);
}

describe("E15 — WorkItem Candidate Operator Review Surface", () => {
  it("renders review counts and stays read-only", () => {
    renderReview();

    const panel = screen.getByTestId("wic-operator-review");
    expect(panel.getAttribute("data-total")).toBe("3");
    expect(screen.getByTestId("wic-review-count-ready").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-review-count-needs-evidence").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-review-count-blocked").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-review-count-missing-refs").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("wic-review-count-stale-unknown-trace").getAttribute("data-count")).toBe("2");
    assertNoSideEffectActionControls(panel);
    assertNoForbiddenActionText(panel);
  });

  it("filters candidate rows through local review controls", () => {
    renderReview();

    fireEvent.click(screen.getByTestId("wic-review-filter-ready"));
    expect(screen.getByTestId("work-item-candidates-card").getAttribute("data-review-filter")).toBe("ready");
    expect(screen.getByTestId("wic-row-wic-review-ready")).toBeTruthy();
    expect(screen.queryByTestId("wic-row-wic-review-missing")).toBeNull();

    fireEvent.click(screen.getByTestId("wic-review-filter-missing-refs"));
    expect(screen.getByTestId("wic-row-wic-review-missing")).toBeTruthy();
    expect(screen.queryByTestId("wic-row-wic-review-ready")).toBeNull();
  });

  it("adds local-view palette and command deck jumps for candidate review", () => {
    const dispatch = vi.fn();
    const cmds = buildInboxPaletteCommands({ goInbox: vi.fn(), dispatch, applyView: vi.fn() });

    expect(cmds.find((c) => c.id === "inbox.candidateReview")?.label).toBe("Candidate Review 열기");
    cmds.find((c) => c.id === "inbox.candidateReviewReady")?.run();
    expect(dispatch).toHaveBeenCalledWith("focusSection", "work-item-candidate-review-ready");
    cmds.find((c) => c.id === "inbox.candidateReviewMissingEvidence")?.run();
    expect(dispatch).toHaveBeenCalledWith("focusSection", "work-item-candidate-review-needs-evidence");
    cmds.find((c) => c.id === "inbox.candidateReviewBlocked")?.run();
    expect(dispatch).toHaveBeenCalledWith("focusSection", "work-item-candidate-review-blocked");

    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    renderReview();
    const button = screen.getByTestId("command-deck-candidate-review");
    expect(button.getAttribute("data-action-scope")).toBe("local-view");
    fireEvent.click(button);
    expect(spy).toHaveBeenCalled();
  });

  it("applies command-driven review filters as local-view only", () => {
    render(
      <AssistantInboxContainer
        live={{ workItemCandidates: candidates }}
        command={{ kind: "focusSection", value: "work-item-candidate-review-ready", nonce: 1 }}
      />,
    );

    expect(screen.getByTestId("work-item-candidates-card").getAttribute("data-review-filter")).toBe("ready");
    expect(screen.getByTestId("wic-row-wic-review-ready")).toBeTruthy();
    expect(screen.queryByTestId("wic-row-wic-review-blocked")).toBeNull();

    const panel = screen.getByTestId("wic-operator-review");
    for (const control of collectActionControls(panel)) {
      expect(control.getAttribute("data-action-scope")).toBe("local-view");
    }
  });
});
