// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
  collectActionControls,
} from "./inboxInvariant";
import type { WorkItemCandidateInput } from "../../lib/workItemCandidate";

afterEach(() => cleanup());

const detailedCandidate: WorkItemCandidateInput = {
  id: "wic-detail-1",
  title: "inspect candidate",
  kind: "source",
  lane: "soon",
  status: "candidate",
  risk: "medium",
  reason: "source health stale",
  sourceRefs: ["source-alpha"],
  evidenceRefs: ["ev-1", "ev-2"],
  observed: true,
  createdAt: "2026-06-18T12:00:00.000Z",
};

const missingRefsCandidate: WorkItemCandidateInput = {
  id: "wic-empty-refs",
  title: "candidate without refs",
  kind: "memory",
  lane: "watch",
  status: "candidate",
  risk: "low",
  reason: "memory eval needs attention",
};

describe("E6 — WorkItem Candidate detail / link graph", () => {
  it("opens a read-only local detail drawer from a candidate row and shows ref-only links", () => {
    render(<AssistantInboxContainer live={{ workItemCandidates: [detailedCandidate] }} />);

    const row = screen.getByTestId("wic-row-wic-detail-1");
    expect(row.getAttribute("role")).toBe("button");
    expect(row.getAttribute("data-action-scope")).toBe("local-detail");

    fireEvent.click(row);

    const drawer = screen.getByTestId("work-item-candidate-detail-drawer");
    expect(drawer.getAttribute("data-kind")).toBe("source");
    expect(screen.getByTestId("wic-detail-field-id").textContent).toContain("wic-detail-1");
    expect(screen.getByTestId("wic-detail-field-title").textContent).toContain("inspect candidate");
    expect(screen.getByTestId("wic-detail-field-kind").textContent).toContain("source");
    expect(screen.getByTestId("wic-detail-field-lane").textContent).toContain("soon");
    expect(screen.getByTestId("wic-detail-field-status").textContent).toContain("candidate");
    expect(screen.getByTestId("wic-detail-field-risk").textContent).toContain("medium");
    expect(screen.getByTestId("wic-detail-field-reason").textContent).toContain("source health stale");
    expect(screen.getByTestId("wic-detail-field-observed").textContent).toContain("true");
    expect(screen.getByTestId("wic-detail-field-createdAt").textContent).toContain(
      "2026-06-18T12:00:00.000Z",
    );

    expect(screen.getByTestId("wic-link-graph")).toBeTruthy();
    expect(screen.getByTestId("wic-link-node-candidate").textContent).toContain("inspect candidate");
    expect(screen.getByTestId("wic-link-source-0").textContent).toContain("source-alpha");
    expect(screen.getByTestId("wic-link-source-0").textContent).toContain("unresolved ref");
    expect(screen.getByTestId("wic-link-evidence-1").textContent).toContain("ev-2");
    expect(screen.getByTestId("wic-link-evidence-1").textContent).toContain("unresolved ref");
    expect(screen.getByTestId("wic-link-reason").textContent).toContain("source health stale");
  });

  it("opens via keyboard activation and closes locally", () => {
    render(<AssistantInboxContainer live={{ workItemCandidates: [detailedCandidate] }} />);

    fireEvent.keyDown(screen.getByTestId("wic-row-wic-detail-1"), { key: "Enter" });
    expect(screen.getByTestId("work-item-candidate-detail-drawer")).toBeTruthy();

    fireEvent.click(screen.getByTestId("wic-detail-close"));
    expect(screen.queryByTestId("work-item-candidate-detail-drawer")).toBeNull();

    fireEvent.keyDown(screen.getByTestId("wic-row-wic-detail-1"), { key: " " });
    expect(screen.getByTestId("work-item-candidate-detail-drawer")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("work-item-candidate-detail-drawer")).toBeNull();
  });

  it("shows honest empty states when source/evidence refs and createdAt are missing", () => {
    render(<AssistantInboxContainer live={{ workItemCandidates: [missingRefsCandidate] }} />);

    fireEvent.click(screen.getByTestId("wic-row-wic-empty-refs"));

    expect(screen.getByTestId("wic-detail-field-createdAt").textContent).toContain("unknown");
    expect(screen.getByTestId("wic-detail-field-sourceRefs").textContent).toContain("none / unknown");
    expect(screen.getByTestId("wic-detail-field-evidenceRefs").textContent).toContain("none / unknown");
    expect(screen.getByTestId("wic-link-source-empty").textContent).toContain("none / unknown");
    expect(screen.getByTestId("wic-link-evidence-empty").textContent).toContain("none / unknown");
  });

  it("keeps the drawer local-detail scoped with no side-effect controls or labels", () => {
    render(<AssistantInboxContainer live={{ workItemCandidates: [detailedCandidate] }} />);

    fireEvent.click(screen.getByTestId("wic-row-wic-detail-1"));
    const drawer = screen.getByTestId("work-item-candidate-detail-drawer");

    assertNoSideEffectActionControls(drawer);
    assertNoForbiddenActionText(drawer);
    const controls = collectActionControls(drawer);
    expect(controls.length).toBeGreaterThanOrEqual(1);
    for (const control of controls) {
      expect(control.getAttribute("data-action-scope")).toBe("local-detail");
    }
    expect((drawer.textContent ?? "").toLowerCase()).not.toMatch(
      /create work item|launch|eventstorage|server write|runner dispatch|patch apply/,
    );
  });
});
