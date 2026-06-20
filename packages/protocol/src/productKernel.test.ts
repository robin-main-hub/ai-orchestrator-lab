import { describe, expect, it } from "vitest";
import {
  missionClosedPayloadSchema,
  missionCreateRequestSchema,
  missionEventTypeSchema,
  missionKernelContractSchema,
  missionMergeRequestSchema,
  missionVerificationRecordedPayloadSchema,
  missionVerifyRequestSchema,
  missionWorkerAssignmentRequestSchema,
  sandboxExecResultSchema,
  sequentialMergeQueueItemSchema,
  verificationReportSchema,
} from "./productKernel.js";

// productKernel is all zod contracts and had no test today. Four of its schemas
// encode authority boundaries that must not silently drift:
//   (1) least-privilege wire request — missionWorkerAssignmentRequest carries
//       PROFILE FACTS ONLY (role, displayName, soulMode…). It has NO capability/
//       allowedTools/canMutateFiles field, and because z.object strips unknown
//       keys, a payload that tries to smuggle canMutateFiles=true is silently
//       dropped (the server recomputes capability from the role). Its soulMode/
//       configSource default to the conservative summary/internal.
//   (2) no self-asserted trust — missionCreateRequest.truthStatus defaults to
//       "planned" (a client can't claim observed), createdBy defaults to
//       "desktop", and the worker list is capped at 32.
//   (3) fixed side-effect boundary — missionKernelContract pins two literals
//       (sideEffectBoundary, personaPolicy); any other value is rejected.
//   (4) server-only checkpoint channel — the CLIENT append enum deliberately
//       omits "mission.checkpoint.created" (server-only), so a client cannot
//       forge a checkpoint event.
// Expected values are read off the schemas (self-consistent), never magic.

describe("missionWorkerAssignmentRequestSchema — least-privilege (capability is not on the wire)", () => {
  it("defaults soulMode→summary and configSource→internal for a bare role request", () => {
    const parsed = missionWorkerAssignmentRequestSchema.parse({ agentId: "a1", role: "companion", displayName: "친구" });
    expect(parsed.soulMode).toBe("summary");
    expect(parsed.configSource).toBe("internal");
  });

  it("silently strips a smuggled capability field — canMutateFiles can't ride in on a companion", () => {
    const parsed = missionWorkerAssignmentRequestSchema.parse({
      agentId: "a1",
      role: "companion",
      displayName: "친구",
      // these are NOT part of the request shape; z.object drops unknown keys
      canMutateFiles: true,
      allowedTools: ["bash", "write"],
      capability: { mode: "sandbox_build" },
    } as Record<string, unknown>);
    expect("canMutateFiles" in parsed).toBe(false);
    expect("allowedTools" in parsed).toBe(false);
    expect("capability" in parsed).toBe(false);
  });

  it("rejects an empty agentId / displayName (min(1)) — there is no anonymous worker", () => {
    expect(missionWorkerAssignmentRequestSchema.safeParse({ agentId: "", role: "builder", displayName: "x" }).success).toBe(false);
    expect(missionWorkerAssignmentRequestSchema.safeParse({ agentId: "a", role: "builder", displayName: "" }).success).toBe(false);
  });
});

describe("missionCreateRequestSchema — no self-asserted trust, bounded fan-out", () => {
  it("defaults truthStatus→planned (client can't claim observed) and createdBy→desktop", () => {
    const parsed = missionCreateRequestSchema.parse({ id: "m1", title: "t", goal: "g" });
    expect(parsed.truthStatus).toBe("planned");
    expect(parsed.createdBy).toBe("desktop");
    expect(parsed.workers).toEqual([]);
  });

  it("caps the worker fan-out at 32 (33 rejected)", () => {
    const mk = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ agentId: `a${i}`, role: "builder" as const, displayName: `w${i}` }));
    expect(missionCreateRequestSchema.safeParse({ id: "m1", title: "t", goal: "g", workers: mk(32) }).success).toBe(true);
    expect(missionCreateRequestSchema.safeParse({ id: "m1", title: "t", goal: "g", workers: mk(33) }).success).toBe(false);
  });

  it("requires non-empty id/title/goal and bounds goal at 4000 chars", () => {
    expect(missionCreateRequestSchema.safeParse({ id: "", title: "t", goal: "g" }).success).toBe(false);
    expect(missionCreateRequestSchema.safeParse({ id: "m", title: "t", goal: "g".repeat(4_001) }).success).toBe(false);
    expect(missionCreateRequestSchema.safeParse({ id: "m", title: "t", goal: "g".repeat(4_000) }).success).toBe(true);
  });
});

describe("missionKernelContractSchema — fixed side-effect boundary", () => {
  const base = {
    id: "k1",
    missionId: "m1",
    sideEffectBoundary: "mission_sandbox_verifier_merge" as const,
    personaPolicy: "preserve_character_voice_inside_capability_boundary" as const,
    sandboxRequiredForMutation: true,
    verifierRequiredForMerge: true,
    sequentialMergeRequired: true,
    truthStatusRequired: true,
    createdAt: "2026-06-21T00:00:00.000Z",
  };

  it("accepts the two canonical literals and rejects any other boundary/policy string", () => {
    expect(missionKernelContractSchema.safeParse(base).success).toBe(true);
    expect(missionKernelContractSchema.safeParse({ ...base, sideEffectBoundary: "completion_only" }).success).toBe(false);
    expect(missionKernelContractSchema.safeParse({ ...base, personaPolicy: "strip_for_safety" }).success).toBe(false);
  });
});

describe("missionEventTypeSchema — client append channel excludes server-only checkpoint", () => {
  it("admits exactly the six client-appendable event types", () => {
    expect(missionEventTypeSchema.options).toEqual([
      "mission.created",
      "mission.worker.assigned",
      "mission.artifact.attached",
      "mission.verification.recorded",
      "mission.merge.queued",
      "mission.closed",
    ]);
  });

  it("rejects mission.checkpoint.created — a client cannot forge a server-only checkpoint event", () => {
    expect(missionEventTypeSchema.safeParse("mission.checkpoint.created").success).toBe(false);
  });
});

// The four suites above pin the worker-request, mission-create, kernel-contract
// and event-channel boundaries — but the same file encodes more authority/honesty
// invariants that stay unpinned, all in the SAME spirit (least-privilege wire,
// no self-asserted trust, anti-fabrication, server-only observation):
//   (5) the merge sha is never accepted from the wire — missionMergeRequest takes
//       ONLY mergeQueueItemId; a smuggled mergeCommitSha/repoRoot is stripped (the
//       server records the real git rev-parse HEAD, a client can't inject one).
//   (6) the `observed` honesty flag is REQUIRED on a sandbox result and a
//       verification report — a result cannot omit whether it reflects real runner
//       output (no defaulting to a comfortable truth).
//   (7) the server-side downgrade flag defaults to the honest value
//       (observedDowngraded → false: nothing is presumed downgraded).
//   (8) a verify request must carry ≥1 command and ≤64, each bounded — no empty or
//       unbounded verification.
//   (9) a close is terminal-only (merged/failed/cancelled) — a mission can't be
//       "closed" back into running.
//   (10) a merge-queue item leaves mergeCommitSha undefined when absent (never
//        synthesized) and defaults conflictFiles to [].
// Expected values are read off the schemas (self-consistent), never magic.
describe("missionMergeRequestSchema — the merge sha is never accepted from the wire (anti-fabrication)", () => {
  it("accepts only mergeQueueItemId and silently strips a smuggled mergeCommitSha / repoRoot", () => {
    const parsed = missionMergeRequestSchema.parse({
      mergeQueueItemId: "q1",
      mergeCommitSha: "deadbeef", // not part of the shape — the server observes git rev-parse HEAD
      repoRoot: "/etc", // also not accepted from the client
    } as Record<string, unknown>);
    expect(parsed).toEqual({ mergeQueueItemId: "q1" });
    expect("mergeCommitSha" in parsed).toBe(false);
    expect("repoRoot" in parsed).toBe(false);
  });

  it("requires a non-empty mergeQueueItemId (min 1, max 256)", () => {
    expect(missionMergeRequestSchema.safeParse({ mergeQueueItemId: "" }).success).toBe(false);
    expect(missionMergeRequestSchema.safeParse({ mergeQueueItemId: "x".repeat(257) }).success).toBe(false);
    expect(missionMergeRequestSchema.safeParse({ mergeQueueItemId: "q1" }).success).toBe(true);
  });
});

describe("productKernel — observed-honesty is required, downgrade defaults to honest", () => {
  const execBase = { requestId: "r1", status: "completed" as const, observedAt: "2026-06-21T00:00:00.000Z" };
  const reportBase = {
    id: "v1",
    missionId: "m1",
    verifierAgentId: "agent_verifier",
    status: "passed" as const,
    checks: [],
    artifactIds: [],
    createdAt: "2026-06-21T00:00:00.000Z",
  };

  it("sandboxExecResult.observed and verificationReport.observed are REQUIRED — a result can't omit whether it's real", () => {
    expect(sandboxExecResultSchema.safeParse(execBase).success).toBe(false); // observed missing
    expect(sandboxExecResultSchema.safeParse({ ...execBase, observed: false }).success).toBe(true);
    expect(verificationReportSchema.safeParse(reportBase).success).toBe(false); // observed missing
    expect(verificationReportSchema.safeParse({ ...reportBase, observed: true }).success).toBe(true);
  });

  it("missionVerificationRecordedPayload.observedDowngraded defaults to false (nothing presumed downgraded)", () => {
    const payload = missionVerificationRecordedPayloadSchema.parse({
      missionId: "m1",
      report: { ...reportBase, observed: true },
    });
    expect(payload.observedDowngraded).toBe(false);
  });
});

describe("productKernel — bounded verify, terminal-only close, real-sha-only merge queue", () => {
  it("missionVerifyRequest needs ≥1 command and ≤64, each non-empty (no empty or unbounded verification)", () => {
    expect(missionVerifyRequestSchema.safeParse({ commands: [] }).success).toBe(false); // min 1
    expect(missionVerifyRequestSchema.safeParse({ commands: [""] }).success).toBe(false); // each min 1
    expect(missionVerifyRequestSchema.safeParse({ commands: Array.from({ length: 65 }, () => "x") }).success).toBe(false); // max 64
    expect(missionVerifyRequestSchema.safeParse({ commands: ["pnpm test"] }).success).toBe(true);
  });

  it("missionClosedPayload.status is terminal-only — a mission cannot be closed back into a live state", () => {
    for (const status of ["merged", "failed", "cancelled"]) {
      expect(missionClosedPayloadSchema.safeParse({ missionId: "m1", status }).success).toBe(true);
    }
    expect(missionClosedPayloadSchema.safeParse({ missionId: "m1", status: "running" }).success).toBe(false);
    expect(missionClosedPayloadSchema.safeParse({ missionId: "m1", status: "ready_to_merge" }).success).toBe(false);
  });

  it("sequentialMergeQueueItem leaves mergeCommitSha undefined when absent (never synthesized) and defaults conflictFiles to []", () => {
    const item = sequentialMergeQueueItemSchema.parse({
      id: "q1",
      missionId: "m1",
      branchName: "agent/mission_1",
      status: "queued",
      requiredVerificationReportId: "v1",
      reason: "queued for sequential merge",
      queuedAt: "2026-06-21T00:00:00.000Z",
    });
    expect(item.mergeCommitSha).toBeUndefined(); // a real sha appears only once the server observes it
    expect(item.conflictFiles).toEqual([]);
  });
});
