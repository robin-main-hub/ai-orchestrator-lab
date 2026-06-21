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
  debateControlPolicySchema,
  orchestrationMissionSchema,
  orchestrationMissionStatusSchema,
  missionArtifactKindSchema,
  missionArtifactRefSchema,
  missionCapabilityModeSchema,
  missionToolNameSchema,
  missionWorkerAssignmentSchema,
  missionWorkerCapabilitySchema,
  missionWorkerStatusSchema,
  verificationCheckSchema,
  verificationCheckStatusSchema,
  hermesContinuityPolicySchema,
  personaContinuitySpecSchema,
  personaIdentityFileKindSchema,
  personaIdentityFileRefSchema,
  personaVoicePreservationSchema,
  sandboxCaptureResultSchema,
  sandboxExecRequestSchema,
  sandboxExecResultSchema,
  sandboxExecStatusSchema,
  sandboxIsolationLevelSchema,
  sandboxKindSchema,
  sandboxNetworkPolicySchema,
  sandboxPreflightResultSchema,
  sandboxResourceLimitsSchema,
  sandboxRunModeSchema,
  sandboxWorkspacePolicySchema,
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

// The suites above pin the mission/merge/verify authority boundaries, plus the
// observed-honesty flag on a sandbox *result*. But the SANDBOX CAPABILITY half of
// productKernel — the seam where coding execution stops depending on tmux and
// becomes an isolation-typed contract — is otherwise unpinned (sandboxExecResult
// is the only sandbox schema touched today). These schemas encode the
// isolation/least-privilege boundary every runner must honor:
//   (11) deny/off ordering — sandboxKind and sandboxIsolationLevel both lead with
//        their inert option ("disabled"/"none"): the most-isolated default sorts
//        first, the escalating capability tiers follow.
//   (12) network is deny-by-default DATA — allowedHosts defaults to [] (no implicit
//        host is reachable) and a `reason` is REQUIRED (a policy can't be silent);
//        mode is a closed {disabled,allowlist,full}.
//   (13) no unbounded run — timeoutSeconds AND maxOutputBytes are REQUIRED positive
//        ints (a run can't be infinite or produce unbounded output); cpu/mem/disk
//        are optional positive caps.
//   (14) nothing writable unless named — writablePaths/readOnlyPaths default to []
//        and cleanup is a closed 3-value disposal enum; repoRoot is required.
//   (15) the run mode is a closed {read_only,verify,build,merge_recommend} ladder
//        (read_only first = least privilege); an exec request names mission+worker.
//   (16) honest preflight + status — a preflight cannot omit allowed/requiresApproval
//        (no defaulting to a comfortable allow), the exec status is a closed
//        {completed,failed,blocked,timeout} (honest failure states, no bare "ok"),
//        and a capture is observation-timestamped.
// Expected values are read off the schemas (self-consistent), never magic.
describe("productKernel — sandbox capability boundary: deny/off-by-default, bounded, honest", () => {
  it("sandboxKind and sandboxIsolationLevel both lead with their inert (most-isolated) option", () => {
    expect(sandboxKindSchema.options).toEqual([
      "disabled",
      "legacy_tmux",
      "local_process",
      "docker_rootless",
      "docker_gvisor",
      "firecracker",
      "remote_codex",
      "remote_opencode",
    ]);
    expect(sandboxKindSchema.options[0]).toBe("disabled"); // off is the first-listed kind
    expect(sandboxIsolationLevelSchema.options).toEqual([
      "none",
      "process",
      "container",
      "user_space_kernel",
      "microvm",
      "remote_managed",
    ]);
    expect(sandboxIsolationLevelSchema.options[0]).toBe("none");
  });

  it("network policy is deny-by-default DATA — allowedHosts defaults to [], reason required, mode closed", () => {
    const parsed = sandboxNetworkPolicySchema.parse({ mode: "disabled", reason: "no egress for read-only runs" });
    expect(parsed.allowedHosts).toEqual([]); // no implicit host is reachable
    // a policy can't be silent about WHY
    expect(sandboxNetworkPolicySchema.safeParse({ mode: "disabled" }).success).toBe(false);
    // mode vocabulary is closed
    expect(sandboxNetworkPolicySchema.safeParse({ mode: "vpn", reason: "x" }).success).toBe(false);
    for (const mode of ["disabled", "allowlist", "full"]) {
      expect(sandboxNetworkPolicySchema.safeParse({ mode, reason: "x" }).success).toBe(true);
    }
  });

  it("resource limits forbid an unbounded run — timeoutSeconds and maxOutputBytes are REQUIRED positive ints", () => {
    const ok = sandboxResourceLimitsSchema.parse({ timeoutSeconds: 60, maxOutputBytes: 1_000_000 });
    expect(ok.cpuCores).toBeUndefined(); // optional caps stay unset, not fabricated
    expect(sandboxResourceLimitsSchema.safeParse({ maxOutputBytes: 1 }).success).toBe(false); // no timeout
    expect(sandboxResourceLimitsSchema.safeParse({ timeoutSeconds: 1 }).success).toBe(false); // no output cap
    expect(sandboxResourceLimitsSchema.safeParse({ timeoutSeconds: 0, maxOutputBytes: 1 }).success).toBe(false); // positive
    expect(sandboxResourceLimitsSchema.safeParse({ timeoutSeconds: 1.5, maxOutputBytes: 1 }).success).toBe(false); // int
    expect(sandboxResourceLimitsSchema.safeParse({ timeoutSeconds: 1, maxOutputBytes: 1, memoryMb: 1.5 }).success).toBe(false); // int cap
    expect(sandboxResourceLimitsSchema.safeParse({ timeoutSeconds: 1, maxOutputBytes: 1, cpuCores: 0.5 }).success).toBe(true); // fractional cores allowed
  });

  it("workspace policy: nothing writable unless named (paths default []), cleanup is a closed disposal enum", () => {
    const parsed = sandboxWorkspacePolicySchema.parse({ repoRoot: "/repo", cleanup: "destroy_on_success" });
    expect(parsed.writablePaths).toEqual([]); // nothing is writable by default
    expect(parsed.readOnlyPaths).toEqual([]);
    expect(parsed.worktreePath).toBeUndefined(); // optional, not fabricated
    expect(sandboxWorkspacePolicySchema.safeParse({ cleanup: "destroy_on_success" }).success).toBe(false); // repoRoot required
    expect(sandboxWorkspacePolicySchema.safeParse({ repoRoot: "/repo", cleanup: "leak" }).success).toBe(false); // closed enum
    for (const cleanup of ["destroy_on_success", "keep_on_failure", "keep_until_manual_cleanup"]) {
      expect(sandboxWorkspacePolicySchema.safeParse({ repoRoot: "/repo", cleanup }).success).toBe(true);
    }
  });

  it("run mode is a closed least-first ladder and an exec request names mission+worker+command", () => {
    expect(sandboxRunModeSchema.options).toEqual(["read_only", "verify", "build", "merge_recommend"]);
    expect(sandboxRunModeSchema.options[0]).toBe("read_only"); // least privilege leads
    const req = sandboxExecRequestSchema.parse({
      id: "x1",
      missionId: "m1",
      workerId: "w1",
      command: "pnpm test",
      mode: "verify",
      createdAt: "2026-06-21T00:00:00.000Z",
    });
    expect(req.cwd).toBeUndefined(); // optional, not fabricated
    expect(req.timeoutMs).toBeUndefined();
    expect(sandboxExecRequestSchema.safeParse({ ...req, mode: "deploy" }).success).toBe(false); // not on the ladder
    expect(sandboxExecRequestSchema.safeParse({ ...req, timeoutMs: 1.5 }).success).toBe(false); // positive int only
  });

  it("preflight cannot omit allowed/requiresApproval; exec status is closed; capture is observation-timestamped", () => {
    // a preflight must state BOTH whether it's allowed and whether approval is still needed
    expect(sandboxPreflightResultSchema.safeParse({ reason: "ok" }).success).toBe(false);
    expect(sandboxPreflightResultSchema.safeParse({ allowed: true, reason: "ok" }).success).toBe(false); // requiresApproval missing
    const pf = sandboxPreflightResultSchema.parse({ allowed: true, requiresApproval: true, reason: "build needs human approval" });
    expect(pf.requiresApproval).toBe(true);
    // honest failure states, no bare "ok"/"success"
    expect(sandboxExecStatusSchema.options).toEqual(["completed", "failed", "blocked", "timeout"]);
    expect(sandboxExecStatusSchema.options).not.toContain("ok");
    // a capture carries the moment it was observed
    expect(sandboxCaptureResultSchema.safeParse({ workerId: "w1", outputPreview: "x" }).success).toBe(false); // observedAt missing
    const cap = sandboxCaptureResultSchema.parse({ workerId: "w1", outputPreview: "x", observedAt: "2026-06-21T00:00:00.000Z" });
    expect(cap.observedAt).toBe("2026-06-21T00:00:00.000Z");
  });
});

// The mission/merge/verify and sandbox-capability boundaries are now pinned, but
// the PERSONA-CONTINUITY half of productKernel — the schemas behind the kernel's
// `preserve_character_voice_inside_capability_boundary` policy — is still unpinned.
// These encode an unusual authority invariant: the runtime must NOT flatten a
// character's voice merely to sound generic; safety can constrain ACTIONS but the
// voice posture has to be stated explicitly, never silently defaulted away.
//   (17) an identity-file ref is fully specified — kind / path / required / truth
//        are all mandatory; `required` has NO default, so a file can't be silently
//        optional, and the kind vocabulary is closed (SOUL/AGENTS/IDENTITY/USER/
//        LOREBOOK).
//   (18) the hermes continuity policy carries closed restore/promotion enums, each
//        with an explicit "off" escape (continuity can be turned off, but only by
//        naming it) — sticky/slotId/memoryScope are required.
//   (19) voice preservation cannot be silently omitted — all three voice booleans,
//        the forbiddenSuppressionReasons array, AND the safetyOverrideNote are
//        REQUIRED (the reasons list has no default: a runtime must state, even as
//        [], what it may not suppress).
//   (20) the continuity spec composes those with closed soulMode/configSource enums
//        (each with a conservative "off") and the nested voice/hermes/identityFiles
//        are NON-OPTIONAL — character continuity is structural, not a bolt-on.
// Expected values are read off the schemas (self-consistent), never magic.
describe("productKernel — persona continuity: voice posture is explicit, never silently defaulted away", () => {
  const ref = { kind: "SOUL" as const, path: "SOUL.md", required: true, truthStatus: "configured" as const };
  const hermes = {
    slotId: "s1",
    sticky: true,
    memoryScope: "mission",
    restorePolicy: "restore_when_available" as const,
    promotionPolicy: "curator_required" as const,
  };
  const voice = {
    preserveCharacterVoice: true,
    allowSpeechQuirks: true,
    allowEmotionalColor: true,
    forbiddenSuppressionReasons: [] as string[],
    safetyOverrideNote: "safety may constrain actions, not voice",
  };
  const spec = {
    agentId: "a1",
    personaSlug: "p",
    displayName: "친구",
    role: "companion" as const,
    soulMode: "summary" as const,
    configSource: "internal" as const,
    identityFiles: [ref],
    hermes,
    voice,
  };

  it("an identity-file ref is fully specified — kind/path/required/truthStatus all mandatory, kind closed", () => {
    expect(personaIdentityFileKindSchema.options).toEqual(["SOUL", "AGENTS", "IDENTITY", "USER", "LOREBOOK"]);
    expect(personaIdentityFileRefSchema.safeParse(ref).success).toBe(true);
    const { required: _r, ...withoutRequired } = ref;
    expect(personaIdentityFileRefSchema.safeParse(withoutRequired).success).toBe(false); // `required` has no default
    const { truthStatus: _t, ...withoutTruth } = ref;
    expect(personaIdentityFileRefSchema.safeParse(withoutTruth).success).toBe(false);
    expect(personaIdentityFileRefSchema.safeParse({ ...ref, kind: "PROMPT" }).success).toBe(false); // closed vocabulary
  });

  it("hermes continuity exposes closed restore/promotion enums, each with an explicit 'off' escape", () => {
    expect(hermesContinuityPolicySchema.shape.restorePolicy.options).toEqual([
      "always_restore",
      "restore_when_available",
      "summary_only",
      "off",
    ]);
    expect(hermesContinuityPolicySchema.shape.promotionPolicy.options).toEqual([
      "curator_required",
      "trusted_auto_promote",
      "off",
    ]);
    expect(hermesContinuityPolicySchema.shape.restorePolicy.options).toContain("off"); // continuity is turn-off-able, by name
    expect(hermesContinuityPolicySchema.shape.promotionPolicy.options).toContain("off");
    expect(hermesContinuityPolicySchema.safeParse(hermes).success).toBe(true);
    const { sticky: _s, ...withoutSticky } = hermes;
    expect(hermesContinuityPolicySchema.safeParse(withoutSticky).success).toBe(false); // sticky required
    expect(hermesContinuityPolicySchema.safeParse({ ...hermes, restorePolicy: "maybe" }).success).toBe(false);
  });

  it("voice preservation cannot be silently omitted — all booleans, the reasons array, and the note are REQUIRED", () => {
    expect(personaVoicePreservationSchema.safeParse(voice).success).toBe(true);
    // the reasons list has NO default — a runtime must state, even as [], what it may not suppress
    const { forbiddenSuppressionReasons: _f, ...withoutReasons } = voice;
    expect(personaVoicePreservationSchema.safeParse(withoutReasons).success).toBe(false);
    const { safetyOverrideNote: _n, ...withoutNote } = voice;
    expect(personaVoicePreservationSchema.safeParse(withoutNote).success).toBe(false);
    const { preserveCharacterVoice: _p, ...withoutFlag } = voice;
    expect(personaVoicePreservationSchema.safeParse(withoutFlag).success).toBe(false);
    // an explicit empty reasons list is valid (stated, not defaulted)
    expect(personaVoicePreservationSchema.parse(voice).forbiddenSuppressionReasons).toEqual([]);
  });

  it("the continuity spec has closed soulMode/configSource enums, each with a conservative 'off'", () => {
    expect(personaContinuitySpecSchema.safeParse(spec).success).toBe(true);
    expect(personaContinuitySpecSchema.safeParse({ ...spec, soulMode: "off" }).success).toBe(true);
    expect(personaContinuitySpecSchema.safeParse({ ...spec, configSource: "off" }).success).toBe(true);
    expect(personaContinuitySpecSchema.safeParse({ ...spec, soulMode: "max" }).success).toBe(false);
    expect(personaContinuitySpecSchema.safeParse({ ...spec, configSource: "remote" }).success).toBe(false);
  });

  it("character continuity is structural — the nested voice/hermes/identityFiles are NON-OPTIONAL", () => {
    const { voice: _v, ...withoutVoice } = spec;
    expect(personaContinuitySpecSchema.safeParse(withoutVoice).success).toBe(false);
    const { hermes: _h, ...withoutHermes } = spec;
    expect(personaContinuitySpecSchema.safeParse(withoutHermes).success).toBe(false);
    const { identityFiles: _i, ...withoutFiles } = spec;
    expect(personaContinuitySpecSchema.safeParse(withoutFiles).success).toBe(false);
  });

  it("identityFiles may be an explicit [] but every present entry must be fully specified", () => {
    expect(personaContinuitySpecSchema.safeParse({ ...spec, identityFiles: [] }).success).toBe(true);
    const malformed = { kind: "SOUL", path: "SOUL.md", required: true }; // missing truthStatus
    expect(personaContinuitySpecSchema.safeParse({ ...spec, identityFiles: [malformed] }).success).toBe(false);
  });
});

// The least-privilege WIRE REQUEST (missionWorkerAssignmentRequest) is already
// pinned: it carries PROFILE FACTS ONLY and no capability field rides in on it.
// Its counterpart — the full server-computed CAPABILITY RECORD and the assignment
// that wraps it — is unpinned at the schema level. (An agents-side coverage test
// validates the mapping BEHAVIOR over real profiles, but never pins the schema's
// structural contract: which authority fields are mandatory, that the tool lists
// are a closed vocabulary, the worker-status totality, or the assignment's
// no-fabrication of optional ids.) These encode the matrix every runner reads:
//   (21) the capability record states EVERY authority bit explicitly — the three
//        booleans (canMutateFiles/canRunCommands/requiresSandbox), allowedTools,
//        requiresHumanApprovalFor, defaultSandboxKind, and personaContinuity are
//        all mandatory; only personaName is optional and notes defaults to [].
//        Capability is never partially implied — the opposite of the bare wire req.
//   (22) allowedTools / requiresHumanApprovalFor are typed to the CLOSED
//        missionToolName vocabulary and mode to the CLOSED missionCapabilityMode —
//        an unknown tool or mode can't be smuggled into the matrix.
//   (23) defaultSandboxKind reuses the sandboxKind enum (incl the inert "disabled")
//        — a worker's default sandbox is constrained to the same closed kinds.
//   (24) missionWorkerStatus is a closed lifecycle with an explicit waiting_approval
//        gate and terminal failed/cancelled (no "merged"/"done" shortcut).
//   (25) the assignment threads the full capability (non-optional) and leaves
//        sandboxId/worktreePath/branchName/completedAt undefined when omitted —
//        a sandbox id or branch is never fabricated before one exists.
// Expected values are read off the schemas (self-consistent), never magic.
describe("productKernel — mission worker capability matrix: fully-explicit, closed-vocab, no fabricated ids", () => {
  const persona = {
    agentId: "a1",
    personaSlug: "p",
    displayName: "d",
    role: "builder" as const,
    soulMode: "summary" as const,
    configSource: "internal" as const,
    identityFiles: [],
    hermes: { slotId: "s", sticky: false, memoryScope: "m", restorePolicy: "off" as const, promotionPolicy: "off" as const },
    voice: {
      preserveCharacterVoice: true,
      allowSpeechQuirks: true,
      allowEmotionalColor: true,
      forbiddenSuppressionReasons: [],
      safetyOverrideNote: "n",
    },
  };
  const capability = {
    agentId: "a1",
    role: "builder" as const,
    displayName: "d",
    mode: "sandbox_build" as const,
    allowedTools: ["write", "edit", "bash"],
    canMutateFiles: true,
    canRunCommands: true,
    requiresSandbox: true,
    defaultSandboxKind: "docker_rootless" as const,
    requiresHumanApprovalFor: ["bash"],
    personaContinuity: persona,
  };

  it("the capability record states every authority bit explicitly (booleans/tools/sandbox/persona mandatory)", () => {
    const parsed = missionWorkerCapabilitySchema.parse(capability);
    expect(parsed.notes).toEqual([]); // only notes defaults; everything else must be supplied
    expect(parsed.personaName).toBeUndefined(); // the one optional field, not fabricated
    for (const key of ["canMutateFiles", "canRunCommands", "requiresSandbox", "allowedTools", "requiresHumanApprovalFor", "defaultSandboxKind", "personaContinuity"]) {
      const { [key]: _omit, ...partial } = capability as Record<string, unknown>;
      expect(missionWorkerCapabilitySchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });

  it("allowedTools / requiresHumanApprovalFor are a closed tool vocabulary and mode is a closed mode vocabulary", () => {
    expect(missionToolNameSchema.options).toEqual([
      "complete",
      "read",
      "grep",
      "glob",
      "write",
      "edit",
      "bash",
      "todo",
      "diff",
      "verify",
      "merge_recommend",
      "memory_recall",
      "memory_write_request",
      "tmux_capture",
      "tmux_dispatch",
    ]);
    expect(missionCapabilityModeSchema.options).toEqual([
      "conversation_only",
      "plan_only",
      "sandbox_build",
      "sandbox_verify",
      "merge_recommend",
      "memory_curate",
      "research",
    ]);
    expect(missionWorkerCapabilitySchema.safeParse({ ...capability, allowedTools: ["deploy"] }).success).toBe(false);
    expect(missionWorkerCapabilitySchema.safeParse({ ...capability, requiresHumanApprovalFor: ["sudo"] }).success).toBe(false);
    expect(missionWorkerCapabilitySchema.safeParse({ ...capability, mode: "ship_it" }).success).toBe(false);
  });

  it("defaultSandboxKind reuses the closed sandboxKind enum (incl the inert 'disabled')", () => {
    expect(missionWorkerCapabilitySchema.safeParse({ ...capability, defaultSandboxKind: "disabled" }).success).toBe(true);
    expect(missionWorkerCapabilitySchema.safeParse({ ...capability, defaultSandboxKind: "vm" }).success).toBe(false);
  });

  it("missionWorkerStatus is a closed lifecycle with waiting_approval + terminal failed/cancelled (no merged/done)", () => {
    expect(missionWorkerStatusSchema.options).toEqual([
      "planned",
      "assigned",
      "running",
      "waiting_approval",
      "verifying",
      "completed",
      "failed",
      "cancelled",
    ]);
    for (const forged of ["merged", "done", "ready", "ok"]) {
      expect(missionWorkerStatusSchema.options).not.toContain(forged);
    }
  });

  it("the assignment threads the full capability and never fabricates sandboxId/worktreePath/branchName/completedAt", () => {
    const assignment = missionWorkerAssignmentSchema.parse({
      id: "wa1",
      missionId: "m1",
      agentId: "a1",
      role: "builder",
      status: "assigned",
      capability,
      assignedAt: "2026-06-21T00:00:00.000Z",
    });
    expect(assignment.sandboxId).toBeUndefined();
    expect(assignment.worktreePath).toBeUndefined();
    expect(assignment.branchName).toBeUndefined();
    expect(assignment.completedAt).toBeUndefined();
    // the capability matrix is non-optional — an assignment can't exist without it
    const { capability: _c, ...withoutCapability } = {
      id: "wa1",
      missionId: "m1",
      agentId: "a1",
      role: "builder" as const,
      status: "assigned" as const,
      capability,
      assignedAt: "2026-06-21T00:00:00.000Z",
    };
    expect(missionWorkerAssignmentSchema.safeParse(withoutCapability).success).toBe(false);
  });

  it("canMutateFiles and canRunCommands are INDEPENDENT bits — the asymmetric verify combo is representable", () => {
    // a verifier may run commands in the sandbox yet be forbidden from mutating files
    const verifyOnly = { ...capability, canMutateFiles: false, canRunCommands: true };
    expect(missionWorkerCapabilitySchema.safeParse(verifyOnly).success).toBe(true);
    // and a plan-only worker can have neither — the matrix doesn't force one to imply the other
    const neither = { ...capability, canMutateFiles: false, canRunCommands: false };
    expect(missionWorkerCapabilitySchema.safeParse(neither).success).toBe(true);
    const mutateOnly = { ...capability, canMutateFiles: true, canRunCommands: false };
    expect(missionWorkerCapabilitySchema.safeParse(mutateOnly).success).toBe(true);
  });
});

// verificationReport + sequentialMergeQueueItem are already pinned (observed flag,
// real-sha-only). But the EVIDENCE CHAIN they sit on top of — the artifact ref
// (a captured output) and the verification check (one command result that LINKS to
// stdout/stderr artifacts rather than inlining them) — is unpinned. This chain is
// where verification honesty is grounded: a report is only as truthful as the
// observed artifacts and checks beneath it.
//   (26) the artifact kind is a CLOSED evidence vocabulary (diff/patch/test_report/
//        …/screenshot/memory_note) — no arbitrary evidence type.
//   (27) an artifact ref carries its OWN truthStatus (it knows whether it was
//        observed vs merely configured/planned) and a summary; id/missionId/kind
//        are mandatory while workerAssignmentId/path/contentHash stay undefined when
//        absent — a path or hash is never fabricated for an artifact that has none.
//   (28) a verification check links stdout/stderr to ARTIFACT IDS, never inlines the
//        output — a smuggled inline `stdout` string is dropped (evidence lives in
//        the artifact store, not the check record).
//   (29) check status is an honest 4-state (passed/failed/warning/skipped) — no bare
//        "ok"/"success"; and exitCode is an OPTIONAL int, never defaulted to 0 (a
//        running/skipped check must not falsely imply a clean exit).
// Expected values are read off the schemas (self-consistent), never magic.
describe("productKernel — verification evidence chain: closed artifact kinds, no inlined output, no fabricated exit", () => {
  const artifact = {
    id: "art1",
    missionId: "m1",
    kind: "stdout" as const,
    summary: "build log tail",
    truthStatus: "observed" as const,
    createdAt: "2026-06-21T00:00:00.000Z",
  };
  const check = {
    id: "vc1",
    command: "pnpm test",
    status: "passed" as const,
    summary: "all green",
    startedAt: "2026-06-21T00:00:00.000Z",
  };

  it("the artifact kind is a closed evidence vocabulary", () => {
    expect(missionArtifactKindSchema.options).toEqual([
      "diff",
      "patch",
      "test_report",
      "verification_report",
      "stdout",
      "stderr",
      "markdown_report",
      "screenshot",
      "memory_note",
    ]);
    expect(missionArtifactKindSchema.safeParse("video").success).toBe(false);
  });

  it("an artifact ref carries its own truthStatus + summary and never fabricates path/contentHash/worker links", () => {
    const parsed = missionArtifactRefSchema.parse(artifact);
    expect(parsed.workerAssignmentId).toBeUndefined();
    expect(parsed.path).toBeUndefined();
    expect(parsed.contentHash).toBeUndefined(); // no synthetic hash for an artifact that has none
    const { summary: _s, ...withoutSummary } = artifact;
    expect(missionArtifactRefSchema.safeParse(withoutSummary).success).toBe(false);
    const { truthStatus: _t, ...withoutTruth } = artifact;
    expect(missionArtifactRefSchema.safeParse(withoutTruth).success).toBe(false); // an artifact must declare its truth
  });

  it("a verification check links stdout/stderr to ARTIFACT IDS and never inlines the raw output", () => {
    const linked = verificationCheckSchema.parse({ ...check, stdoutArtifactId: "art1", stderrArtifactId: "art2" });
    expect(linked.stdoutArtifactId).toBe("art1");
    // a smuggled inline stdout/stderr string is dropped — evidence lives in the artifact store
    const smuggled = verificationCheckSchema.parse({ ...check, stdout: "secret raw output", stderr: "trace" } as Record<string, unknown>);
    expect("stdout" in smuggled).toBe(false);
    expect("stderr" in smuggled).toBe(false);
    // a check must name what it ran
    const { command: _c, ...withoutCommand } = check;
    expect(verificationCheckSchema.safeParse(withoutCommand).success).toBe(false);
  });

  it("check status is an honest 4-state and exitCode is optional — never defaulted to a clean 0", () => {
    expect(verificationCheckStatusSchema.options).toEqual(["passed", "failed", "warning", "skipped"]);
    for (const forged of ["ok", "success", "green", "done"]) {
      expect(verificationCheckStatusSchema.options).not.toContain(forged);
    }
    // a skipped check with no exit code stays undefined — not a misleading 0
    const skipped = verificationCheckSchema.parse({ ...check, status: "skipped" });
    expect(skipped.exitCode).toBeUndefined();
    expect(skipped.completedAt).toBeUndefined(); // a not-yet-finished check doesn't fabricate an end time
    expect(verificationCheckSchema.safeParse({ ...check, exitCode: 1.5 }).success).toBe(false); // int only
    expect(verificationCheckSchema.parse({ ...check, status: "failed", exitCode: 1 }).exitCode).toBe(1);
  });
});

// The mission COMPOSITION ROOT — orchestrationMission and the debateControlPolicy
// it carries — is the aggregate that binds sandbox + debate + workers + artifacts
// into one record. Its status enum is iterated by a missionBoard mapping test, but
// the enum membership, the debate-policy bounds, and the aggregate's own
// composition contract are unpinned. These encode:
//   (30) debate is BOUNDED — maxRounds is a positive int (no zero/unbounded debate)
//        and the critic directive budget is a closed {one_global_directive,top_three,
//        freeform}; the isolation + two exit conditions are explicit booleans.
//   (31) the mission status is a closed lifecycle draft→…→ready_to_merge→merged with
//        terminal failed/cancelled (a ready_to_merge gate before merged; no stray
//        "closed"/"open"/"done").
//   (32) the aggregate REQUIRES its nested sandbox + debatePolicy + workers[] +
//        artifacts[] + truthStatus; the cross-reference links (sourceSessionId/
//        codingPacketId/debateId/verificationReportId/mergeQueueItemId) stay
//        undefined when absent — a mission never fabricates a link it doesn't have.
//   (33) validation is TRANSITIVE — a structurally-invalid nested member (e.g. a
//        sandbox with an out-of-vocabulary network mode, or a malformed worker)
//        fails the whole mission parse; the root doesn't trust its parts blindly.
// Expected values are read off the schemas (self-consistent), never magic.
describe("productKernel — mission composition root: bounded debate, gated lifecycle, transitive validation", () => {
  const sandbox = {
    id: "sb1",
    kind: "docker_rootless" as const,
    isolationLevel: "container" as const,
    truthStatus: "configured" as const,
    workspace: { repoRoot: "/repo", cleanup: "destroy_on_success" as const },
    network: { mode: "disabled" as const, reason: "no egress" },
    resources: { timeoutSeconds: 60, maxOutputBytes: 1_000 },
  };
  const debatePolicy = {
    firstRoundIsolation: true,
    maxRounds: 3,
    criticDirectiveLimit: "one_global_directive" as const,
    exitWhenVerifierPasses: true,
    exitWhenNoNewRisk: false,
  };
  const mission = {
    id: "m1",
    title: "t",
    goal: "g",
    status: "planned" as const,
    sandbox,
    debatePolicy,
    workers: [],
    artifacts: [],
    truthStatus: "planned" as const,
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  };

  it("debate is bounded — maxRounds positive int, critic budget closed, isolation/exits explicit", () => {
    const parsed = debateControlPolicySchema.parse(debatePolicy);
    expect(parsed.notes).toEqual([]); // only notes defaults
    expect(debateControlPolicySchema.safeParse({ ...debatePolicy, maxRounds: 0 }).success).toBe(false); // no zero-round debate
    expect(debateControlPolicySchema.safeParse({ ...debatePolicy, maxRounds: 2.5 }).success).toBe(false); // int
    expect(debateControlPolicySchema.safeParse({ ...debatePolicy, criticDirectiveLimit: "unlimited" }).success).toBe(false);
    const { exitWhenVerifierPasses: _e, ...withoutExit } = debatePolicy;
    expect(debateControlPolicySchema.safeParse(withoutExit).success).toBe(false); // exit conditions are explicit
  });

  it("the mission status is a closed gated lifecycle (ready_to_merge before merged; terminal failed/cancelled)", () => {
    expect(orchestrationMissionStatusSchema.options).toEqual([
      "draft",
      "planned",
      "running",
      "waiting_approval",
      "verifying",
      "ready_to_merge",
      "merged",
      "failed",
      "cancelled",
    ]);
    // the merge gate sits immediately before the terminal merged state
    const opts = orchestrationMissionStatusSchema.options;
    expect(opts.indexOf("ready_to_merge")).toBe(opts.indexOf("merged") - 1);
    for (const stray of ["closed", "open", "done", "ok"]) {
      expect(orchestrationMissionStatusSchema.options).not.toContain(stray);
    }
  });

  it("the aggregate requires nested sandbox/debatePolicy/truthStatus and never fabricates absent cross-links", () => {
    const parsed = orchestrationMissionSchema.parse(mission);
    expect(parsed.sourceSessionId).toBeUndefined();
    expect(parsed.codingPacketId).toBeUndefined();
    expect(parsed.debateId).toBeUndefined();
    expect(parsed.verificationReportId).toBeUndefined(); // no link to a report that doesn't exist yet
    expect(parsed.mergeQueueItemId).toBeUndefined();
    for (const key of ["sandbox", "debatePolicy", "truthStatus", "workers", "artifacts"]) {
      const { [key]: _omit, ...partial } = mission as Record<string, unknown>;
      expect(orchestrationMissionSchema.safeParse(partial).success, `${key} must be mandatory`).toBe(false);
    }
  });

  it("validation is transitive — a malformed nested sandbox or worker fails the whole mission parse", () => {
    expect(orchestrationMissionSchema.safeParse(mission).success).toBe(true);
    // an out-of-vocabulary sandbox network mode must sink the whole aggregate
    const badSandbox = { ...mission, sandbox: { ...sandbox, network: { mode: "vpn", reason: "x" } } };
    expect(orchestrationMissionSchema.safeParse(badSandbox).success).toBe(false);
    // a malformed worker entry (missing required capability) likewise fails
    const badWorker = { ...mission, workers: [{ id: "w1", missionId: "m1", agentId: "a1", role: "builder" }] };
    expect(orchestrationMissionSchema.safeParse(badWorker).success).toBe(false);
    // workers/artifacts may be explicitly empty
    expect(orchestrationMissionSchema.safeParse({ ...mission, workers: [], artifacts: [] }).success).toBe(true);
  });
});
