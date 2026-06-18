// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryEvalReport } from "@ai-orchestrator/protocol";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { buildInboxPaletteCommands } from "../../lib/inboxPaletteCommands";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
} from "./inboxInvariant";
import type { PatchCandidateInput } from "../../lib/plugins/patchCandidateSource";
import type { RunnerSessionInput } from "../../lib/runnerTheater";

beforeEach(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
});

afterEach(() => cleanup());

const nowMs = Date.parse("2026-06-18T12:00:00.000Z");

const runnerSessions: RunnerSessionInput[] = [
  {
    id: "runner-stale",
    title: "stale runner signal",
    role: "Implementer",
    agent: "implementer",
    model: "route: policy",
    status: "running",
    heartbeat: "2026-06-18T11:00:00.000Z",
    lastOutput: "waiting",
    worktree: { branch: "agent/stale-runner" },
  },
];

const patchCandidates: PatchCandidateInput[] = [
  {
    candidateId: "patch-001",
    runnerId: "runner-alpha",
    missionId: "mission-alpha",
    changedFileCount: 2,
    additions: 12,
    deletions: 3,
    safetyStatus: "blocked",
    verificationStatus: "not_run",
    source: "runner",
    observed: true,
  },
];

function report(verdict: MemoryEvalReport["verdict"]): MemoryEvalReport {
  return {
    evalCaseId: "eval-1",
    k: 1,
    verdict,
    recallAtK: verdict === "pass" ? 1 : 0,
    expectedHitIds: [],
    missingExpectedIds: [],
    forbiddenHitIds: [],
    forbiddenHitRate: 0,
    staleHitIds: ["stale-1"],
    staleHitRate: 1,
    contradictedHitIds: [],
    supersededHitIds: [],
    unknownRetrievedIds: [],
    blockers: verdict === "fail" ? ["blocked"] : [],
    warnings: [],
  };
}

function liveInput() {
  return {
    nowMs,
    runnerSessions,
    patchCandidates,
    manifest: { evalReportsByRunId: { "eval-run": report("fail") } },
  };
}

describe("E19 — WorkItem Candidate signal navigation", () => {
  it("filters candidate board rows by runner, patch, memory, or any linked signal", () => {
    render(<AssistantInboxContainer live={liveInput()} />);

    fireEvent.click(screen.getByTestId("wic-filter-signal-runner"));
    expect(screen.getByTestId("wic-row-wic-runner-runner-stale")).toBeTruthy();
    expect(screen.queryByTestId("wic-row-wic-patch-patch-001")).toBeNull();
    expect(screen.queryByTestId("wic-row-wic-memory-eval-fail")).toBeNull();

    fireEvent.click(screen.getByTestId("wic-filter-signal-patch"));
    expect(screen.getByTestId("wic-row-wic-patch-patch-001")).toBeTruthy();
    expect(screen.queryByTestId("wic-row-wic-runner-runner-stale")).toBeNull();

    fireEvent.click(screen.getByTestId("wic-filter-signal-memory"));
    expect(screen.getByTestId("wic-row-wic-memory-eval-fail")).toBeTruthy();
    expect(screen.queryByTestId("wic-row-wic-patch-patch-001")).toBeNull();

    fireEvent.click(screen.getByTestId("wic-filter-signal-any"));
    expect(screen.getByTestId("wic-row-wic-runner-runner-stale")).toBeTruthy();
    expect(screen.getByTestId("wic-row-wic-patch-patch-001")).toBeTruthy();
    expect(screen.getByTestId("wic-row-wic-memory-eval-fail")).toBeTruthy();
  });

  it("focusSection signal commands jump locally and apply the requested signal filter", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(
      <AssistantInboxContainer
        live={liveInput()}
        command={{ kind: "focusSection", value: "work-item-candidate-signals-patch", nonce: 1 }}
      />,
    );

    expect(spy).toHaveBeenCalled();
    expect(screen.getByTestId("wic-ops-controls").getAttribute("data-signal-filter")).toBe("patch");
    expect(screen.getByTestId("wic-row-wic-patch-patch-001")).toBeTruthy();
    expect(screen.queryByTestId("wic-row-wic-runner-runner-stale")).toBeNull();
  });

  it("palette exposes signal jumps as local-view commands only", () => {
    const dispatch = vi.fn();
    const cmds = buildInboxPaletteCommands({ goInbox: vi.fn(), dispatch, applyView: vi.fn() });

    cmds.find((c) => c.id === "inbox.candidateSignals")?.run();
    expect(dispatch).toHaveBeenLastCalledWith("focusSection", "work-item-candidate-signals");
    cmds.find((c) => c.id === "inbox.runnerLinkedCandidates")?.run();
    expect(dispatch).toHaveBeenLastCalledWith("focusSection", "work-item-candidate-signals-runner");
    cmds.find((c) => c.id === "inbox.patchLinkedCandidates")?.run();
    expect(dispatch).toHaveBeenLastCalledWith("focusSection", "work-item-candidate-signals-patch");
    cmds.find((c) => c.id === "inbox.memoryLinkedCandidates")?.run();
    expect(dispatch).toHaveBeenLastCalledWith("focusSection", "work-item-candidate-signals-memory");
  });

  it("signal filters remain local-view only with no lifecycle/action controls", () => {
    render(<AssistantInboxContainer live={liveInput()} />);
    const card = screen.getByTestId("work-item-candidates-card");

    assertNoSideEffectActionControls(card);
    assertNoForbiddenActionText(card);
  });
});
