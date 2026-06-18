// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WorkItemCandidateDetailDrawer } from "./WorkItemCandidateDetailDrawer";
import type { WorkItemCandidate } from "../../lib/workItemCandidate";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
  collectActionControls,
} from "./inboxInvariant";

afterEach(() => cleanup());

const candidate: WorkItemCandidate = {
  id: "wic-drawer-module",
  title: "drawer module candidate",
  kind: "source",
  lane: "soon",
  status: "candidate",
  risk: "medium",
  reason: "drawer extraction smoke",
  sourceRefs: ["source-ref"],
  evidenceRefs: ["evidence-ref"],
  observed: true,
  createdAt: "2026-06-18T12:00:00.000Z",
  note: "work item candidate · read-only · not committed work",
};

describe("WorkItemCandidateDetailDrawer component", () => {
  it("renders the extracted drawer as local-detail only and keeps trace/readiness sections available", () => {
    const onClose = vi.fn();

    render(<WorkItemCandidateDetailDrawer item={candidate} onClose={onClose} />);

    const drawer = screen.getByTestId("work-item-candidate-detail-drawer");
    expect(drawer.getAttribute("data-kind")).toBe("source");
    expect(screen.getByTestId("wic-detail-field-id").textContent).toContain("wic-drawer-module");

    fireEvent.click(screen.getByTestId("wic-detail-tab-readiness"));
    expect(screen.getByTestId("wic-readiness-section").textContent).toContain("readiness");
    fireEvent.click(screen.getByTestId("wic-detail-tab-trace"));
    expect(screen.getByTestId("wic-trace-timeline").textContent).toContain("Trace timeline");

    assertNoSideEffectActionControls(drawer);
    assertNoForbiddenActionText(drawer);
    for (const control of collectActionControls(drawer)) {
      expect(control.getAttribute("data-action-scope")).toBe("local-detail");
    }

    fireEvent.click(screen.getByTestId("wic-detail-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
