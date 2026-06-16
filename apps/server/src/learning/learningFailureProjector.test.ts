import { describe, expect, it } from "vitest";
import {
  LEARNING_EVENT_TYPES,
  type EventEnvelope,
  type MemoryEvalReport,
  type SandboxErrorCard,
  type SkillArchiveCandidate,
  type SkillRuntimeActivationRecord,
  type VerificationReport,
} from "@ai-orchestrator/protocol";
import {
  learningFailureEnvelope,
  learningFailureEnvelopeFromArtifacts,
  learningFailureEventFromArtifacts,
  previewLearningRuntimeManifest,
  projectLearningLoopsFromEvents,
} from "./learningFailureProjector.js";

const FIXED_NOW = "2026-06-16T00:00:00.000Z";
const now = () => FIXED_NOW;

function observedFailedVerification(
  overrides: Partial<Pick<VerificationReport, "id" | "missionId" | "status" | "observed" | "globalRevisionDirective">> = {},
): Pick<VerificationReport, "id" | "missionId" | "status" | "observed" | "globalRevisionDirective"> {
  return {
    id: "vr_1",
    missionId: "mission_1",
    status: "failed",
    observed: true,
    globalRevisionDirective: "fix the failing build step",
    ...overrides,
  };
}

function observedErrorCard(
  overrides: Partial<Pick<SandboxErrorCard, "id" | "missionId" | "status" | "rootCause" | "truthStatus">> = {},
): Pick<SandboxErrorCard, "id" | "missionId" | "status" | "rootCause" | "truthStatus"> {
  return {
    id: "ec_1",
    missionId: "mission_1",
    status: "failed",
    rootCause: "TypeError: cannot read property of undefined",
    truthStatus: "observed",
    ...overrides,
  };
}

describe("learningFailureEventFromArtifacts (C1 delegation, evidence-gated)", () => {
  it("observed failed verification → produces a learning.failure event", () => {
    const event = learningFailureEventFromArtifacts({ verification: observedFailedVerification(), now });
    expect(event).not.toBeNull();
    expect(event!.type).toBe(LEARNING_EVENT_TYPES.failureRecorded);
    expect(event!.payload.failure.verificationReportId).toBe("vr_1");
    expect(event!.payload.failure.missionId).toBe("mission_1");
  });

  it("UNOBSERVED verification (observed=false) → NO event", () => {
    const event = learningFailureEventFromArtifacts({
      verification: observedFailedVerification({ observed: false }),
      now,
    });
    expect(event).toBeNull();
  });

  it("passing verification → NO event (not a failure signal)", () => {
    const event = learningFailureEventFromArtifacts({
      verification: observedFailedVerification({ status: "passed" }),
      now,
    });
    expect(event).toBeNull();
  });

  it("error card with truthStatus != observed → NO event", () => {
    const event = learningFailureEventFromArtifacts({
      errorCard: observedErrorCard({ truthStatus: "simulated" }),
      now,
    });
    expect(event).toBeNull();
  });

  it("observed error card → produces a learning.failure event when no verification", () => {
    const event = learningFailureEventFromArtifacts({ errorCard: observedErrorCard(), now });
    expect(event).not.toBeNull();
    expect(event!.payload.failure.sandboxErrorCardId).toBe("ec_1");
  });

  it("no artifacts → NO event", () => {
    expect(learningFailureEventFromArtifacts({ now })).toBeNull();
  });
});

describe("learningFailureEnvelope (pure mapping, no append)", () => {
  it("wraps a failure event into a deterministic, append-ready EventEnvelope", () => {
    const event = learningFailureEventFromArtifacts({ verification: observedFailedVerification(), now })!;
    const envelope = learningFailureEnvelope(event, now);
    expect(envelope.type).toBe(LEARNING_EVENT_TYPES.failureRecorded);
    expect(envelope.sessionId).toBe("mission_1");
    expect(envelope.source).toBe("server");
    expect(envelope.sourceTrust).toBe("trusted");
    // deterministic id: same failure → same envelope id (storage dedup-friendly)
    const again = learningFailureEnvelope(event, now);
    expect(again.id).toBe(envelope.id);
  });

  it("learningFailureEnvelopeFromArtifacts returns null when unobserved (writer-missing does not fake success)", () => {
    expect(
      learningFailureEnvelopeFromArtifacts({
        verification: observedFailedVerification({ observed: false }),
        now,
      }),
    ).toBeNull();
  });
});

describe("projectLearningLoopsFromEvents (replay determinism)", () => {
  it("replays the same learning loop from the same event stream", () => {
    const event = learningFailureEventFromArtifacts({ verification: observedFailedVerification(), now })!;
    const envelope = learningFailureEnvelope(event, now);
    const events: EventEnvelope[] = [envelope];

    const first = projectLearningLoopsFromEvents(events);
    const second = projectLearningLoopsFromEvents(events);

    expect(first).toHaveLength(1);
    expect(first[0]!.stage).toBe("failed");
    expect(first[0]!.missionId).toBe("mission_1");
    expect(first[0]!.failure?.verificationReportId).toBe("vr_1");
    // deterministic: identical replay
    expect(second).toEqual(first);
  });

  it("unobserved artifacts produce no failure event → derived loop set is empty", () => {
    const envelope = learningFailureEnvelopeFromArtifacts({
      verification: observedFailedVerification({ observed: false }),
      now,
    });
    expect(envelope).toBeNull();
    expect(projectLearningLoopsFromEvents([])).toEqual([]);
  });
});

describe("previewLearningRuntimeManifest (C3 delegation, no runtime load)", () => {
  function candidate(): SkillArchiveCandidate {
    return {
      id: "cand_1",
      missionId: "mission_1",
      source: "merge_pattern",
      title: "retry on transient network error",
      summary: "wrap fetch with bounded retry",
      triggerPatterns: ["ECONNRESET"],
      relatedFiles: [],
      confidence: "high",
      trustStatus: "curator_approved",
      createdAt: FIXED_NOW,
    };
  }

  function activation(): SkillRuntimeActivationRecord {
    return {
      candidateId: "cand_1",
      activationStatus: "active",
      evalRunId: "evalrun_1",
      activatedAt: FIXED_NOW,
    };
  }

  function passReport(): MemoryEvalReport {
    return {
      evalCaseId: "evalrun_1",
      k: 1,
      verdict: "pass",
      recallAtK: 1,
      expectedHitIds: [],
      missingExpectedIds: [],
      forbiddenHitIds: [],
      forbiddenHitRate: 0,
      staleHitIds: [],
      staleHitRate: 0,
      contradictedHitIds: [],
      supersededHitIds: [],
      unknownRetrievedIds: [],
      blockers: [],
      warnings: [],
    };
  }

  it("returns loadable/blocked data without side effects (no skill load, no spawn)", () => {
    const candidates = [candidate()];
    const activations = [activation()];
    const evalReportsByRunId = { evalrun_1: passReport() };

    const frozenInput = JSON.stringify({ candidates, activations, evalReportsByRunId });
    const manifest = previewLearningRuntimeManifest({ candidates, activations, evalReportsByRunId });

    expect(manifest.loadable.map((e) => e.candidateId)).toContain("cand_1");
    expect(manifest.blocked).toEqual([]);
    // pure: inputs unchanged, repeated call returns deep-equal result
    expect(JSON.stringify({ candidates, activations, evalReportsByRunId })).toBe(frozenInput);
    expect(previewLearningRuntimeManifest({ candidates, activations, evalReportsByRunId })).toEqual(manifest);
  });

  it("eval verdict fail → candidate blocked (no fake pass)", () => {
    const manifest = previewLearningRuntimeManifest({
      candidates: [candidate()],
      activations: [activation()],
      evalReportsByRunId: { evalrun_1: { ...passReport(), verdict: "fail" } },
    });
    expect(manifest.loadable).toEqual([]);
    expect(manifest.blocked.map((b) => b.candidateId)).toContain("cand_1");
  });
});
