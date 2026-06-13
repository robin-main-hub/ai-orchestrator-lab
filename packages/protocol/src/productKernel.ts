import { z } from "zod";

/**
 * Product-kernel contracts for closing the gap between "character chat" and
 * Codex/OpenCode-grade coding orchestration.
 *
 * Important boundary:
 * - Persona voice is not a permission boundary.
 * - Sandbox/mission/verifier/merge contracts are the permission boundary.
 * - Character speech, SOUL quirks, and Hermes continuity are preserved inside
 *   those boundaries instead of being stripped for safety theater.
 */

export const truthStatusSchema = z.enum(["observed", "configured", "planned", "simulated"]);
export type TruthStatus = z.infer<typeof truthStatusSchema>;

export const missionAgentRoleSchema = z.enum([
  "orchestrator",
  "architect",
  "builder",
  "reviewer",
  "skeptic",
  "verifier",
  "memory_curator",
  "executor",
  "external",
  "auditor",
  "researcher",
  "negotiator",
  "risk_officer",
  "mediator",
  "watchdog",
  "domain_expert",
  "companion",
]);
export type MissionAgentRole = z.infer<typeof missionAgentRoleSchema>;

export const missionToolNameSchema = z.enum([
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
export type MissionToolName = z.infer<typeof missionToolNameSchema>;

export const missionCapabilityModeSchema = z.enum([
  "conversation_only",
  "plan_only",
  "sandbox_build",
  "sandbox_verify",
  "merge_recommend",
  "memory_curate",
  "research",
]);
export type MissionCapabilityMode = z.infer<typeof missionCapabilityModeSchema>;

export const sandboxKindSchema = z.enum([
  "disabled",
  "legacy_tmux",
  "local_process",
  "docker_rootless",
  "docker_gvisor",
  "firecracker",
  "remote_codex",
  "remote_opencode",
]);
export type SandboxKind = z.infer<typeof sandboxKindSchema>;

export const sandboxIsolationLevelSchema = z.enum([
  "none",
  "process",
  "container",
  "user_space_kernel",
  "microvm",
  "remote_managed",
]);
export type SandboxIsolationLevel = z.infer<typeof sandboxIsolationLevelSchema>;

export const sandboxNetworkPolicySchema = z.object({
  mode: z.enum(["disabled", "allowlist", "full"]),
  allowedHosts: z.array(z.string()).default([]),
  reason: z.string(),
});
export type SandboxNetworkPolicy = z.infer<typeof sandboxNetworkPolicySchema>;

export const sandboxResourceLimitsSchema = z.object({
  cpuCores: z.number().positive().optional(),
  memoryMb: z.number().int().positive().optional(),
  diskMb: z.number().int().positive().optional(),
  timeoutSeconds: z.number().int().positive(),
  maxOutputBytes: z.number().int().positive(),
});
export type SandboxResourceLimits = z.infer<typeof sandboxResourceLimitsSchema>;

export const sandboxWorkspacePolicySchema = z.object({
  repoRoot: z.string(),
  worktreePath: z.string().optional(),
  branchName: z.string().optional(),
  writablePaths: z.array(z.string()).default([]),
  readOnlyPaths: z.array(z.string()).default([]),
  cleanup: z.enum(["destroy_on_success", "keep_on_failure", "keep_until_manual_cleanup"]),
});
export type SandboxWorkspacePolicy = z.infer<typeof sandboxWorkspacePolicySchema>;

export const sandboxSpecSchema = z.object({
  id: z.string(),
  kind: sandboxKindSchema,
  isolationLevel: sandboxIsolationLevelSchema,
  truthStatus: truthStatusSchema,
  workspace: sandboxWorkspacePolicySchema,
  network: sandboxNetworkPolicySchema,
  resources: sandboxResourceLimitsSchema,
  notes: z.array(z.string()).default([]),
});
export type SandboxSpec = z.infer<typeof sandboxSpecSchema>;

export const personaIdentityFileKindSchema = z.enum(["SOUL", "AGENTS", "IDENTITY", "USER", "LOREBOOK"]);
export type PersonaIdentityFileKind = z.infer<typeof personaIdentityFileKindSchema>;

export const personaIdentityFileRefSchema = z.object({
  kind: personaIdentityFileKindSchema,
  path: z.string(),
  required: z.boolean(),
  truthStatus: truthStatusSchema,
});
export type PersonaIdentityFileRef = z.infer<typeof personaIdentityFileRefSchema>;

export const hermesContinuityPolicySchema = z.object({
  slotId: z.string(),
  sticky: z.boolean(),
  memoryScope: z.string(),
  restorePolicy: z.enum(["always_restore", "restore_when_available", "summary_only", "off"]),
  promotionPolicy: z.enum(["curator_required", "trusted_auto_promote", "off"]),
});
export type HermesContinuityPolicy = z.infer<typeof hermesContinuityPolicySchema>;

export const personaVoicePreservationSchema = z.object({
  preserveCharacterVoice: z.boolean(),
  allowSpeechQuirks: z.boolean(),
  allowEmotionalColor: z.boolean(),
  /**
   * What the runtime must not do merely to make the agent sound more generic.
   * Safety can still constrain actions, but it must not flatten the character's
   * voice unless a concrete policy requires it.
   */
  forbiddenSuppressionReasons: z.array(z.string()),
  safetyOverrideNote: z.string(),
});
export type PersonaVoicePreservation = z.infer<typeof personaVoicePreservationSchema>;

export const personaContinuitySpecSchema = z.object({
  agentId: z.string(),
  personaSlug: z.string(),
  displayName: z.string(),
  role: missionAgentRoleSchema,
  soulMode: z.enum(["full", "summary", "retrieved", "off"]),
  configSource: z.enum(["internal", "markdown", "off"]),
  identityFiles: z.array(personaIdentityFileRefSchema),
  hermes: hermesContinuityPolicySchema,
  voice: personaVoicePreservationSchema,
});
export type PersonaContinuitySpec = z.infer<typeof personaContinuitySpecSchema>;

export const missionWorkerCapabilitySchema = z.object({
  agentId: z.string(),
  role: missionAgentRoleSchema,
  displayName: z.string(),
  personaName: z.string().optional(),
  mode: missionCapabilityModeSchema,
  allowedTools: z.array(missionToolNameSchema),
  canMutateFiles: z.boolean(),
  canRunCommands: z.boolean(),
  requiresSandbox: z.boolean(),
  defaultSandboxKind: sandboxKindSchema,
  requiresHumanApprovalFor: z.array(missionToolNameSchema),
  personaContinuity: personaContinuitySpecSchema,
  notes: z.array(z.string()).default([]),
});
export type MissionWorkerCapability = z.infer<typeof missionWorkerCapabilitySchema>;

export const missionWorkerStatusSchema = z.enum([
  "planned",
  "assigned",
  "running",
  "waiting_approval",
  "verifying",
  "completed",
  "failed",
  "cancelled",
]);
export type MissionWorkerStatus = z.infer<typeof missionWorkerStatusSchema>;

export const missionWorkerAssignmentSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  agentId: z.string(),
  role: missionAgentRoleSchema,
  status: missionWorkerStatusSchema,
  capability: missionWorkerCapabilitySchema,
  sandboxId: z.string().optional(),
  worktreePath: z.string().optional(),
  branchName: z.string().optional(),
  assignedAt: z.string(),
  completedAt: z.string().optional(),
});
export type MissionWorkerAssignment = z.infer<typeof missionWorkerAssignmentSchema>;

export const missionArtifactKindSchema = z.enum([
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
export type MissionArtifactKind = z.infer<typeof missionArtifactKindSchema>;

export const missionArtifactRefSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workerAssignmentId: z.string().optional(),
  kind: missionArtifactKindSchema,
  path: z.string().optional(),
  contentHash: z.string().optional(),
  summary: z.string(),
  truthStatus: truthStatusSchema,
  createdAt: z.string(),
});
export type MissionArtifactRef = z.infer<typeof missionArtifactRefSchema>;

export const verificationCheckStatusSchema = z.enum(["passed", "failed", "warning", "skipped"]);
export type VerificationCheckStatus = z.infer<typeof verificationCheckStatusSchema>;

export const verificationCheckSchema = z.object({
  id: z.string(),
  command: z.string(),
  status: verificationCheckStatusSchema,
  exitCode: z.number().int().optional(),
  stdoutArtifactId: z.string().optional(),
  stderrArtifactId: z.string().optional(),
  summary: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
});
export type VerificationCheck = z.infer<typeof verificationCheckSchema>;

export const verificationReportSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  verifierAgentId: z.string(),
  status: z.enum(["pending", "passed", "failed", "blocked"]),
  checks: z.array(verificationCheckSchema),
  artifactIds: z.array(z.string()),
  globalRevisionDirective: z.string().optional(),
  /**
   * True only when the verifier result is based on observed sandbox output,
   * not a simulated/theater status.
   */
  observed: z.boolean(),
  createdAt: z.string(),
});
export type VerificationReport = z.infer<typeof verificationReportSchema>;

export const sequentialMergeQueueItemSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  branchName: z.string(),
  status: z.enum(["queued", "waiting_approval", "merging", "merged", "rejected", "failed"]),
  requiredVerificationReportId: z.string(),
  approvalId: z.string().optional(),
  mergeCommitSha: z.string().optional(),
  reason: z.string(),
  queuedAt: z.string(),
  completedAt: z.string().optional(),
});
export type SequentialMergeQueueItem = z.infer<typeof sequentialMergeQueueItemSchema>;

export const debateControlPolicySchema = z.object({
  firstRoundIsolation: z.boolean(),
  maxRounds: z.number().int().positive(),
  criticDirectiveLimit: z.enum(["one_global_directive", "top_three", "freeform"]),
  exitWhenVerifierPasses: z.boolean(),
  exitWhenNoNewRisk: z.boolean(),
  notes: z.array(z.string()).default([]),
});
export type DebateControlPolicy = z.infer<typeof debateControlPolicySchema>;

export const orchestrationMissionStatusSchema = z.enum([
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
export type OrchestrationMissionStatus = z.infer<typeof orchestrationMissionStatusSchema>;

export const orchestrationMissionSchema = z.object({
  id: z.string(),
  title: z.string(),
  goal: z.string(),
  status: orchestrationMissionStatusSchema,
  sourceSessionId: z.string().optional(),
  codingPacketId: z.string().optional(),
  debateId: z.string().optional(),
  sandbox: sandboxSpecSchema,
  debatePolicy: debateControlPolicySchema,
  workers: z.array(missionWorkerAssignmentSchema),
  artifacts: z.array(missionArtifactRefSchema),
  verificationReportId: z.string().optional(),
  mergeQueueItemId: z.string().optional(),
  truthStatus: truthStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OrchestrationMission = z.infer<typeof orchestrationMissionSchema>;

export const missionKernelContractSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  /**
   * Product-ready invariant: side effects must flow through Mission → Sandbox →
   * Verification → Sequential merge. Completion-only delegation may still exist,
   * but it is not allowed to claim Codex/OpenCode-grade execution.
   */
  sideEffectBoundary: z.literal("mission_sandbox_verifier_merge"),
  personaPolicy: z.literal("preserve_character_voice_inside_capability_boundary"),
  sandboxRequiredForMutation: z.boolean(),
  verifierRequiredForMerge: z.boolean(),
  sequentialMergeRequired: z.boolean(),
  truthStatusRequired: z.boolean(),
  createdAt: z.string(),
});
export type MissionKernelContract = z.infer<typeof missionKernelContractSchema>;
