import { describe, expect, it } from "vitest";
import {
  deriveLearningFailureEvent,
  deriveLearningFailureFromErrorCard,
  deriveLearningFailureFromVerification,
  deriveLearningLoopId,
  type LearningFailureEvent,
} from "./learningLoopWiring.js";
import { deriveLearningLoopState, LEARNING_EVENT_TYPES } from "./learningLoop.js";
import type { VerificationReport } from "./productKernel.js";
import type { SandboxErrorCard } from "./sandboxErrorCard.js";

const T = () => "2026-06-16T00:00:00.000Z";

function verification(over: Partial<VerificationReport> = {}): VerificationReport {
  return {
    id: "vr_1",
    missionId: "m_1",
    verifierAgentId: "verifier_1",
    status: "failed",
    checks: [],
    artifactIds: ["art_1"],
    observed: true,
    createdAt: "2026-06-16T00:00:00.000Z",
    ...over,
  };
}

function errorCard(over: Partial<SandboxErrorCard> = {}): SandboxErrorCard {
  return {
    id: "ec_1",
    missionId: "m_1",
    runnerKind: "local_shell",
    status: "failed",
    rootCause: "TypeError: cannot read x of undefined",
    directive: "guard nullable",
    stderrPreview: "…",
    createdAt: "2026-06-16T00:00:00.000Z",
    truthStatus: "observed",
    ...over,
  };
}

describe("deriveLearningFailureFromVerification — evidence required + observed", () => {
  it("(C1-1) observed failed verification → failure event anchored by verificationReportId", () => {
    const ev = deriveLearningFailureFromVerification(verification(), T);
    expect(ev).not.toBeNull();
    expect(ev!.type).toBe(LEARNING_EVENT_TYPES.failureRecorded);
    expect(ev!.payload.failure.verificationReportId).toBe("vr_1");
    expect(ev!.payload.failure.loopId).toBe(deriveLearningLoopId("m_1", "vr_1"));
  });

  it("(C1-2) blocked + observed also opens a loop", () => {
    expect(deriveLearningFailureFromVerification(verification({ status: "blocked" }), T)).not.toBeNull();
  });

  it("(C1-3) passed/pending → null (not a learning trigger)", () => {
    expect(deriveLearningFailureFromVerification(verification({ status: "passed" }), T)).toBeNull();
    expect(deriveLearningFailureFromVerification(verification({ status: "pending" }), T)).toBeNull();
  });

  it("(C1-4) observed=false → null (no learning from simulated result)", () => {
    expect(deriveLearningFailureFromVerification(verification({ observed: false }), T)).toBeNull();
  });

  it("(C1-5) globalRevisionDirective becomes the summary when present", () => {
    const ev = deriveLearningFailureFromVerification(
      verification({ globalRevisionDirective: "narrow the type at call site" }),
      T,
    );
    expect(ev!.payload.failure.summary).toContain("narrow the type");
  });
});

describe("deriveLearningFailureFromErrorCard — observed truthStatus required", () => {
  it("(C1-6) observed failed error card → failure event anchored by sandboxErrorCardId", () => {
    const ev = deriveLearningFailureFromErrorCard(errorCard(), T);
    expect(ev).not.toBeNull();
    expect(ev!.payload.failure.sandboxErrorCardId).toBe("ec_1");
    expect(ev!.payload.failure.summary).toContain("TypeError");
  });

  it("(C1-7) timeout/blocked error cards also open a loop", () => {
    expect(deriveLearningFailureFromErrorCard(errorCard({ status: "timeout" }), T)).not.toBeNull();
    expect(deriveLearningFailureFromErrorCard(errorCard({ status: "blocked" }), T)).not.toBeNull();
  });

  it("(C1-8) non-observed truthStatus → null (no fake observed learning)", () => {
    expect(deriveLearningFailureFromErrorCard(errorCard({ truthStatus: "simulated" }), T)).toBeNull();
    expect(deriveLearningFailureFromErrorCard(errorCard({ truthStatus: "planned" }), T)).toBeNull();
  });
});

describe("deriveLearningFailureEvent — unified, evidence-gated", () => {
  it("(C1-9) verification preferred when both present", () => {
    const ev = deriveLearningFailureEvent({ verification: verification(), errorCard: errorCard(), now: T });
    expect(ev!.payload.failure.verificationReportId).toBe("vr_1");
    expect(ev!.payload.failure.sandboxErrorCardId).toBeUndefined();
  });

  it("(C1-10) falls back to error card when verification not a trigger", () => {
    const ev = deriveLearningFailureEvent({
      verification: verification({ status: "passed" }),
      errorCard: errorCard(),
      now: T,
    });
    expect(ev!.payload.failure.sandboxErrorCardId).toBe("ec_1");
  });

  it("(C1-11) no evidence at all → null (no learning from plain complaints)", () => {
    expect(deriveLearningFailureEvent({ now: T })).toBeNull();
  });

  it("(C1-12) both non-observed → null", () => {
    const ev = deriveLearningFailureEvent({
      verification: verification({ observed: false }),
      errorCard: errorCard({ truthStatus: "simulated" }),
      now: T,
    });
    expect(ev).toBeNull();
  });
});

describe("integration with learningLoop reducer", () => {
  it("(C1-13) emitted event actually opens a loop in deriveLearningLoopState", () => {
    const ev = deriveLearningFailureEvent({ verification: verification(), now: T }) as LearningFailureEvent;
    const loops = deriveLearningLoopState([ev]);
    expect(loops).toHaveLength(1);
    expect(loops[0]!.stage).toBe("failed");
    expect(loops[0]!.missionId).toBe("m_1");
  });

  it("(C1-14) deterministic — same input yields identical event", () => {
    expect(deriveLearningFailureFromVerification(verification(), T)).toEqual(
      deriveLearningFailureFromVerification(verification(), T),
    );
  });
});
