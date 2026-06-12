import * as zod from "zod";

const z = zod.z;

/**
 * Product-kernel contracts for turning the character debate OS into a reliable
 * coding orchestrator. The key design rule is separation:
 *
 * - persona voice / Hermes identity preservation stays expressive;
 * - capability / tool grants define what an agent may request;
 * - isolated runtime requirements define where code may run;
 * - verifier / merge gates define when a diff may land;
 * - truth markers tell the UI whether a surface is observed, configured,
 *   planned, or simulated.
 *
 * This closes the current gap between completion-only sub-agent debate and
 * Codex/OpenCode-grade coding workers without muting SOUL/AGENTS behavior.
 */

export const kernelTruthStatusSchema = z.enum(["observed", "configured", "planned", "simulated"]);
export type KernelTruthStatus = zod.infer<typeof kernelTruthStatusSchema>;

export const kernelTruthRefSchema = z
  .object({
    id: z.string().min(1).max(256),
    status: kernelTruthStatusSchema,
    label: z.string().min(1).max(256),
    summary: z.string().min(1).max(4_000),
    evidenceRefs: z.array(z.string().min(1).max(512)).default([]),
    observedAt: z.string().min(1).max(64).optional(),
  })
  .strict();
export type KernelTruthRef = zod.infer<typeof kernelTruthRefSchema>;

export const hermesPersonaFragmentSchema = z.enum([
  "SOUL.md",
  "AGENTS.md",
  "IDENTITY.md",
  "USER.md",
  "lorebook",
  "expression_pack",
]);
export type HermesPersonaFragment = zod.infer<typeof hermesPersonaFragmentSchema>;

export const personaVoicePolicySchema = z.enum([
  "preserve",
  "compress_for_audit",
  "off",
]);
export type PersonaVoicePolicy = zod.infer<typeof personaVoicePolicySchema>;

export const hermesPersonaContractSchema = z
  .object({
    personaName: z.string().min(1).max(128).optional(),
    displayName: z.string().min(1).max(128),
    identitySource: z.enum(["hermes_markdown", "internal_summary", "character_card", "runtime_override"]),
    requiredFragments: z.array(hermesPersonaFragmentSchema).default(["SOUL.md", "AGENTS.md"]),
    soulMdPath: z.string().min(1).max(512).optional(),
    agentsMdPath: z.string().min(1).max(512).optional(),
    identityMdPath: z.string().min(1).max(512).optional(),
    userMdPath: z.string().min(1).max(512).optional(),
    lorebookRefs: z.array(z.string().min(1).max(512)).default([]),
    expressionPackRef: z.string().min(1).max(512).optional(),
    voicePolicy: personaVoicePolicySchema.default("preserve"),
    conversationStyle: z.array(z.string().min(1).max(256)).default([]),
    hardBoundaries: z.array(z.string().min(1).max(512)).default([]),
    preserveCharacterSpeech: z.boolean().default(true),
  })
  .strict();
export type HermesPersonaContract = zod.infer<typeof hermesPersonaContractSchema>;

export const agentCapabilityTierSchema = z.enum([
  "conversation_only",
  "plan_only",
  "build_in_isolation",
  "verify_in_isolation",
  "audit_only",
  "merge_recommend",
  "orchestrate_only",
]);
export type AgentCapabilityTier = zod.infer<typeof agentCapabilityTierSchema>;

export const productToolGrantSchema = z.enum([
  "completion",
  "memory_recall",
  "memory_change_request",
  "file_read",
  "file_change_request",
  "patch_propose",
  "safe_command",
  "isolated_run",
  "allowlisted_remote_call",
  "approval_request",
  "approval_decision",
  "diff_review",
  "merge_recommend",
]);
export type ProductToolGrant = zod.infer<typeof productToolGrantSchema>;

export const isolationEngineSchema = z.enum([
  "legacy_tmux",
  "docker_rootless",
  "gvisor_runsc",
  "firecracker_microvm",
  "local_readonly",
]);
export type IsolationEngine = zod.infer<typeof isolationEngineSchema>;

export const isolationLevelSchema = z.enum([
  "none",
  "worktree",
  "container",
  "userspace_kernel",
  "microvm",
]);
export type IsolationLevel = zod.infer<typeof isolationLevelSchema>;

export const remoteAccessPolicySchema = z.enum(["blocked", "allowlist", "open"]);
export type RemoteAccessPolicy = zod.infer<typeof remoteAccessPolicySchema>;

export const filesystemBoundaryModeSchema = z.enum([
  "host_readonly",
  "mission_worktree",
  "ephemeral_copy",
  "scratch_only",
]);
export type FilesystemBoundaryMode = zod.infer<typeof filesystemBoundaryModeSchema>;

export const runtimeResourceLimitsSchema = z
  .object({
    cpus: z.number().positive().max(128).optional(),
    memoryMb: z.number().int().positive().max(1_048_576).optional(),
    diskMb: z.number().int().positive().max(10_485_760).optional(),
    timeoutSeconds: z.number().int().positive().max(86_400).optional(),
    maxOutputBytes: z.number().int().positive().max(100_000_000).optional(),
  })
  .strict();
export type RuntimeResourceLimits = zod.infer<typeof runtimeResourceLimitsSchema>;

export const isolatedRuntimeContractSchema = z
  .object({
    id: z.string().min(1).max(256),
    engine: isolationEngineSchema,
    isolationLevel: isolationLevelSchema,
    truthStatus: kernelTruthStatusSchema,
    filesystem: z
      .object({
        mode: filesystemBoundaryModeSchema,
        repoRootRef: z.string().min(1).max(512).optional(),
        worktreeRef: z.string().min(1).max(512).optional(),
        writableGlobs: z.array(z.string().min(1).max(512)).default([]),
        readonlyGlobs: z.array(z.string().min(1).max(512)).default([]),
      })
      .strict(),
    remoteAccess: z
      .object({
        policy: remoteAccessPolicySchema,
        allowlist: z.array(z.string().min(1).max(512)).default([]),
      })
      .strict(),
    resources: runtimeResourceLimitsSchema.default({}),
    teardownPolicy: z.enum(["always", "on_success", "manual_debug"]).default("manual_debug"),
    notes: z.array(z.string().min(1).max(512)).default([]),
  })
  .strict();
export type IsolatedRuntimeContract = zod.infer<typeof isolatedRuntimeContractSchema>;

export const verificationGateKindSchema = z.enum([
  "typecheck",
  "unit_test",
  "integration_test",
  "lint",
  "dependency_audit",
  "sensitive_text_check",
  "diff_review",
  "acceptance_check",
  "smoke",
]);
export type VerificationGateKind = zod.infer<typeof verificationGateKindSchema>;

export const verificationGateSchema = z
  .object({
    id: z.string().min(1).max(256),
    kind: verificationGateKindSchema,
    command: z.string().min(1).max(8_000).optional(),
    required: z.boolean().default(true),
    isolatedRuntimeRequired: z.boolean().default(true),
    ownerAgentId: z.string().min(1).max(256).optional(),
    status: z.enum(["pending", "running", "passed", "failed", "blocked", "skipped"]).default("pending"),
    evidenceRefs: z.array(z.string().min(1).max(512)).default([]),
  })
  .strict();
export type VerificationGate = zod.infer<typeof verificationGateSchema>;

export const verificationReportSchema = z
  .object({
    id: z.string().min(1).max(256),
    missionId: z.string().min(1).max(256),
    verifierAgentId: z.string().min(1).max(256),
    status: z.enum(["pending", "passed", "failed", "blocked"]),
    gates: z.array(verificationGateSchema),
    summary: z.string().min(1).max(8_000),
    riskNotes: z.array(z.string().min(1).max(2_000)).default([]),
    createdAt: z.string().min(1).max(64),
  })
  .strict();
export type VerificationReport = zod.infer<typeof verificationReportSchema>;

export const sequentialMergePolicySchema = z
  .object({
    strategy: z.enum(["disabled", "manual_only", "sequential_queue"]),
    requiresHumanApproval: z.boolean().default(true),
    verifierReportRequired: z.boolean().default(true),
    allowAutoMerge: z.boolean().default(false),
    postMergeSmokeRequired: z.boolean().default(true),
    notes: z.array(z.string().min(1).max(512)).default([]),
  })
  .strict();
export type SequentialMergePolicy = zod.infer<typeof sequentialMergePolicySchema>;

export const productMissionWorkerSchema = z
  .object({
    id: z.string().min(1).max(256),
    agentId: z.string().min(1).max(256),
    role: z.string().min(1).max(128),
    displayName: z.string().min(1).max(128),
    persona: hermesPersonaContractSchema,
    capabilityTier: agentCapabilityTierSchema,
    toolGrants: z.array(productToolGrantSchema),
    providerProfileId: z.string().min(1).max(256).optional(),
    modelId: z.string().min(1).max(256).optional(),
    isolatedRuntimeRequired: z.boolean(),
    canChangeFiles: z.boolean(),
    maxAutonomy: z.enum(["chat", "plan", "build", "verify", "merge_recommend"]),
    truthStatus: kernelTruthStatusSchema,
  })
  .strict();
export type ProductMissionWorker = zod.infer<typeof productMissionWorkerSchema>;

export const productMissionStatusSchema = z.enum([
  "draft",
  "planned",
  "running",
  "waiting_approval",
  "verifying",
  "ready_to_merge",
  "merged",
  "failed",
  "blocked",
]);
export type ProductMissionStatus = zod.infer<typeof productMissionStatusSchema>;

export const productCodingMissionContractSchema = z
  .object({
    id: z.string().min(1).max(256),
    sessionId: z.string().min(1).max(256),
    title: z.string().min(1).max(256),
    goal: z.string().min(1).max(8_000),
    status: productMissionStatusSchema,
    sourceSurface: z.enum(["conversation", "debate", "coding_packet", "parallel_swarm", "research_swarm", "api"]),
    contextPackTier: z.enum(["lite", "standard", "full"]).default("standard"),
    workers: z.array(productMissionWorkerSchema).min(1).max(32),
    isolatedRuntime: isolatedRuntimeContractSchema,
    verificationGates: z.array(verificationGateSchema).default([]),
    mergePolicy: sequentialMergePolicySchema,
    truthRefs: z.array(kernelTruthRefSchema).default([]),
    createdAt: z.string().min(1).max(64),
    updatedAt: z.string().min(1).max(64).optional(),
  })
  .strict();
export type ProductCodingMissionContract = zod.infer<typeof productCodingMissionContractSchema>;

export function createDefaultIsolatedRuntimeContract(params: {
  id: string;
  truthStatus?: KernelTruthStatus;
  repoRootRef?: string;
  worktreeRef?: string;
}): IsolatedRuntimeContract {
  return isolatedRuntimeContractSchema.parse({
    id: params.id,
    engine: params.truthStatus === "observed" ? "gvisor_runsc" : "legacy_tmux",
    isolationLevel: params.truthStatus === "observed" ? "userspace_kernel" : "worktree",
    truthStatus: params.truthStatus ?? "planned",
    filesystem: {
      mode: params.worktreeRef ? "mission_worktree" : "ephemeral_copy",
      repoRootRef: params.repoRootRef,
      worktreeRef: params.worktreeRef,
      writableGlobs: ["./**/*"],
      readonlyGlobs: [".git/**", "node_modules/**"],
    },
    remoteAccess: {
      policy: "blocked",
      allowlist: [],
    },
    resources: {
      cpus: 4,
      memoryMb: 8192,
      diskMb: 16_384,
      timeoutSeconds: 1_800,
      maxOutputBytes: 1_000_000,
    },
    teardownPolicy: "manual_debug",
    notes: [
      "legacy_tmux is a compatibility runner only; production execution must move behind gVisor/runsc or stronger isolation.",
    ],
  });
}

export function createDefaultSequentialMergePolicy(): SequentialMergePolicy {
  return sequentialMergePolicySchema.parse({
    strategy: "sequential_queue",
    requiresHumanApproval: true,
    verifierReportRequired: true,
    allowAutoMerge: false,
    postMergeSmokeRequired: true,
    notes: [
      "workers may propose diffs; only verifier-passed, human-approved diffs may enter the merge queue",
    ],
  });
}
