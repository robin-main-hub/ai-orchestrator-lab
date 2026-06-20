import { describe, expect, it } from "vitest";
import {
  canDistill,
  deriveLearningLoopById,
  deriveLearningLoopState,
  investigatorRoleSchema,
  isObservedClaimValid,
  LEARNING_EVENT_TYPES,
  learningLoopStageSchema,
  type DistilledLearningCandidate,
  type FailureHypothesis,
  type FailureInvestigation,
  type HypothesisVerification,
  type LearningFailure,
  type MemoryConsultRecord,
} from "./learningLoop.js";

const LOOP = "loop_1";
const MISSION = "m_1";

function failure(over: Partial<LearningFailure> = {}): LearningFailure {
  return {
    id: "fail_1",
    loopId: LOOP,
    missionId: MISSION,
    verificationReportId: "vr_1",
    summary: "typecheck failed",
    createdAt: "2026-06-16T00:00:00Z",
    ...over,
  };
}

function investigation(over: Partial<FailureInvestigation> = {}): FailureInvestigation {
  return {
    id: "inv_1",
    loopId: LOOP,
    investigatorRole: "investigator",
    notes: "looked at the stack",
    evidenceRefs: ["artifact_log_1"],
    startedAt: "2026-06-16T00:01:00Z",
    ...over,
  };
}

function hypothesis(over: Partial<FailureHypothesis> = {}): FailureHypothesis {
  return {
    id: "hyp_1",
    loopId: LOOP,
    statement: "null guard missing in foo()",
    evidenceRefs: ["artifact_log_1"],
    createdAt: "2026-06-16T00:02:00Z",
    ...over,
  };
}

function verified(over: Partial<HypothesisVerification> = {}): HypothesisVerification {
  return {
    hypothesisId: "hyp_1",
    loopId: LOOP,
    outcome: "verified",
    evidenceRefs: ["artifact_rerun_1"],
    truthStatus: "observed",
    reason: "adding the guard made the check pass",
    verifiedAt: "2026-06-16T00:03:00Z",
    ...over,
  };
}

function rejected(over: Partial<HypothesisVerification> = {}): HypothesisVerification {
  return {
    hypothesisId: "hyp_1",
    loopId: LOOP,
    outcome: "rejected",
    evidenceRefs: ["artifact_rerun_2"],
    truthStatus: "observed",
    reason: "guard did not change the failure",
    verifiedAt: "2026-06-16T00:03:30Z",
    ...over,
  };
}

function candidate(over: Partial<DistilledLearningCandidate> = {}): DistilledLearningCandidate {
  return {
    id: "distill_1",
    loopId: LOOP,
    hypothesisId: "hyp_1",
    title: "guard nullable foo()",
    lesson: "always guard nullable results before use",
    evidenceRefs: ["artifact_rerun_1"],
    trustStatus: "suggested",
    createdAt: "2026-06-16T00:04:00Z",
    ...over,
  };
}

function consult(over: Partial<MemoryConsultRecord> = {}): MemoryConsultRecord {
  return {
    id: "consult_1",
    loopId: LOOP,
    missionId: "m_2",
    outcome: "completed",
    consultedMemoryIds: ["mem_1"],
    createdAt: "2026-06-16T01:00:00Z",
    ...over,
  };
}

const E = LEARNING_EVENT_TYPES;

describe("deriveLearningLoopState — basic stage progression", () => {
  it("(L1) failed verification starts a learning loop at stage='failed'", () => {
    const loops = deriveLearningLoopState([{ type: E.failureRecorded, payload: { failure: failure() } }]);
    expect(loops).toHaveLength(1);
    expect(loops[0]!.stage).toBe("failed");
    expect(loops[0]!.missionId).toBe(MISSION);
    expect(loops[0]!.failure?.verificationReportId).toBe("vr_1");
  });

  it("(L2) full happy path: failed → investigating → hypothesis → verified → distilled → consulted", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        { type: E.investigationStarted, payload: { investigation: investigation() } },
        { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis() } },
        { type: E.hypothesisVerified, payload: { verification: verified() } },
        { type: E.distillationCandidateCreated, payload: { candidate: candidate() } },
        { type: E.consultCompleted, payload: { consult: consult() } },
      ],
      LOOP,
    );
    expect(loop?.stage).toBe("consulted");
    expect(loop?.distillation?.id).toBe("distill_1");
    expect(loop?.distillation?.trustStatus).toBe("suggested");
    expect(loop?.consult?.outcome).toBe("completed");
    expect(loop?.verifiedHypothesisIds).toEqual(["hyp_1"]);
  });
});

describe("invariant 1 — failure needs an evidence anchor", () => {
  it("(L3) failure with neither sandboxErrorCardId nor verificationReportId is dropped", () => {
    const loops = deriveLearningLoopState([
      {
        type: E.failureRecorded,
        payload: { failure: { ...failure(), verificationReportId: undefined, sandboxErrorCardId: undefined } },
      },
    ]);
    expect(loops).toHaveLength(0);
  });

  it("(L4) failure anchored only by sandboxErrorCardId is accepted", () => {
    const loops = deriveLearningLoopState([
      {
        type: E.failureRecorded,
        payload: { failure: { ...failure(), verificationReportId: undefined, sandboxErrorCardId: "ec_1" } },
      },
    ]);
    expect(loops).toHaveLength(1);
  });
});

describe("invariant 2 — investigation is read-only role", () => {
  it("(L5) investigator/verifier/reviewer accepted; builder rejected by schema", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        // builder is not a read-only role → payload fails schema → dropped
        { type: E.investigationStarted, payload: { investigation: { ...investigation(), investigatorRole: "builder" } } },
      ],
      LOOP,
    );
    expect(loop?.stage).toBe("failed"); // investigation did not apply
    expect(loop?.investigation).toBeUndefined();
  });
});

describe("invariant 3 — distillation needs a verified hypothesis", () => {
  it("(L6) distillation candidate without any verified hypothesis is ignored", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis() } },
        // jump straight to distillation — no verification
        { type: E.distillationCandidateCreated, payload: { candidate: candidate() } },
      ],
      LOOP,
    );
    expect(loop?.distillation).toBeUndefined();
    expect(loop?.stage).toBe("hypothesis_recorded");
  });
});

describe("invariant 4 — rejected hypothesis cannot become distillation", () => {
  it("(L7) distillation referencing a rejected hypothesis is ignored", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis() } },
        { type: E.hypothesisRejected, payload: { verification: rejected() } },
        { type: E.distillationCandidateCreated, payload: { candidate: candidate() } },
      ],
      LOOP,
    );
    expect(loop?.distillation).toBeUndefined();
    expect(loop?.stage).toBe("rejected");
    expect(loop?.rejectedHypothesisIds).toEqual(["hyp_1"]);
  });

  it("(L8) a different verified hypothesis can still distill even if one was rejected", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis({ id: "hyp_1" }) } },
        { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis({ id: "hyp_2" }) } },
        { type: E.hypothesisRejected, payload: { verification: rejected({ hypothesisId: "hyp_1" }) } },
        { type: E.hypothesisVerified, payload: { verification: verified({ hypothesisId: "hyp_2" }) } },
        { type: E.distillationCandidateCreated, payload: { candidate: candidate({ hypothesisId: "hyp_2" }) } },
      ],
      LOOP,
    );
    expect(loop?.distillation?.hypothesisId).toBe("hyp_2");
    expect(loop?.stage).toBe("distilled");
  });
});

describe("invariant 5 — consult skipped requires reason", () => {
  it("(L9) skipped consult without skipReason is dropped", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        {
          type: E.consultSkipped,
          payload: { consult: { ...consult(), outcome: "skipped", skipReason: undefined } },
        },
      ],
      LOOP,
    );
    expect(loop?.consult).toBeUndefined();
    expect(loop?.stage).toBe("failed");
  });

  it("(L10) skipped consult with a reason is accepted and closes the loop", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        {
          type: E.consultSkipped,
          payload: { consult: { ...consult(), outcome: "skipped", skipReason: "no relevant prior learning" } },
        },
      ],
      LOOP,
    );
    expect(loop?.consult?.outcome).toBe("skipped");
    expect(loop?.stage).toBe("consulted");
  });
});

describe("invariant 6 — observed claims require evidence", () => {
  it("(L11) verified-as-observed with empty evidenceRefs is dropped (does not advance)", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis() } },
        { type: E.hypothesisVerified, payload: { verification: verified({ evidenceRefs: [] }) } },
      ],
      LOOP,
    );
    expect(loop?.verifiedHypothesisIds).toEqual([]);
    expect(loop?.stage).toBe("hypothesis_recorded");
  });

  it("(L12) isObservedClaimValid: observed needs evidence, non-observed does not", () => {
    expect(isObservedClaimValid("observed", [])).toBe(false);
    expect(isObservedClaimValid("observed", ["x"])).toBe(true);
    expect(isObservedClaimValid("planned", [])).toBe(true);
  });
});

describe("guards + helpers", () => {
  it("(L13) hypothesis with empty evidenceRefs is dropped (no blind guesses)", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        { type: E.hypothesisRecorded, payload: { hypothesis: { ...hypothesis(), evidenceRefs: [] } } },
      ],
      LOOP,
    );
    expect(loop?.hypotheses).toEqual([]);
    expect(loop?.stage).toBe("failed");
  });

  it("(L14) verification of a non-existent hypothesis is ignored", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        { type: E.hypothesisVerified, payload: { verification: verified({ hypothesisId: "ghost" }) } },
      ],
      LOOP,
    );
    expect(loop?.verifiedHypothesisIds).toEqual([]);
  });

  it("(L15) events for an unopened loop are ignored (failure must come first)", () => {
    const loops = deriveLearningLoopState([
      { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis() } },
      { type: E.investigationStarted, payload: { investigation: investigation() } },
    ]);
    expect(loops).toHaveLength(0);
  });

  it("(L16) duplicate failure / hypothesis / distillation are idempotent", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        { type: E.failureRecorded, payload: { failure: { ...failure(), summary: "second" } } },
        { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis() } },
        { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis() } },
        { type: E.hypothesisVerified, payload: { verification: verified() } },
        { type: E.distillationCandidateCreated, payload: { candidate: candidate() } },
        { type: E.distillationCandidateCreated, payload: { candidate: candidate({ id: "distill_2" }) } },
      ],
      LOOP,
    );
    expect(loop?.failure?.summary).toBe("typecheck failed"); // first wins
    expect(loop?.hypotheses).toHaveLength(1);
    expect(loop?.distillation?.id).toBe("distill_1"); // first distillation wins
  });

  it("(L17) canDistill reflects verified-not-rejected hypotheses", () => {
    expect(canDistill({ verifiedHypothesisIds: [], rejectedHypothesisIds: [] })).toBe(false);
    expect(canDistill({ verifiedHypothesisIds: ["h1"], rejectedHypothesisIds: [] })).toBe(true);
    expect(canDistill({ verifiedHypothesisIds: ["h1"], rejectedHypothesisIds: ["h1"] })).toBe(false);
    expect(canDistill({ verifiedHypothesisIds: ["h1", "h2"], rejectedHypothesisIds: ["h1"] })).toBe(true);
  });

  it("(L18) two independent loops are tracked separately", () => {
    const loops = deriveLearningLoopState([
      { type: E.failureRecorded, payload: { failure: failure({ id: "f1", loopId: "loop_a", missionId: "m_a" }) } },
      { type: E.failureRecorded, payload: { failure: failure({ id: "f2", loopId: "loop_b", missionId: "m_b" }) } },
    ]);
    expect(loops.map((l) => l.loopId).sort()).toEqual(["loop_a", "loop_b"]);
  });
});

// The reducer/helper behavior is well covered above (L1–L18), but three exported
// vocabularies are only ever exercised implicitly: learningLoopStageSchema (the
// 7 stages the reducer drives a loop through), investigatorRoleSchema (the
// read-only-role gate behind invariant 2 — L5 checks "builder" is rejected
// behaviorally but never pins WHICH roles are allowed), and LEARNING_EVENT_TYPES
// (used as the `E` event-type keys throughout but its namespaced string values
// are never asserted — a typo'd or renamed wire string would silently break the
// event log without any of the L-tests noticing, since they read the same const).
// Pin the exact memberships/values, and tie each stage/role/event back to what
// the rest of the suite actually relies on (self-consistency, no magic drift).
describe("learningLoop vocabulary — stage / role / event-type contracts", () => {
  it("pins the learning-loop stage enum membership and order", () => {
    expect(learningLoopStageSchema.options).toEqual([
      "failed",
      "investigating",
      "hypothesis_recorded",
      "verified",
      "rejected",
      "distilled",
      "consulted",
    ]);
  });

  it("every stage the happy path reaches is a member of the stage enum (no orphan stage)", () => {
    // these are the stages asserted by L1/L2/L6/L7/L10/L11 — they must all be declared
    for (const stage of ["failed", "hypothesis_recorded", "rejected", "distilled", "consulted"]) {
      expect(learningLoopStageSchema.options).toContain(stage);
    }
  });

  it("investigatorRoleSchema allows exactly the three read-only roles and rejects builder", () => {
    expect(investigatorRoleSchema.options).toEqual(["investigator", "verifier", "reviewer"]);
    // the role the L5 invariant-2 test relies on being rejected
    expect(investigatorRoleSchema.safeParse("builder").success).toBe(false);
    for (const role of investigatorRoleSchema.options) {
      expect(investigatorRoleSchema.safeParse(role).success).toBe(true);
    }
  });

  it("LEARNING_EVENT_TYPES pins the 8 namespaced wire strings used as the reducer's event keys", () => {
    expect(LEARNING_EVENT_TYPES).toEqual({
      failureRecorded: "learning.failure.recorded",
      investigationStarted: "learning.investigation.started",
      hypothesisRecorded: "learning.hypothesis.recorded",
      hypothesisVerified: "learning.hypothesis.verified",
      hypothesisRejected: "learning.hypothesis.rejected",
      distillationCandidateCreated: "learning.distillation.candidate_created",
      consultCompleted: "learning.consult.completed",
      consultSkipped: "learning.consult.skipped",
    });
    const values = Object.values(LEARNING_EVENT_TYPES);
    // every event type is a distinct, "learning."-namespaced string (no collisions, no stray prefix)
    expect(new Set(values).size).toBe(values.length);
    expect(values.every((v) => v.startsWith("learning."))).toBe(true);
  });
});
