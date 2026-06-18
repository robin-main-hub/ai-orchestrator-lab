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

const draft: EvidenceDraftInput = {
  id: "draft-trace",
  title: "trace draft",
  sources: [
    { id: "ev-trace", label: "trace evidence", observedAt: "2026-06-18T10:00:00.000Z" },
  ],
  claims: [{ id: "claim-trace", text: "trace claim", refs: ["ev-trace"] }],
};

const tracedCandidate: WorkItemCandidateInput = {
  id: "wic-trace-ui",
  title: "trace ui candidate",
  kind: "patch",
  lane: "now",
  status: "blocked",
  risk: "high",
  reason: "patch safety blocked",
  sourceRefs: ["mission-alpha"],
  evidenceRefs: ["ev-trace"],
  createdAt: "2026-06-18T12:00:00.000Z",
};

const emptyCandidate: WorkItemCandidateInput = {
  id: "wic-trace-empty-ui",
  title: "empty trace ui candidate",
  kind: "memory",
  lane: "watch",
  status: "candidate",
  risk: "low",
  reason: "memory hygiene",
};

function openTrace(id: string) {
  fireEvent.click(screen.getByTestId(`wic-row-${id}`));
  fireEvent.click(screen.getByTestId("wic-detail-tab-trace"));
}

describe("E12 — WorkItem Candidate trace timeline UI", () => {
  it("renders a local-detail trace timeline with refs, draft links, readiness, and next-step context", () => {
    render(<AssistantInboxContainer live={{ evidenceDraft: draft, workItemCandidates: [tracedCandidate], nowMs: NOW }} />);

    openTrace("wic-trace-ui");

    const timeline = screen.getByTestId("wic-trace-timeline");
    expect(timeline.getAttribute("data-empty")).toBe("false");
    expect(timeline.textContent).toContain("Trace timeline");
    expect(timeline.textContent).toContain("patch signal");
    expect(timeline.textContent).toContain("mission-alpha");
    expect(timeline.textContent).toContain("ev-trace");
    expect(timeline.textContent).toContain("claim-trace");
    expect(timeline.textContent).toContain("readiness");
    expect(timeline.textContent).toContain("next-step");
    expect(timeline.textContent).toContain("ref only");
  });

  it("shows missing timestamps and unresolved refs honestly", () => {
    render(<AssistantInboxContainer live={{ evidenceDraft: draft, workItemCandidates: [tracedCandidate], nowMs: NOW }} />);

    openTrace("wic-trace-ui");

    expect(screen.getAllByText("time unknown").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ref only · unresolved").length).toBeGreaterThan(0);
  });

  it("shows an honest empty trace state when candidate refs are absent", () => {
    render(<AssistantInboxContainer live={{ workItemCandidates: [emptyCandidate], nowMs: NOW }} />);

    openTrace("wic-trace-empty-ui");

    const timeline = screen.getByTestId("wic-trace-timeline");
    expect(timeline.getAttribute("data-empty")).toBe("true");
    expect(screen.getByTestId("wic-trace-empty").textContent).toContain("source refs unknown");
    expect(screen.getByTestId("wic-trace-empty").textContent).toContain("evidence refs unknown");
  });

  it("keeps PREVIEW/LIVE separated for trace context", () => {
    render(<AssistantInboxContainer />);
    openTrace("wic-patch-patch-002");
    expect(screen.getByTestId("wic-trace-timeline").textContent).toContain("source-001");

    cleanup();
    render(<AssistantInboxContainer live={{ workItemCandidates: [emptyCandidate], nowMs: NOW }} />);
    openTrace("wic-trace-empty-ui");
    expect(screen.getByTestId("wic-trace-timeline").textContent).not.toContain("source-001");
  });

  it("keeps trace timeline local-detail only with no side-effect controls", () => {
    render(<AssistantInboxContainer live={{ evidenceDraft: draft, workItemCandidates: [tracedCandidate], nowMs: NOW }} />);

    openTrace("wic-trace-ui");
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
