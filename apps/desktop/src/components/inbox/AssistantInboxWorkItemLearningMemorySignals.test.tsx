// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { MemoryEvalReport } from "@ai-orchestrator/protocol";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
} from "./inboxInvariant";

afterEach(() => cleanup());

function report(
  verdict: MemoryEvalReport["verdict"],
  over: Partial<MemoryEvalReport> = {},
): MemoryEvalReport {
  return {
    evalCaseId: "eval-1",
    k: 1,
    verdict,
    recallAtK: verdict === "pass" ? 1 : 0,
    expectedHitIds: [],
    missingExpectedIds: [],
    forbiddenHitIds: [],
    forbiddenHitRate: 0,
    staleHitIds: [],
    staleHitRate: 0,
    contradictedHitIds: [],
    supersededHitIds: [],
    unknownRetrievedIds: [],
    blockers: verdict === "fail" ? ["blocked"] : [],
    warnings: [],
    ...over,
  } as MemoryEvalReport;
}

function renderLearningMemorySignals() {
  return render(
    <AssistantInboxContainer
      live={{
        projectRecords: [{ missionId: "mission-memory", title: "memory context candidate" }],
        manifest: {
          evalReportsByRunId: {
            "run-1": report("fail", {
              staleHitIds: ["stale-1"],
              contradictedHitIds: ["contradicted-1"],
            }),
          },
        },
      }}
    />,
  );
}

describe("E18 — WorkItem Candidate learning/memory signal UI", () => {
  it("renders learning/memory chips on candidate rows and console counts", () => {
    renderLearningMemorySignals();

    expect(
      screen.getByTestId("wic-learning-memory-signal-chip-wic-memory-eval-fail").textContent,
    ).toContain("memory-warning");
    expect(screen.getByTestId("lm-workitem-count").textContent).toContain("2 candidates");
  });

  it("shows learning/memory signals in the candidate detail drawer as read-only", () => {
    renderLearningMemorySignals();

    fireEvent.click(screen.getByTestId("wic-row-wic-memory-eval-fail"));
    const drawer = screen.getByTestId("work-item-candidate-detail-drawer");
    const section = within(drawer).getByTestId("wic-learning-memory-signals-section");

    expect(section.textContent).toContain("Learning/Memory Signals");
    expect(section.textContent).toContain("memory-warning");
    expect(section.textContent).toContain("stale-memory");
    expect(section.textContent).toContain("contradicted-memory");
    expect(section.textContent).toContain("eval reports");
    assertNoSideEffectActionControls(section);
    assertNoForbiddenActionText(section);
  });
});
