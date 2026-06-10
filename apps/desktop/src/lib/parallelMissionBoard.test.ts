import { describe, expect, it } from "vitest";
import type { AutonomyStepRow } from "./autonomyTimeline";
import type { MissionResult } from "./parallelMissions";
import {
  applyMissionResults,
  applyMissionStep,
  applyMissionUpdate,
  areDraftsRunnable,
  buildMissionSpecs,
  createParallelBoard,
  isDraftRunnable,
  summarizeBoard,
  type ParallelMissionDraft,
} from "./parallelMissionBoard";

const draft = (over: Partial<ParallelMissionDraft> = {}): ParallelMissionDraft => ({
  id: over.id ?? "m1",
  personaName: over.personaName ?? "kurumi",
  role: over.role ?? "code",
  goal: over.goal ?? "build widget",
  verificationStepsText: over.verificationStepsText ?? "pnpm test",
  kickoffTask: over.kickoffTask,
});

const row = (step: number): AutonomyStepRow => ({
  step,
  outcome: "progressing",
  action: "dispatch_next",
  reason: "next",
});

describe("draft validation", () => {
  it("requires persona, goal, and at least one verification step", () => {
    expect(isDraftRunnable(draft()).ok).toBe(true);
    expect(isDraftRunnable(draft({ personaName: "  " })).ok).toBe(false);
    expect(isDraftRunnable(draft({ goal: "" })).ok).toBe(false);
    expect(isDraftRunnable(draft({ verificationStepsText: "\n  \n" })).ok).toBe(false);
  });

  it("areDraftsRunnable fails on empty list and surfaces the offending draft", () => {
    expect(areDraftsRunnable([]).ok).toBe(false);
    const verdict = areDraftsRunnable([draft(), draft({ id: "m2", personaName: "yuno", goal: "" })]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("yuno");
  });
});

describe("buildMissionSpecs", () => {
  it("maps drafts to specs with per-mission session ids and parsed plans", () => {
    const specs = buildMissionSpecs([draft({ verificationStepsText: "a\nb\n\nc" })], { sessionId: "sess" });
    expect(specs[0]!.summon.sessionId).toBe("sess_m1");
    expect(specs[0]!.packet.verificationPlan).toEqual(["a", "b", "c"]);
    expect(specs[0]!.persona.personaName).toBe("kurumi");
  });
});

describe("board reducer", () => {
  it("streams queued -> running -> step feed -> done and folds results", () => {
    let board = createParallelBoard([draft({ id: "m1" }), draft({ id: "m2", personaName: "yuno" })]);
    expect(board.cards.map((c) => c.status)).toEqual(["queued", "queued"]);

    board = applyMissionUpdate(board, { missionId: "m1", phase: "running" });
    board = applyMissionStep(board, "m1", row(1));
    board = applyMissionStep(board, "m1", row(2));
    board = applyMissionUpdate(board, { missionId: "m1", phase: "done", loopStatus: "completed" });

    const m1 = board.cards.find((c) => c.id === "m1")!;
    expect(m1.status).toBe("done");
    expect(m1.loopStatus).toBe("completed");
    expect(m1.steps).toHaveLength(2);

    const results: MissionResult[] = [
      { missionId: "m1", ok: true, loopStatus: "completed", session: { paneId: "%1" } as any },
      { missionId: "m2", ok: false, reason: "no_free_pane" },
    ];
    board = applyMissionResults(board, results);
    expect(board.cards.find((c) => c.id === "m1")!.paneId).toBe("%1");
    const m2 = board.cards.find((c) => c.id === "m2")!;
    expect(m2.status).toBe("rejected");
    expect(m2.rejection).toBe("no_free_pane");
  });

  it("summarizes terminal states", () => {
    let board = createParallelBoard([draft({ id: "a" }), draft({ id: "b" }), draft({ id: "c" })]);
    board = applyMissionResults(board, [
      { missionId: "a", ok: true, loopStatus: "completed", session: { paneId: "%1" } as any },
      { missionId: "b", ok: true, loopStatus: "failed", session: { paneId: "%2" } as any },
      { missionId: "c", ok: false, reason: "no_free_pane" },
    ]);
    expect(summarizeBoard(board)).toMatchObject({ total: 3, completed: 1, failed: 1, rejected: 1 });
  });
});
