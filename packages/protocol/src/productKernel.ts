import { z } from "zod";
import { appWorkspaceSchema } from "./appWorkspace.js";
import { designBlueprintSchema } from "./designBlueprint.js";
import { missionCheckpointSchema } from "./missionCheckpoint.js";
import { sandboxErrorCardSchema } from "./sandboxErrorCard.js";
import { missionSelfCorrectionRecordSchema } from "./selfCorrection.js";
import { truthStatusSchema, type TruthStatus } from "./truthStatus.js";

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

// truthStatusSchema는 ./truthStatus.js로 분리(순환 방지). 기존 import 호환 위해 re-export.
export { truthStatusSchema };
export type { TruthStatus };

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

/**
 * Sandbox execution contract — the seam where coding execution stops depending
 * directly on tmux semantics. A SandboxRunner (defined in the runtime layer)
 * takes these requests; the first implementation (LegacyTmuxRunner) adapts the
 * existing gated tmux dispatch/capture path, and docker/gvisor/remote runners
 * can be added later behind the same shape without touching the persona or
 * mission layers.
 */
export const sandboxRunModeSchema = z.enum(["read_only", "verify", "build", "merge_recommend"]);
export type SandboxRunMode = z.infer<typeof sandboxRunModeSchema>;

export const sandboxExecRequestSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workerId: z.string(),
  command: z.string(),
  mode: sandboxRunModeSchema,
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  createdAt: z.string(),
});
export type SandboxExecRequest = z.infer<typeof sandboxExecRequestSchema>;

export const sandboxPreflightResultSchema = z.object({
  allowed: z.boolean(),
  /** when allowed, whether the dispatch still needs a human approval (e.g. build/mutation) */
  requiresApproval: z.boolean(),
  reason: z.string(),
});
export type SandboxPreflightResult = z.infer<typeof sandboxPreflightResultSchema>;

export const sandboxExecStatusSchema = z.enum(["completed", "failed", "blocked", "timeout"]);
export type SandboxExecStatus = z.infer<typeof sandboxExecStatusSchema>;

export const sandboxExecResultSchema = z.object({
  requestId: z.string(),
  status: sandboxExecStatusSchema,
  /** true only when status reflects real runner output, not a simulated/theater status */
  observed: z.boolean(),
  stdoutPreview: z.string().optional(),
  stderrPreview: z.string().optional(),
  exitCode: z.number().int().optional(),
  reason: z.string().optional(),
  observedAt: z.string(),
});
export type SandboxExecResult = z.infer<typeof sandboxExecResultSchema>;

export const sandboxCaptureResultSchema = z.object({
  workerId: z.string(),
  outputPreview: z.string(),
  observedAt: z.string(),
});
export type SandboxCaptureResult = z.infer<typeof sandboxCaptureResultSchema>;

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
  status: z.enum([
    "queued",
    "waiting_approval",
    "merging",
    "merged",
    "conflict",
    "blocked",
    "dry_run",
    "rejected",
    "failed",
  ]),
  requiredVerificationReportId: z.string(),
  approvalId: z.string().optional(),
  /** real merge commit sha — git rev-parse HEAD 결과만. 합성값 금지 */
  mergeCommitSha: z.string().optional(),
  /** 머지할 소스 브랜치 (예: agent/mission_xxx) */
  sourceBranch: z.string().optional(),
  /** 머지 대상 브랜치 (allowlist로 제한) */
  targetBranch: z.string().optional(),
  /** 실제 git merge를 수행할 repo root (서버 allowlist에 있어야 실행, 없으면 dry_run) */
  repoRoot: z.string().optional(),
  /** conflict 상태일 때 충돌 파일 목록 */
  conflictFiles: z.array(z.string()).default([]),
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

/**
 * Mission persistence — missions live as append-only events on the server's
 * existing Event Storage (JSONL + rotation), and the current state is a
 * materialized view rebuilt from those events. No second database.
 */
export const missionEventTypeSchema = z.enum([
  "mission.created",
  "mission.worker.assigned",
  "mission.artifact.attached",
  "mission.verification.recorded",
  "mission.merge.queued",
  "mission.closed",
]);
export type MissionEventType = z.infer<typeof missionEventTypeSchema>;

/**
 * Worker assignment as a CLIENT REQUEST: profile facts only. The capability is
 * deliberately NOT accepted from the wire — the server recomputes it from the
 * role (createAgentMissionCapability), so a payload cannot smuggle
 * canMutateFiles=true onto a companion.
 */
export const missionWorkerAssignmentRequestSchema = z.object({
  agentId: z.string().min(1).max(256),
  role: missionAgentRoleSchema,
  displayName: z.string().min(1).max(128),
  personaName: z.string().max(128).optional(),
  soulMode: z.enum(["full", "summary", "retrieved", "off"]).default("summary"),
  configSource: z.enum(["internal", "markdown", "off"]).default("internal"),
  permissionLevel: z.string().max(64).optional(),
  /** B 단계 연결: 워커가 점유한 실제 Hermes 슬롯 id (예: "hermes-03") */
  hermesSlotId: z.string().max(64).optional(),
});
export type MissionWorkerAssignmentRequest = z.infer<typeof missionWorkerAssignmentRequestSchema>;

export const missionCreateRequestSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(300),
  goal: z.string().min(1).max(4_000),
  sourceSessionId: z.string().max(256).optional(),
  codingPacketId: z.string().max(256).optional(),
  debateId: z.string().max(256).optional(),
  // 막 만든 미션은 실측 0건이므로 planned가 기본. observed 격상은 서버가
  // observed passed verification을 보고서야 부여한다(클라이언트가 신뢰등급을
  // 주장하지 못하게).
  truthStatus: truthStatusSchema.default("planned"),
  createdBy: z.string().max(64).default("desktop"),
  workers: z.array(missionWorkerAssignmentRequestSchema).max(32).default([]),
});
export type MissionCreateRequest = z.infer<typeof missionCreateRequestSchema>;

export const missionCreatedPayloadSchema = z.object({
  missionId: z.string(),
  title: z.string(),
  goal: z.string(),
  sourceSessionId: z.string().optional(),
  codingPacketId: z.string().optional(),
  debateId: z.string().optional(),
  truthStatus: truthStatusSchema,
  createdBy: z.string(),
});
export type MissionCreatedPayload = z.infer<typeof missionCreatedPayloadSchema>;

export const missionWorkerAssignedPayloadSchema = z.object({
  missionId: z.string(),
  worker: missionWorkerAssignmentSchema,
  /** 클라이언트 payload가 capability를 실어 보냈다가 서버 재계산으로 대체된 경우 */
  capabilityRecomputed: z.boolean().default(true),
});
export type MissionWorkerAssignedPayload = z.infer<typeof missionWorkerAssignedPayloadSchema>;

export const missionArtifactAttachedPayloadSchema = z.object({
  missionId: z.string(),
  artifact: missionArtifactRefSchema,
});
export type MissionArtifactAttachedPayload = z.infer<typeof missionArtifactAttachedPayloadSchema>;

export const missionVerificationRecordedPayloadSchema = z.object({
  missionId: z.string(),
  report: verificationReportSchema,
  /** observed 주장에 실측 근거(exit code)가 없어 서버가 강등했는지 */
  observedDowngraded: z.boolean().default(false),
});
export type MissionVerificationRecordedPayload = z.infer<typeof missionVerificationRecordedPayloadSchema>;

export const missionMergeQueuedPayloadSchema = z.object({
  missionId: z.string(),
  item: sequentialMergeQueueItemSchema,
});
export type MissionMergeQueuedPayload = z.infer<typeof missionMergeQueuedPayloadSchema>;

export const missionClosedPayloadSchema = z.object({
  missionId: z.string(),
  status: z.enum(["merged", "failed", "cancelled"]),
  reason: z.string().max(2_000).optional(),
});
export type MissionClosedPayload = z.infer<typeof missionClosedPayloadSchema>;

/**
 * mission.checkpoint.created — L3 자동 checkpoint hook이 append하는 서버 전용 이벤트.
 * 클라이언트 append 창구(missionEventTypeSchema)에는 일부러 넣지 않는다(서버만 발행).
 * checkpoint.headSha는 실제 git rev-parse 관측값(truthStatus: observed).
 */
export const missionCheckpointRecordedPayloadSchema = z.object({
  missionId: z.string(),
  checkpoint: missionCheckpointSchema,
});
export type MissionCheckpointRecordedPayload = z.infer<typeof missionCheckpointRecordedPayloadSchema>;

/** POST /missions/:missionId/events 본문 — route 폭발 대신 단일 append 창구 */
export const missionEventAppendRequestSchema = z.object({
  type: missionEventTypeSchema,
  payload: z.unknown(),
});
export type MissionEventAppendRequest = z.infer<typeof missionEventAppendRequestSchema>;

/** POST /missions/:missionId/verify 본문 — 서버가 실제로 실행할 검증 명령 */
export const missionVerifyRequestSchema = z.object({
  commands: z.array(z.string().min(1).max(2_000)).min(1).max(64),
  verifierAgentId: z.string().max(256).optional(),
});
export type MissionVerifyRequest = z.infer<typeof missionVerifyRequestSchema>;

/**
 * POST /missions/:missionId/merge 본문 — 검증 통과 후 큐 항목의 머지 실행.
 * mergeCommitSha는 받지 않는다: 서버 runner가 git rev-parse HEAD로 관측한
 * 실제 sha만 저장한다(클라이언트가 합성 sha를 주입할 수 없다).
 */
export const missionMergeRequestSchema = z.object({
  mergeQueueItemId: z.string().min(1).max(256),
});
export type MissionMergeRequest = z.infer<typeof missionMergeRequestSchema>;

/** Materialized view: append-only mission events에서 복원되는 현재 상태 */
export const serverMissionRecordSchema = z.object({
  mission: missionCreatedPayloadSchema.extend({ createdAt: z.string() }),
  status: orchestrationMissionStatusSchema,
  truthStatus: truthStatusSchema,
  workers: z.array(missionWorkerAssignmentSchema),
  artifacts: z.array(missionArtifactRefSchema),
  verificationReports: z.array(verificationReportSchema),
  mergeQueueItems: z.array(sequentialMergeQueueItemSchema),
  /** L3: verify/merge 전 자동 생성된 checkpoint들 (observed HEAD sha) */
  checkpoints: z.array(missionCheckpointSchema).default([]),
  /** L4: 검증 실패에서 결정적 파서가 만든 구조화 에러 카드들 */
  errorCards: z.array(sandboxErrorCardSchema).default([]),
  /** L5: 에러 카드에 대한 bounded self-correction 제안/중단 기록(제안만, 파일 변경 없음) */
  selfCorrections: z.array(missionSelfCorrectionRecordSchema).default([]),
  /** D2: Mission에 붙은 App Workspace들(코딩/디자인 작업공간; preview/terminal 메타) */
  workspaces: z.array(appWorkspaceSchema).default([]),
  /** D3: 디자인 미션의 구조화된 청사진들(화면/토큰/수용기준) */
  designBlueprints: z.array(designBlueprintSchema).default([]),
  updatedAt: z.string(),
});
export type ServerMissionRecord = z.infer<typeof serverMissionRecordSchema>;
