import { describe, expect, it } from "vitest";
import type { ServerMissionRecord } from "./productKernel.js";
import {
  applyCuratorDecision,
  buildObsidianSkillNote,
  deriveSkillArchiveQueue,
  deriveSkillCandidatesFromMission,
  isExportableSkill,
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

// ─────────────────────────────────────────────────────────────────────────────
// L8 PR 3 — Skill Runtime Activation Contract tests
// ─────────────────────────────────────────────────────────────────────────────

import {
  activateSkill,
  buildSkillRuntimeManifest,
  initialSkillActivation,
  isSkillEvalEligible,
  isSkillRuntimeLoadable,
  markSkillEvalPassed,
  markSkillEvalPending,
  quarantineSkill,
  type SkillActivationStatus,
  type SkillRuntimeActivationRecord,
  type SkillTrustStatus,
} from "./skillArchive.js";

const T = () => "2026-06-16T00:00:00.000Z";

function cand(id: string, trustStatus: SkillTrustStatus): SkillArchiveCandidate {
  return {
    id,
    missionId: "m1",
    source: "merge_pattern",
    title: `skill ${id}`,
    summary: "…",
    triggerPatterns: [],
    relatedFiles: [],
    confidence: "medium",
    trustStatus,
    createdAt: "2026-06-16T00:00:00.000Z",
  };
}

function activation(
  candidateId: string,
  activationStatus: SkillActivationStatus,
  over: Partial<SkillRuntimeActivationRecord> = {},
): SkillRuntimeActivationRecord {
  return { candidateId, activationStatus, ...over };
}

describe("SkillActivationStatus is a separate axis from MemoryRecord.activationState", () => {
  it("(S1) does not reuse memory activation; skill statuses include eval_pending/eval_passed", () => {
    const a = initialSkillActivation("s1");
    expect(a.activationStatus).toBe("inactive");
    // eval_pending / eval_passed 는 skill 전용 — memory activationState에는 없는 값
    const pending = markSkillEvalPending(a, T);
    expect(pending.activationStatus).toBe("eval_pending");
    const passed = markSkillEvalPassed(pending, "evalrun_1", T);
    expect(passed.activationStatus).toBe("eval_passed");
    expect(passed.evalRunId).toBe("evalrun_1");
  });
});

describe("isSkillRuntimeLoadable — the contract", () => {
  it("(S2) curator_approved + active + evalRunId → loadable", () => {
    const v = isSkillRuntimeLoadable(cand("s", "curator_approved"), activation("s", "active", { evalRunId: "e1" }));
    expect(v.loadable).toBe(true);
    expect(v.reasons).toEqual([]);
    expect(v.waived).toBe(false);
  });

  it("(S3) pinned + active + evalRunId → loadable", () => {
    const v = isSkillRuntimeLoadable(cand("s", "pinned"), activation("s", "active", { evalRunId: "e1" }));
    expect(v.loadable).toBe(true);
  });

  it("(S4) pinned + active WITHOUT evalRunId or waiver → NOT loadable (pinned does not bypass eval)", () => {
    const v = isSkillRuntimeLoadable(cand("s", "pinned"), activation("s", "active"));
    expect(v.loadable).toBe(false);
    expect(v.reasons).toContain("no_eval_basis");
  });

  it("(S5) pinned + active + evalWaiverReason → loadable but waived=true", () => {
    const v = isSkillRuntimeLoadable(
      cand("s", "pinned"),
      activation("s", "active", { evalWaiverReason: "trusted bootstrap skill" }),
    );
    expect(v.loadable).toBe(true);
    expect(v.waived).toBe(true);
  });

  it("(S6) suggested + active + evalRunId → NOT loadable (not trusted)", () => {
    const v = isSkillRuntimeLoadable(cand("s", "suggested"), activation("s", "active", { evalRunId: "e1" }));
    expect(v.loadable).toBe(false);
    expect(v.reasons).toContain("not_trusted");
  });

  it("(S7) rejected → never loadable", () => {
    const v = isSkillRuntimeLoadable(cand("s", "rejected"), activation("s", "active", { evalRunId: "e1" }));
    expect(v.loadable).toBe(false);
    expect(v.reasons).toContain("not_trusted");
  });

  it("(S8) inactive/eval_pending/eval_passed are not loadable unless active", () => {
    for (const status of ["inactive", "eval_pending", "eval_passed"] as const) {
      const v = isSkillRuntimeLoadable(cand("s", "curator_approved"), activation("s", status, { evalRunId: "e1" }));
      expect(v.loadable).toBe(false);
      expect(v.reasons).toContain("not_active");
    }
  });

  it("(S9) quarantined always blocks even if pinned + evalRunId", () => {
    const v = isSkillRuntimeLoadable(
      cand("s", "pinned"),
      activation("s", "quarantined", { evalRunId: "e1" }),
    );
    expect(v.loadable).toBe(false);
    expect(v.reasons).toEqual(["quarantined"]);
  });
});

describe("transition functions", () => {
  it("(S10) eval eligibility requires curator_approved/pinned and not quarantined", () => {
    expect(isSkillEvalEligible(cand("s", "curator_approved"), activation("s", "inactive"))).toBe(true);
    expect(isSkillEvalEligible(cand("s", "pinned"), activation("s", "inactive"))).toBe(true);
    expect(isSkillEvalEligible(cand("s", "suggested"), activation("s", "inactive"))).toBe(false);
    expect(isSkillEvalEligible(cand("s", "rejected"), activation("s", "inactive"))).toBe(false);
    expect(isSkillEvalEligible(cand("s", "pinned"), activation("s", "quarantined"))).toBe(false);
  });

  it("(S11) activateSkill requires eval_passed + eval basis; otherwise no-op", () => {
    // eval_passed + evalRunId → active
    const passed = activation("s", "eval_passed", { evalRunId: "e1" });
    const activated = activateSkill(passed, { now: T });
    expect(activated.activationStatus).toBe("active");
    expect(activated.activatedAt).toBe(T());

    // eval_passed but no eval basis → no-op
    const noBasis = activation("s", "eval_passed");
    expect(activateSkill(noBasis, { now: T }).activationStatus).toBe("eval_passed");

    // not eval_passed → no-op even with evalRunId
    const inactive = activation("s", "inactive", { evalRunId: "e1" });
    expect(activateSkill(inactive, { now: T }).activationStatus).toBe("inactive");
  });

  it("(S12) activateSkill with waiver reason activates without evalRunId", () => {
    const passed = activation("s", "eval_passed");
    const activated = activateSkill(passed, { evalWaiverReason: "bootstrap", now: T });
    expect(activated.activationStatus).toBe("active");
    expect(activated.evalWaiverReason).toBe("bootstrap");
  });

  it("(S13) quarantine blocks further transitions", () => {
    const q = quarantineSkill(activation("s", "eval_passed", { evalRunId: "e1" }), "leaked secret", T);
    expect(q.activationStatus).toBe("quarantined");
    expect(q.quarantinedReason).toBe("leaked secret");
    // pending/passed/activate are all no-ops from quarantine
    expect(markSkillEvalPending(q, T).activationStatus).toBe("quarantined");
    expect(markSkillEvalPassed(q, "e2", T).activationStatus).toBe("quarantined");
    expect(activateSkill(q, { now: T }).activationStatus).toBe("quarantined");
  });
});

describe("buildSkillRuntimeManifest — deterministic", () => {
  const candidates = [
    cand("c_loadable", "curator_approved"),
    cand("a_pinned_waived", "pinned"),
    cand("b_blocked", "suggested"),
    cand("d_quarantined", "pinned"),
  ];
  const activations = [
    activation("c_loadable", "active", { evalRunId: "e1" }),
    activation("a_pinned_waived", "active", { evalWaiverReason: "bootstrap" }),
    activation("b_blocked", "active", { evalRunId: "e2" }), // suggested → blocked
    activation("d_quarantined", "quarantined", { evalRunId: "e3" }),
  ];

  it("(S14) loadable set + blocked set with reasons", () => {
    const manifest = buildSkillRuntimeManifest({ candidates, activations });
    expect(manifest.loadable.map((e) => e.candidateId)).toEqual(["a_pinned_waived", "c_loadable"]);
    // a_pinned_waived marked waived
    expect(manifest.loadable.find((e) => e.candidateId === "a_pinned_waived")?.waived).toBe(true);
    expect(manifest.loadable.find((e) => e.candidateId === "c_loadable")?.waived).toBe(false);
    // blocked sorted by candidateId
    expect(manifest.blocked.map((b) => b.candidateId)).toEqual(["b_blocked", "d_quarantined"]);
    expect(manifest.blocked.find((b) => b.candidateId === "b_blocked")?.reasons).toContain("not_trusted");
    expect(manifest.blocked.find((b) => b.candidateId === "d_quarantined")?.reasons).toEqual(["quarantined"]);
  });

  it("(S15) deterministic — identical input (any order) → identical output", () => {
    const m1 = buildSkillRuntimeManifest({ candidates, activations });
    const m2 = buildSkillRuntimeManifest({
      candidates: [...candidates].reverse(),
      activations: [...activations].reverse(),
    });
    expect(m1).toEqual(m2);
  });

  it("(S16) missing activation record → treated inactive → blocked(not_active)", () => {
    const manifest = buildSkillRuntimeManifest({
      candidates: [cand("x", "curator_approved")],
      activations: [],
    });
    expect(manifest.loadable).toEqual([]);
    expect(manifest.blocked[0]?.reasons).toContain("not_active");
  });

  it("(S17) duplicate candidate ids handled deterministically (first kept)", () => {
    const dupCandidates = [cand("dup", "curator_approved"), cand("dup", "rejected")];
    const manifest = buildSkillRuntimeManifest({
      candidates: dupCandidates,
      activations: [activation("dup", "active", { evalRunId: "e1" })],
    });
    // only one entry total across loadable+blocked
    expect(manifest.loadable.length + manifest.blocked.length).toBe(1);
  });

  it("(S18) scope filter: activationScope mismatch excluded from loadable", () => {
    const manifest = buildSkillRuntimeManifest({
      candidates: [cand("g", "curator_approved"), cand("p", "curator_approved")],
      activations: [
        activation("g", "active", { evalRunId: "e1" }), // no scope → allowed everywhere
        activation("p", "active", { evalRunId: "e2", activationScope: "project:other" }),
      ],
      scope: "project:mine",
    });
    expect(manifest.loadable.map((e) => e.candidateId)).toEqual(["g"]);
    expect(manifest.blocked.map((b) => b.candidateId)).toEqual(["p"]);
  });

  it("(S19) empty input → empty manifest", () => {
    const manifest = buildSkillRuntimeManifest({ candidates: [], activations: [] });
    expect(manifest.loadable).toEqual([]);
    expect(manifest.blocked).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Block-reason accumulation, waived precedence, and activation-basis edges.
//
// The S2–S19 cases pin the happy paths and single-reason blocks (always via
// .toContain), but leave three deny-by-default *honesty* edges unpinned:
//   (a) when several conditions fail at once, isSkillRuntimeLoadable accumulates
//       EVERY applicable reason in a fixed order [not_trusted, not_active,
//       no_eval_basis] — except `quarantined`, which short-circuits and SUPPRESSES
//       all other reasons (a single hard block, not a list). That contrast is the
//       whole point of "격리는 단독 하드 차단".
//   (b) `waived` means "loadable purely on a waiver" — so when BOTH evalRunId and
//       evalWaiverReason are present, the real eval run is the basis and waived is
//       false (evalRunId wins; the waiver flag must not over-claim a waiver).
//   (c) activateSkill's eval basis can come from the record's OWN evalWaiverReason
//       (not just input), and activationScope passes through when input omits it.
//   (d) quarantineSkill has no state guard — it hard-quarantines from any state.
// Pin them, self-consistent with the source logic.
describe("skillArchive — block-reason accumulation, waived precedence, activation basis", () => {
  it("accumulates every applicable block reason in fixed order for a non-quarantine failure", () => {
    // suggested (not trusted) + inactive (not active) + no eval basis → all three, in push order.
    const v = isSkillRuntimeLoadable(cand("s", "suggested"), activation("s", "inactive"));
    expect(v.loadable).toBe(false);
    expect(v.reasons).toEqual(["not_trusted", "not_active", "no_eval_basis"]);
    expect(v.waived).toBe(false);
  });

  it("quarantined short-circuits and suppresses all other honest reasons", () => {
    // Same fully-failing candidate, but quarantined → ONLY ["quarantined"], not the 3-reason list.
    const v = isSkillRuntimeLoadable(cand("s", "suggested"), activation("s", "quarantined"));
    expect(v.reasons).toEqual(["quarantined"]);
    expect(v.reasons).not.toContain("not_trusted");
    expect(v.reasons).not.toContain("no_eval_basis");
  });

  it("evalRunId is the basis over a co-present waiver → loadable but waived=false", () => {
    const v = isSkillRuntimeLoadable(
      cand("s", "pinned"),
      activation("s", "active", { evalRunId: "e1", evalWaiverReason: "also waivable" }),
    );
    expect(v.loadable).toBe(true);
    expect(v.waived).toBe(false); // real eval run present ⇒ not a waiver, even though a waiver exists
  });

  it("activateSkill uses the record's own evalWaiverReason as basis and preserves activationScope", () => {
    // eval basis comes from the existing record (no input waiver), scope passes through.
    const passed = activation("s", "eval_passed", { evalWaiverReason: "boot", activationScope: "project:x" });
    const activated = activateSkill(passed, { now: T });
    expect(activated.activationStatus).toBe("active");
    expect(activated.evalWaiverReason).toBe("boot");
    expect(activated.activationScope).toBe("project:x"); // input omitted scope ⇒ keep existing
    expect(activated.activatedAt).toBe(T());
    expect(activated.updatedAt).toBe(T());
  });

  it("quarantineSkill hard-quarantines from any state (no guard), recording the reason", () => {
    for (const status of ["inactive", "eval_pending", "active"] as const) {
      const q = quarantineSkill(activation("s", status, { evalRunId: "e1" }), `bad: ${status}`, T);
      expect(q.activationStatus).toBe("quarantined");
      expect(q.quarantinedReason).toBe(`bad: ${status}`);
      expect(q.updatedAt).toBe(T());
      // and a quarantined record is then unconditionally non-loadable
      expect(isSkillRuntimeLoadable(cand("s", "pinned"), q).reasons).toEqual(["quarantined"]);
    }
  });
});

// deriveSkillCandidatesFromMission is tested for WHICH candidates appear
// (merge / fix / none), but the CONTENT honesty of each is unpinned. Two rules
// matter: (1) the merge summary only shows a "branch → sha" ref when a REAL
// mergeCommitSha exists (and prefers sourceBranch over branchName), else a
// neutral phrase with no fabricated ref; (2) a fix candidate may only be minted
// when the recovering pass is OBSERVED (skillArchive.ts:76) — a simulated pass
// cannot mint a "this is how we fixed it" skill — and it carries the directive
// verbatim as its reusablePrompt (or a neutral summary + no prompt when absent).
describe("deriveSkillCandidatesFromMission — content honesty (merge ref needs real sha, fix needs observed pass)", () => {
  const merge = (candidates: SkillArchiveCandidate[]) => candidates.find((c) => c.source === "merge_pattern");
  const fix = (candidates: SkillArchiveCandidate[]) => candidates.find((c) => c.source === "verification_fix");

  it("merge summary shows sourceBranch (preferred) → sha sliced to 10 when a real sha exists", () => {
    const c = deriveSkillCandidatesFromMission(
      record({
        mergeQueueItems: [
          { id: "mq", branchName: "agent/m1", sourceBranch: "feat/x", status: "merged", mergeCommitSha: "abcdef1234567890", conflictFiles: [], reason: "ok", queuedAt: "t" },
        ] as never,
      }),
      now,
    );
    expect(merge(c)!.summary).toBe("feat/x → abcdef1234"); // sourceBranch preferred, sha → first 10
  });

  it("merge summary falls back to branchName when sourceBranch is absent (still a real sha)", () => {
    const c = deriveSkillCandidatesFromMission(
      record({
        mergeQueueItems: [
          { id: "mq", branchName: "agent/m1", status: "merged", mergeCommitSha: "abcdef1234567890", conflictFiles: [], reason: "ok", queuedAt: "t" },
        ] as never,
      }),
      now,
    );
    expect(merge(c)!.summary).toBe("agent/m1 → abcdef1234");
  });

  it("merge summary fabricates NO ref when the merged item has no sha — neutral phrase only", () => {
    const c = deriveSkillCandidatesFromMission(
      record({
        mergeQueueItems: [
          { id: "mq", branchName: "agent/m1", sourceBranch: "feat/x", status: "merged", conflictFiles: [], reason: "ok", queuedAt: "t" },
        ] as never,
      }),
      now,
    );
    expect(merge(c)!.summary).toBe("검증 통과 후 순차 머지");
    expect(merge(c)!.summary).not.toContain("→"); // no fabricated branch→sha line
  });

  it("a fix candidate is minted ONLY when the recovering pass is observed — a simulated pass cannot", () => {
    const c = deriveSkillCandidatesFromMission(
      record({
        verificationReports: [
          { id: "v1", status: "failed", observed: true, checks: [], createdAt: "t" },
          { id: "v2", status: "passed", observed: false, checks: [], createdAt: "t" }, // simulated pass
        ] as never,
      }),
      now,
    );
    expect(fix(c)).toBeUndefined(); // no fix skill from an unobserved pass
    expect(merge(c)).toBeDefined(); // ...but the merge candidate still stands (mission merged)
  });

  it("fix candidate carries the directive verbatim as reusablePrompt with high confidence", () => {
    const c = deriveSkillCandidatesFromMission(
      record({
        verificationReports: [
          { id: "v1", status: "failed", observed: true, checks: [], globalRevisionDirective: "guard null deref", createdAt: "t" },
          { id: "v2", status: "passed", observed: true, checks: [], createdAt: "t" },
        ] as never,
      }),
      now,
    );
    expect(fix(c)!.reusablePrompt).toBe("guard null deref");
    expect(fix(c)!.summary).toBe("수정 지시: guard null deref");
    expect(fix(c)!.confidence).toBe("high");
  });

  it("fix candidate without a directive → neutral summary and no reusablePrompt", () => {
    const c = deriveSkillCandidatesFromMission(
      record({
        verificationReports: [
          { id: "v1", status: "failed", observed: true, checks: [], createdAt: "t" },
          { id: "v2", status: "passed", observed: true, checks: [], createdAt: "t" },
        ] as never,
      }),
      now,
    );
    expect(fix(c)!.summary).toBe("실패한 검증을 통과로 되돌린 수정 패턴");
    expect(fix(c)!.reusablePrompt).toBeUndefined();
  });
});
