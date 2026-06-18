// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
} from "./inboxInvariant";
import type { WorkItemCandidateInput } from "../../lib/workItemCandidate";
import type { RunnerSessionInput } from "../../lib/runnerTheater";

beforeEach(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
});

afterEach(() => cleanup());

const nowMs = Date.parse("2026-06-18T12:00:00.000Z");

const runnerSessions: RunnerSessionInput[] = [
  {
    id: "ms-stale",
    title: "stale runner candidate",
    role: "Implementer",
    agent: "implementer",
    model: "route: policy",
    status: "running",
    heartbeat: "2026-06-18T11:10:00.000Z",
    lastOutput: "waiting on heartbeat",
    events: [{ id: "evt-1", at: "2026-06-18T11:05:00.000Z", text: "started" }],
    artifacts: ["changes.diff"],
    worktree: { branch: "agent/stale-branch" },
  },
];

const workItemCandidates: WorkItemCandidateInput[] = [
  {
    id: "wic-runner-ms-stale",
    title: "stale runner candidate",
    kind: "runner",
    lane: "now",
    status: "observed",
    risk: "high",
    sourceRefs: ["agent/stale-branch"],
    observed: true,
    reason: "runner running · heartbeat stale",
  },
];

function renderRunnerSignals() {
  return render(<AssistantInboxContainer live={{ nowMs, runnerSessions, workItemCandidates }} />);
}

describe("E16 — WorkItem Candidate runner signal UI", () => {
  it("renders runner signal chips on candidate rows and Runner Theater counts", () => {
    renderRunnerSignals();

    expect(screen.getByTestId("wic-runner-signal-chip-wic-runner-ms-stale").textContent).toContain(
      "runner-stalled",
    );
    const runnerRow = screen.getByTestId("runner-theater-row-ms-stale");
    expect(within(runnerRow).getByTestId("runner-candidate-count-ms-stale").textContent).toContain(
      "1 candidate",
    );
  });

  it("shows runner signals in the candidate detail drawer as read-only", () => {
    renderRunnerSignals();

    fireEvent.click(screen.getByTestId("wic-row-wic-runner-ms-stale"));
    const drawer = screen.getByTestId("work-item-candidate-detail-drawer");
    const section = within(drawer).getByTestId("wic-runner-signals-section");

    expect(section.textContent).toContain("Runner Signals");
    expect(section.textContent).toContain("ms-stale");
    expect(section.textContent).toContain("active");
    expect(section.textContent).toContain("stale");
    assertNoSideEffectActionControls(section);
    assertNoForbiddenActionText(section);
  });
});
