import { describe, expect, it } from "vitest";
import {
  missionCreateRequestSchema,
  missionEventTypeSchema,
  missionKernelContractSchema,
  missionWorkerAssignmentRequestSchema,
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
