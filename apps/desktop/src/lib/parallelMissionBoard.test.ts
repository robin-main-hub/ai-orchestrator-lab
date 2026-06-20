import { describe, expect, it } from "vitest";
import type { AutonomyStepRow } from "./autonomyTimeline";
import type { MissionResult } from "./parallelMissions";
import {
  applyMissionBranch,
  applyMissionResults,
  applyMissionStep,
  applyMissionUpdate,
  areDraftsRunnable,
  buildMissionSpecs,
  createParallelBoard,
  emptyDraft,
  isDraftRunnable,
  nextDraftId,
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

  it("tags a card with its worktree branch", () => {
    let board = createParallelBoard([draft({ id: "m1" })]);
    board = applyMissionBranch(board, "m1", "agent/par_1_m1");
    expect(board.cards[0]!.branch).toBe("agent/par_1_m1");
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

// Characterization tests (no behavior change) for the two previously-unasserted draft
// factory exports nextDraftId and emptyDraft. The blocks above drive every board reducer
// and the spec assembly with hand-written draft ids, but never the id minter the console
// actually uses when the user clicks "add mission". Load-bearing:
//   - nextDraftId is the codebase's deterministic-ish unique id source (the doc comment
//     pins "no Date.now/Math.random"): it is a monotonic counter, so every call yields a
//     distinct "<prefix><n>" string with a strictly increasing numeric suffix — two
//     missions can never collide onto one card id. The counter is module-level shared
//     state, so the tests assert *relative* uniqueness/monotonicity, never absolute values.
//   - emptyDraft seeds a blank row: a fresh unique id, the default "code" role (or an
//     override), empty persona/goal/verification and no kickoff — and therefore is NOT yet
//     runnable (isDraftRunnable false), which is what keeps the run button gated until the
//     user fills it in.
describe("nextDraftId", () => {
  it("mints '<prefix><n>' ids with a strictly increasing suffix (default prefix 'm')", () => {
    const a = nextDraftId();
    const b = nextDraftId();
    expect(a).toMatch(/^m\d+$/);
    expect(b).toMatch(/^m\d+$/);
    expect(Number(b.slice(1))).toBe(Number(a.slice(1)) + 1);
  });

  it("honors a custom prefix while sharing the one monotonic counter", () => {
    const x = nextDraftId("par_");
    const y = nextDraftId("par_");
    expect(x).toMatch(/^par_\d+$/);
    expect(Number(y.slice(4))).toBeGreaterThan(Number(x.slice(4)));
  });

  it("never collides across a burst of calls", () => {
    const ids = Array.from({ length: 50 }, () => nextDraftId());
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("emptyDraft", () => {
  it("seeds a blank, not-yet-runnable draft with a fresh unique id and default role", () => {
    const d = emptyDraft();
    expect(d.id).toMatch(/^m\d+$/);
    expect(d.role).toBe("code");
    expect(d.personaName).toBe("");
    expect(d.goal).toBe("");
    expect(d.verificationStepsText).toBe("");
    expect(d.kickoffTask).toBeUndefined();
    expect(isDraftRunnable(d).ok).toBe(false); // gated until the user fills it in
  });

  it("honors a role override and gives each blank draft a distinct id", () => {
    const a = emptyDraft("qa");
    const b = emptyDraft("qa");
    expect(a.role).toBe("qa");
    expect(a.id).not.toBe(b.id);
  });
});
