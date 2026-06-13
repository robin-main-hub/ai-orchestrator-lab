import { z } from "zod";

/**
 * Mission Checkpoint / Rollback — "작업 전 snapshot, 사람 승인 기반 rollback".
 *
 * 정직성:
 *   - checkpoint.headSha 는 실제 `git rev-parse` 결과만(truthStatus: observed).
 *   - rollback 은 반드시 grant된 approvalId 가 있어야 실행 — 자동 rollback 금지.
 *   - repoRoot allowlist + dirty 차단 + sha 검증을 통과해야만 reset --hard.
 */

export const missionCheckpointReasonSchema = z.enum([
  "before_write",
  "before_verification",
  "before_merge",
  "manual",
  "auto_recovery",
]);
export type MissionCheckpointReason = z.infer<typeof missionCheckpointReasonSchema>;

export const missionCheckpointSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workerId: z.string().optional(),
  repoRootRef: z.string(),
  gitRef: z.string(),
  /** 관측된 실제 sha — git rev-parse 결과만 */
  headSha: z.string(),
  reason: missionCheckpointReasonSchema,
  createdAt: z.string(),
  truthStatus: z.literal("observed"),
});
export type MissionCheckpoint = z.infer<typeof missionCheckpointSchema>;

export const missionCheckpointCreateRequestSchema = z.object({
  repoRoot: z.string().min(1).max(1024),
  gitRef: z.string().min(1).max(256).default("HEAD"),
  reason: missionCheckpointReasonSchema.default("manual"),
  workerId: z.string().max(256).optional(),
});
export type MissionCheckpointCreateRequest = z.infer<typeof missionCheckpointCreateRequestSchema>;

export const missionRollbackRequestSchema = z.object({
  repoRoot: z.string().min(1).max(1024),
  targetSha: z.string().min(7).max(40),
  /** rollback 은 반드시 grant된 approvalId 가 있어야 실행 — 자동 rollback 금지 */
  approvalId: z.string().min(1).max(256),
});
export type MissionRollbackRequest = z.infer<typeof missionRollbackRequestSchema>;

export type MissionRollbackStatus = "completed" | "blocked" | "failed";
export type MissionRollbackOutcome = {
  missionId: string;
  status: MissionRollbackStatus;
  /** 관측된 복원 후 sha — reset 후 git rev-parse HEAD */
  restoredSha?: string;
  reason: string;
  observed: boolean;
  completedAt: string;
};
