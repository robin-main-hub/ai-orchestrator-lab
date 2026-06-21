import { describe, expect, it } from "vitest";
import {
  canDistill,
  deriveLearningLoopById,
  deriveLearningLoopState,
  distilledLearningCandidateSchema,
  failureHypothesisSchema,
  failureInvestigationSchema,
  hypothesisVerificationSchema,
  investigatorRoleSchema,
  isObservedClaimValid,
  LEARNING_EVENT_TYPES,
  learningConsultCompletedPayloadSchema,
  learningConsultSkippedPayloadSchema,
  learningDistillationCandidateCreatedPayloadSchema,
  learningFailureRecordedPayloadSchema,
  learningFailureSchema,
  learningHypothesisRecordedPayloadSchema,
  learningHypothesisRejectedPayloadSchema,
  learningHypothesisVerifiedPayloadSchema,
  learningInvestigationStartedPayloadSchema,
  learningLoopRecordSchema,
  learningLoopStageSchema,
  memoryConsultRecordSchema,
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

// L1–L18 + the vocabulary suite cover the happy path, the six invariants and the
// stage/role/event enums — but several *non-regression / dedup / outcome-guard*
// arms of the reducer never fire, because every existing test applies each later
// event exactly once and in canonical order. The uncovered branches: (L19) an
// investigation arriving AFTER the loop already passed "failed" records itself
// without pulling the stage back to "investigating"; (L20) a second verification
// of an already-verified hypothesis is idempotent on verifiedHypothesisIds yet
// still appends to the raw verifications log (id-set dedup ≠ append); (L21) a
// verification landing AFTER "distilled" must not regress the stage to "verified";
// (L22) the outcome guards — a "verified"-outcome payload on the rejected event,
// and the reverse, are both dropped; (L23) a rejection landing once a sibling is
// already verified keeps canDistill true so the loop stays out of "rejected", and
// the rejected-id set dedups; (L24) the consult outcome guard — a "skipped"
// payload on the completed event, and the reverse, are ignored. All expectations
// derive from the same factories the suite already trusts (no magic drift).
describe("deriveLearningLoopState — non-regression + dedup + outcome guards", () => {
  it("(L19) an investigation arriving after the loop passed 'failed' records itself but does not regress the stage", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis() } }, // stage → hypothesis_recorded
        { type: E.investigationStarted, payload: { investigation: investigation() } }, // late investigation
      ],
      LOOP,
    );
    expect(loop?.investigation?.id).toBe("inv_1"); // still recorded
    expect(loop?.stage).toBe("hypothesis_recorded"); // NOT pulled back to "investigating"
    expect(loop?.updatedAt).toBe(investigation().startedAt); // last applied event still owns updatedAt
  });

  it("(L20) a second verification of an already-verified hypothesis dedups the id-set but still appends to the verifications log", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis() } },
        { type: E.hypothesisVerified, payload: { verification: verified() } },
        { type: E.hypothesisVerified, payload: { verification: verified({ verifiedAt: "2026-06-16T00:05:00Z" }) } },
      ],
      LOOP,
    );
    expect(loop?.verifiedHypothesisIds).toEqual(["hyp_1"]); // deduped — counted once
    expect(loop?.verifications).toHaveLength(2); // raw log appends both
    expect(loop?.updatedAt).toBe("2026-06-16T00:05:00Z"); // latest verification wins
  });

  it("(L21) a verification arriving after 'distilled' does not regress the stage back to 'verified'", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis() } },
        { type: E.hypothesisVerified, payload: { verification: verified() } },
        { type: E.distillationCandidateCreated, payload: { candidate: candidate() } }, // stage → distilled
        { type: E.hypothesisVerified, payload: { verification: verified({ verifiedAt: "2026-06-16T00:06:00Z" }) } },
      ],
      LOOP,
    );
    expect(loop?.stage).toBe("distilled"); // not regressed
    expect(loop?.distillation?.id).toBe("distill_1");
  });

  it("(L22) outcome guards: a 'verified'-outcome payload on the rejected event (and the reverse) is dropped", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis() } },
        // verified-outcome payload mis-routed to the rejected event → ignored
        { type: E.hypothesisRejected, payload: { verification: verified() } },
        // rejected-outcome payload mis-routed to the verified event → ignored
        { type: E.hypothesisVerified, payload: { verification: rejected() } },
      ],
      LOOP,
    );
    expect(loop?.verifiedHypothesisIds).toEqual([]);
    expect(loop?.rejectedHypothesisIds).toEqual([]);
    expect(loop?.verifications).toEqual([]); // neither mis-routed payload reached the log
    expect(loop?.stage).toBe("hypothesis_recorded"); // nothing advanced
  });

  it("(L23) a rejection landing after a sibling is verified keeps the loop out of 'rejected' and dedups the rejected-id set", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis({ id: "hyp_1" }) } },
        { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis({ id: "hyp_2" }) } },
        { type: E.hypothesisVerified, payload: { verification: verified({ hypothesisId: "hyp_1" }) } }, // stage → verified, canDistill true
        { type: E.hypothesisRejected, payload: { verification: rejected({ hypothesisId: "hyp_2" }) } },
        {
          type: E.hypothesisRejected,
          payload: { verification: rejected({ hypothesisId: "hyp_2", verifiedAt: "2026-06-16T00:07:00Z" }) },
        },
      ],
      LOOP,
    );
    expect(loop?.stage).toBe("verified"); // canDistill stayed true → NOT flipped to "rejected"
    expect(loop?.rejectedHypothesisIds).toEqual(["hyp_2"]); // deduped despite two reject events
    expect(loop?.verifications).toHaveLength(3); // 1 verified + 2 rejected, all appended to the raw log
  });

  it("(L24) consult outcome guards: a 'skipped' payload on the completed event (and the reverse) is ignored", () => {
    const loop = deriveLearningLoopById(
      [
        { type: E.failureRecorded, payload: { failure: failure() } },
        // skipped-outcome consult (with a valid skipReason) mis-routed to the completed event → ignored
        { type: E.consultCompleted, payload: { consult: { ...consult(), outcome: "skipped", skipReason: "n/a" } } },
        // completed-outcome consult mis-routed to the skipped event → ignored
        { type: E.consultSkipped, payload: { consult: { ...consult(), outcome: "completed" } } },
      ],
      LOOP,
    );
    expect(loop?.consult).toBeUndefined();
    expect(loop?.stage).toBe("failed"); // neither mis-routed consult closed the loop
  });
});

// The existing suite exercises these records through the reducer/derive helpers,
// which build already-typed objects — so the SCHEMA-level refinement invariants
// (the validation boundary for data arriving from EventStorage/API) stay
// unpinned. They encode the learning loop's epistemic honesty and are worth
// pinning directly: a failure must cite real evidence to open a loop (no guessed
// failures), a hypothesis must reference >=1 evidence ref (no empty speculation),
// an observed verification must carry evidence, a distilled lesson is ALWAYS born
// "suggested" (never auto-trusted), and a skipped consult must state why. Reuse
// the suite's own factories so the valid baseline is self-consistent.
describe("learningLoop — schema-level epistemic-honesty refinements (the validation boundary)", () => {
  it("a failure needs at least one evidence id (sandboxErrorCard or verificationReport) — a guessed failure can't open a loop", () => {
    expect(learningFailureSchema.safeParse(failure()).success).toBe(true); // factory cites verificationReportId
    expect(learningFailureSchema.safeParse(failure({ verificationReportId: undefined, sandboxErrorCardId: "ec_1" })).success).toBe(true);
    // neither id present → refinement rejects (no ungrounded failure)
    expect(learningFailureSchema.safeParse(failure({ verificationReportId: undefined })).success).toBe(false);
  });

  it("a hypothesis must reference >=1 evidence ref — empty speculation is rejected", () => {
    expect(failureHypothesisSchema.safeParse(hypothesis()).success).toBe(true);
    expect(failureHypothesisSchema.safeParse(hypothesis({ evidenceRefs: [] })).success).toBe(false);
  });

  it("a verification has a closed 3-outcome set, and an OBSERVED claim must carry evidence (invariant 6)", () => {
    expect(hypothesisVerificationSchema.safeParse(verified()).success).toBe(true); // observed + evidence
    expect(hypothesisVerificationSchema.safeParse(verified({ outcome: "maybe" as never })).success).toBe(false); // not in {verified,rejected,inconclusive}
    // observed but no evidence → rejected; the same claim demoted to a non-observed truthStatus is allowed empty
    expect(hypothesisVerificationSchema.safeParse(verified({ evidenceRefs: [] })).success).toBe(false);
    expect(hypothesisVerificationSchema.safeParse(verified({ truthStatus: "configured", evidenceRefs: [] })).success).toBe(true);
  });

  it("a distilled candidate is ALWAYS born trustStatus='suggested' (never auto-trusted) and must cite >=1 evidence ref", () => {
    expect(distilledLearningCandidateSchema.safeParse(candidate()).success).toBe(true);
    // the literal forbids self-promotion to trusted/active at birth
    expect(distilledLearningCandidateSchema.safeParse(candidate({ trustStatus: "trusted" as never })).success).toBe(false);
    expect(distilledLearningCandidateSchema.safeParse(candidate({ trustStatus: "active" as never })).success).toBe(false);
    expect(distilledLearningCandidateSchema.safeParse(candidate({ evidenceRefs: [] })).success).toBe(false);
  });

  it("a skipped consult must state a non-empty skipReason (invariant 5); an investigation defaults evidenceRefs to []", () => {
    expect(memoryConsultRecordSchema.safeParse(consult()).success).toBe(true); // completed
    expect(memoryConsultRecordSchema.safeParse(consult({ outcome: "skipped" })).success).toBe(false); // no reason
    expect(memoryConsultRecordSchema.safeParse(consult({ outcome: "skipped", skipReason: "   " })).success).toBe(false); // whitespace-only
    expect(memoryConsultRecordSchema.safeParse(consult({ outcome: "skipped", skipReason: "no relevant memory" })).success).toBe(true);
    // the investigation record fills evidenceRefs→[] when omitted (honest empty observation trail)
    const { evidenceRefs: _drop, ...noRefs } = investigation();
    const parsed = failureInvestigationSchema.parse(noRefs);
    expect(parsed.evidenceRefs).toEqual([]);
  });
});

// The wrapper payload schemas (one per learning event) are thin single-key
// envelopes around the record schemas pinned above. The previous describe pinned
// the records DIRECTLY; the reducer consumes them through these envelopes via
// safeParse. What stays unpinned: (1) that each envelope is TRANSITIVE — a broken
// inner record (no evidence, empty speculation, observed-without-evidence,
// auto-trusted distillation, reasonless skip) sinks the whole payload, so the
// reducer's `if (!parsed.success) break` honestly refuses to advance; (2) that the
// envelope REQUIRES exactly its one key and STRIPS any smuggled sibling (plain
// z.object) — payloads can't carry side-channel authority; (3) the load-bearing
// fact that verified/rejected payloads are STRUCTURALLY IDENTICAL (both wrap
// hypothesisVerificationSchema) — the schema is permissive about outcome and the
// REDUCER, not the schema, enforces verified⇒"verified"/rejected⇒"rejected"; and
// (4) the aggregate learningLoopRecordSchema requires its four arrays (no default)
// while keeping the lifecycle facets optional (never fabricated before observed).
describe("learningLoop — event payload envelopes: transitive validity, no-smuggle, schema-vs-reducer authority", () => {
  it("every envelope is transitive — a broken inner record sinks the payload (the reducer's refusal boundary)", () => {
    expect(learningFailureRecordedPayloadSchema.safeParse({ failure: failure() }).success).toBe(true);
    expect(learningFailureRecordedPayloadSchema.safeParse({ failure: failure({ verificationReportId: undefined }) }).success).toBe(false);
    expect(learningHypothesisRecordedPayloadSchema.safeParse({ hypothesis: hypothesis() }).success).toBe(true);
    expect(learningHypothesisRecordedPayloadSchema.safeParse({ hypothesis: hypothesis({ evidenceRefs: [] }) }).success).toBe(false);
    expect(learningHypothesisVerifiedPayloadSchema.safeParse({ verification: verified({ evidenceRefs: [] }) }).success).toBe(false); // observed-without-evidence
    expect(learningDistillationCandidateCreatedPayloadSchema.safeParse({ candidate: candidate({ trustStatus: "trusted" as never }) }).success).toBe(false);
    expect(learningConsultSkippedPayloadSchema.safeParse({ consult: consult({ outcome: "skipped" }) }).success).toBe(false); // reasonless skip
  });

  it("each envelope REQUIRES exactly its single key — the wrong/missing key is rejected", () => {
    expect(learningFailureRecordedPayloadSchema.safeParse({}).success).toBe(false);
    expect(learningInvestigationStartedPayloadSchema.safeParse({}).success).toBe(false);
    expect(learningConsultCompletedPayloadSchema.safeParse({}).success).toBe(false);
    // a failure record placed under the wrong envelope key does not satisfy it
    expect(learningInvestigationStartedPayloadSchema.safeParse({ failure: failure() }).success).toBe(false);
    expect(learningInvestigationStartedPayloadSchema.safeParse({ investigation: investigation() }).success).toBe(true);
  });

  it("envelopes STRIP smuggled sibling keys (plain z.object) — no side-channel authority rides along", () => {
    const parsed = learningFailureRecordedPayloadSchema.parse({ failure: failure(), forcedStage: "consulted", trustStatus: "trusted" });
    expect(parsed).toEqual({ failure: failure() });
    expect("forcedStage" in parsed).toBe(false);
    expect("trustStatus" in parsed).toBe(false);
  });

  it("verified and rejected payloads are STRUCTURALLY identical — the schema is permissive, the reducer enforces the outcome", () => {
    // both envelopes accept EITHER outcome — neither schema pins outcome to its own name
    expect(learningHypothesisVerifiedPayloadSchema.safeParse({ verification: rejected() }).success).toBe(true);
    expect(learningHypothesisRejectedPayloadSchema.safeParse({ verification: verified() }).success).toBe(true);
    // so a verified-event carrying a rejected verification PARSES, but the reducer drops it (outcome guard),
    // and the loop never records it as a verified hypothesis.
    const events = [
      { type: E.failureRecorded, payload: { failure: failure() } },
      { type: E.hypothesisRecorded, payload: { hypothesis: hypothesis() } },
      { type: E.hypothesisVerified, payload: { verification: rejected({ hypothesisId: hypothesis().id }) } },
    ];
    const loops = deriveLearningLoopState(events);
    expect(loops[0]!.verifiedHypothesisIds).toEqual([]); // schema let it through, reducer refused
  });

  it("the aggregate record requires its four arrays (no default) but keeps lifecycle facets optional (never fabricated)", () => {
    const minimal = {
      loopId: LOOP,
      missionId: MISSION,
      stage: "failed" as const,
      hypotheses: [],
      verifications: [],
      verifiedHypothesisIds: [],
      rejectedHypothesisIds: [],
    };
    const parsed = learningLoopRecordSchema.parse(minimal);
    expect(parsed.failure).toBeUndefined();
    expect(parsed.investigation).toBeUndefined();
    expect(parsed.distillation).toBeUndefined();
    expect(parsed.consult).toBeUndefined();
    expect(parsed.updatedAt).toBeUndefined();
    // omitting a required array is rejected — there is no silent default
    const { hypotheses: _h, ...noHyps } = minimal;
    expect(learningLoopRecordSchema.safeParse(noHyps).success).toBe(false);
    // and the record is transitive too — an embedded broken facet sinks it
    expect(learningLoopRecordSchema.safeParse({ ...minimal, distillation: candidate({ evidenceRefs: [] }) }).success).toBe(false);
  });
});
