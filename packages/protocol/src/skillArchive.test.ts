import { describe, expect, it } from "vitest";
import type { ServerMissionRecord } from "./productKernel.js";
import {
  applyCuratorDecision,
  buildObsidianSkillNote,
  deriveSkillArchiveQueue,
  deriveSkillCandidatesFromMission,
  isExportableSkill,
  isSkillEvalEligible,
  markSkillEvalPassed,
  activateSkill,
  quarantineSkill,
  isRuntimeLoadableSkill,
  buildSkillRuntimeManifest,
  type SkillArchiveCandidate,
} from "./skillArchive.js";

const now = () => "2026-06-13T00:00:00.000Z";

function record(overrides: Partial<ServerMissionRecord> = {}): ServerMissionRecord {
  return {
    mission: { missionId: "m1", title: "테트리스", goal: "테트리스 구현", truthStatus: "observed", createdBy: "kurumi", createdAt: "t" },
    status: "merged",
    truthStatus: "observed",
    workers: [],
    artifacts: [],
    verificationReports: [],
    mergeQueueItems: [{ id: "mq", branchName: "agent/m1", status: "merged", mergeCommitSha: "abc1234567", conflictFiles: [], reason: "ok", queuedAt: "t" }],
    updatedAt: "t",
    ...overrides,
  } as unknown as ServerMissionRecord;
}

describe("deriveSkillCandidatesFromMission", () => {
  it("creates suggested candidates from a merged mission (never auto-trusted)", () => {
    const candidates = deriveSkillCandidatesFromMission(record(), now);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.trustStatus === "suggested")).toBe(true);
    expect(candidates.some((c) => c.source === "merge_pattern")).toBe(true);
  });

  it("does NOT create skills from a failed / unmerged mission", () => {
    expect(deriveSkillCandidatesFromMission(record({ status: "failed", mergeQueueItems: [] }), now)).toEqual([]);
    expect(deriveSkillCandidatesFromMission(record({ status: "verifying", mergeQueueItems: [] }), now)).toEqual([]);
  });

  it("adds a verification_fix skill when a failed verification later passed", () => {
    const candidates = deriveSkillCandidatesFromMission(
      record({
        verificationReports: [
          { id: "v1", status: "failed", observed: true, checks: [], globalRevisionDirective: "guard null", createdAt: "t" },
          { id: "v2", status: "passed", observed: true, checks: [], createdAt: "t" },
        ] as never,
      }),
      now,
    );
    expect(candidates.some((c) => c.source === "verification_fix")).toBe(true);
  });
});

describe("curator loop", () => {
  const candidate = (): SkillArchiveCandidate => deriveSkillCandidatesFromMission(record(), now)[0]!;

  it("approval / pin make it exportable; reject does not", () => {
    expect(isExportableSkill(applyCuratorDecision(candidate(), "approve"))).toBe(true);
    expect(isExportableSkill(applyCuratorDecision(candidate(), "pin"))).toBe(true);
    expect(isExportableSkill(applyCuratorDecision(candidate(), "reject"))).toBe(false);
    expect(isExportableSkill(candidate())).toBe(false); // suggested is not exportable
  });

  it("obsidian export is idempotent (deterministic path/content by id)", () => {
    const c = applyCuratorDecision(candidate(), "approve");
    const a = buildObsidianSkillNote(c);
    const b = buildObsidianSkillNote(c);
    expect(a.path).toBe("skills/skill_m1_merge.md");
    expect(a).toEqual(b);
  });
});

describe("deriveSkillArchiveQueue", () => {
  const c = candidateFixture();
  function candidateFixture(): SkillArchiveCandidate {
    return deriveSkillCandidatesFromMission(record(), now)[0]!;
  }

  it("created stays suggested until a curated decision lands (no auto-promotion)", () => {
    const queue = deriveSkillArchiveQueue([
      { type: "memory.skill_candidate.created", payload: { missionId: "m1", candidate: c } },
    ]);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.trustStatus).toBe("suggested");
  });

  it("applies the latest curated decision in append order (approve → pin)", () => {
    const queue = deriveSkillArchiveQueue([
      { type: "memory.skill_candidate.created", payload: { missionId: "m1", candidate: c } },
      { type: "memory.skill_candidate.curated", payload: { missionId: "m1", candidateId: c.id, decision: "approve", trustStatus: "curator_approved" } },
      { type: "memory.skill_candidate.curated", payload: { missionId: "m1", candidateId: c.id, decision: "pin", trustStatus: "pinned" } },
    ]);
    expect(queue[0]!.trustStatus).toBe("pinned");
  });

  it("ignores curated events for unknown candidates and de-dups created", () => {
    const queue = deriveSkillArchiveQueue([
      { type: "memory.skill_candidate.created", payload: { missionId: "m1", candidate: c } },
      { type: "memory.skill_candidate.created", payload: { missionId: "m1", candidate: c } },
      { type: "memory.skill_candidate.curated", payload: { missionId: "m1", candidateId: "ghost", decision: "approve", trustStatus: "curator_approved" } },
    ]);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.trustStatus).toBe("suggested");
  });
});

describe("skill runtime activation contract", () => {
  const nowStr = () => "2026-06-16T12:00:00.000Z";
  const getCandidate = (): SkillArchiveCandidate => {
    return {
      id: "skill-1",
      missionId: "mission-1",
      source: "merge_pattern",
      title: "Test Skill",
      summary: "Summary",
      triggerPatterns: [],
      relatedFiles: [],
      confidence: "high",
      trustStatus: "suggested",
      createdAt: nowStr(),
      activationStatus: "inactive",
    };
  };

  it("isSkillEvalEligible only for approved/pinned and inactive", () => {
    const candidate = getCandidate();
    expect(isSkillEvalEligible(candidate)).toBe(false); // suggested is not eligible

    const approved = applyCuratorDecision(candidate, "approve");
    expect(isSkillEvalEligible(approved)).toBe(true); // approved and inactive is eligible

    const evaluated = markSkillEvalPassed(approved, "eval-run-1");
    expect(isSkillEvalEligible(evaluated)).toBe(false); // evaluated (eval_passed) is not eligible
  });

  it("markSkillEvalPassed updates status and evalRunId", () => {
    const candidate = applyCuratorDecision(getCandidate(), "approve");
    const updated = markSkillEvalPassed(candidate, "run-101");
    expect(updated.activationStatus).toBe("eval_passed");
    expect(updated.evalRunId).toBe("run-101");
  });

  it("activateSkill requires evalRunId or evalWaiverReason", () => {
    const candidate = applyCuratorDecision(getCandidate(), "approve");
    expect(() => activateSkill(candidate)).toThrow("Cannot activate skill without evalRunId or evalWaiverReason");

    const withEval = markSkillEvalPassed(candidate, "run-101");
    const activated = activateSkill(withEval, "custom-scope");
    expect(activated.activationStatus).toBe("active");
    expect(activated.activationScope).toBe("custom-scope");

    const withWaiver = { ...candidate, evalWaiverReason: "Manual verification performed" };
    const activatedWaiver = activateSkill(withWaiver);
    expect(activatedWaiver.activationStatus).toBe("active");
  });

  it("quarantineSkill sets status and reason", () => {
    const candidate = getCandidate();
    const quarantined = quarantineSkill(candidate, "Violated safety guidelines");
    expect(quarantined.activationStatus).toBe("quarantined");
    expect(quarantined.quarantineReason).toBe("Violated safety guidelines");
  });

  it("isRuntimeLoadableSkill enforces strict gating", () => {
    const candidate = getCandidate();
    expect(isRuntimeLoadableSkill(candidate)).toBe(false); // suggested, inactive

    const approved = applyCuratorDecision(candidate, "approve");
    expect(isRuntimeLoadableSkill(approved)).toBe(false); // approved, inactive

    const withEval = markSkillEvalPassed(approved, "run-101");
    expect(isRuntimeLoadableSkill(withEval)).toBe(false); // approved, eval_passed (not yet active)

    const active = activateSkill(withEval);
    expect(isRuntimeLoadableSkill(active)).toBe(true); // approved, active, evalRunId present

    const quarantined = quarantineSkill(active, "Broken");
    expect(isRuntimeLoadableSkill(quarantined)).toBe(false); // quarantined is not loadable
  });

  it("buildSkillRuntimeManifest filters correctly", () => {
    const s1 = { ...applyCuratorDecision(getCandidate(), "approve"), id: "s1", evalRunId: "run-1", activationStatus: "active" as const, activationScope: "global" };
    const s2 = { ...applyCuratorDecision(getCandidate(), "approve"), id: "s2", evalRunId: "run-2", activationStatus: "active" as const, activationScope: "local" };
    const s3 = { ...getCandidate(), id: "s3" }; // suggested

    const manifestGlobal = buildSkillRuntimeManifest([s1, s2, s3], "global");
    expect(manifestGlobal).toHaveLength(1);
    expect(manifestGlobal[0]!.id).toBe("s1");

    const manifestAll = buildSkillRuntimeManifest([s1, s2, s3]);
    expect(manifestAll).toHaveLength(2);
  });
});

