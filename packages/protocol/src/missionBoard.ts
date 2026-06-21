import { z } from "zod";
import {
  missionWorkspaceAttachedPayloadSchema,
  missionWorkspacePreviewRecordedPayloadSchema,
  type AppWorkspace,
  type AppWorkspacePreview,
} from "./appWorkspace.js";
import { missionDesignBlueprintRecordedPayloadSchema, type DesignBlueprint } from "./designBlueprint.js";
import {
  missionDesignIssueRecordedPayloadSchema,
  missionVisualQaRecordedPayloadSchema,
  type DesignIssueCard,
  type VisualQaReport,
} from "./visualQa.js";
import {
  missionScaffoldAppliedPayloadSchema,
  missionScaffoldPlannedPayloadSchema,
  type ScaffoldPlan,
} from "./scaffold.js";
import type { MissionCheckpoint } from "./missionCheckpoint.js";
import {
  missionErrorCardRecordedPayloadSchema,
  type SandboxErrorCard,
} from "./sandboxErrorCard.js";
import {
  missionSelfCorrectionRecordSchema,
  type MissionSelfCorrectionRecord,
} from "./selfCorrection.js";
import {
  missionCheckpointRecordedPayloadSchema,
  missionCreatedPayloadSchema,
  missionMergeQueuedPayloadSchema,
  missionVerificationRecordedPayloadSchema,
  missionWorkerAssignedPayloadSchema,
  type MissionWorkerAssignment,
  type OrchestrationMissionStatus,
  type SequentialMergeQueueItem,
  type ServerMissionRecord,
  type TruthStatus,
  type VerificationReport,
} from "./productKernel.js";

/**
 * Mission Board — Kanban view model + Live Trace, both DERIVED (pure) from the
 * existing materialized `ServerMissionRecord`. No second storage: EventStorage
 * stays the single source of truth; these are projections the web/desktop/PWA
 * all read the same way.
 *
 * Honesty invariants (kept from the rest of this project):
 *   - a mission reaches `ready_to_merge` / `merged` only through its real status;
 *     `merged` exposes the REAL `mergeCommitSha` (git rev-parse HEAD), never a
 *     synthetic value.
 *   - verification trace carries `observed` straight from the report — a
 *     simulated verification is never dressed up as observed.
 *   - trace previews are redacted (no raw secrets/logs).
 */

// ── Kanban ──────────────────────────────────────────────────────────────────

export const missionKanbanColumnIdSchema = z.enum([
  "todo",
  "running",
  "verifying",
  "ready_to_merge",
  "merged",
  "archived",
  "blocked",
]);
export type MissionKanbanColumnId = z.infer<typeof missionKanbanColumnIdSchema>;

export const MISSION_KANBAN_COLUMN_ORDER: ReadonlyArray<MissionKanbanColumnId> = [
  "todo",
  "running",
  "verifying",
  "ready_to_merge",
  "merged",
  "blocked",
  "archived",
];

export const MISSION_KANBAN_COLUMN_LABEL: Record<MissionKanbanColumnId, string> = {
  todo: "할 일",
  running: "진행 중",
  verifying: "검증 중",
  ready_to_merge: "머지 대기",
  merged: "머지됨",
  blocked: "차단",
  archived: "보관",
};

export function kanbanColumnForMissionStatus(status: OrchestrationMissionStatus): MissionKanbanColumnId {
  switch (status) {
    case "draft":
    case "planned":
      return "todo";
    case "running":
    case "waiting_approval":
      return "running";
    case "verifying":
      return "verifying";
    case "ready_to_merge":
      return "ready_to_merge";
    case "merged":
      return "merged";
    case "cancelled":
      return "archived";
    case "failed":
      return "blocked";
    default:
      return "todo";
  }
}

export type MissionMergeState = "none" | "queued" | "merged" | "conflict" | "dry_run";

function mergeStateFromItems(record: ServerMissionRecord): { state: MissionMergeState; sha?: string } {
  const latest = record.mergeQueueItems[record.mergeQueueItems.length - 1];
  if (!latest) return { state: "none" };
  switch (latest.status) {
    case "merged":
      return { state: "merged", sha: latest.mergeCommitSha };
    case "conflict":
      return { state: "conflict" };
    case "dry_run":
      return { state: "dry_run" };
    default:
      return { state: "queued" };
  }
}

function latestVerification(record: ServerMissionRecord) {
  return record.verificationReports[record.verificationReports.length - 1];
}

function nextActionLabelForColumn(column: MissionKanbanColumnId): string {
  switch (column) {
    case "todo":
      return "워커 배정";
    case "running":
      return "진행 관찰";
    case "verifying":
      return "검증 결과 대기";
    case "ready_to_merge":
      return "머지 승인";
    case "merged":
      return "완료 — 회고";
    case "blocked":
      return "차단 원인 확인";
    case "archived":
      return "보관됨";
  }
}

export type MissionKanbanCard = {
  missionId: string;
  title: string;
  status: OrchestrationMissionStatus;
  truthStatus: TruthStatus;
  column: MissionKanbanColumnId;
  /** 첫 워커 — 보관된 assignment에는 표시명/슬롯이 없어 id/role만 정직하게 노출 */
  primaryAgentId?: string;
  primaryAgentRole?: string;
  workerCount: number;
  verificationCount: number;
  latestVerificationStatus?: "pending" | "passed" | "failed" | "blocked";
  /** 마지막 검증이 실측(observed) 기반인가 — 시뮬레이션 검증을 observed로 위장하지 않는다 */
  latestVerificationObserved?: boolean;
  mergeState: MissionMergeState;
  /** merged일 때만, 진짜 git merge commit sha */
  mergeCommitSha?: string;
  nextActionLabel: string;
  updatedAt: string;
};

export function deriveMissionKanbanCard(record: ServerMissionRecord): MissionKanbanCard {
  const column = kanbanColumnForMissionStatus(record.status);
  const worker = record.workers[0];
  const verification = latestVerification(record);
  const merge = mergeStateFromItems(record);
  return {
    missionId: record.mission.missionId,
    title: record.mission.title,
    status: record.status,
    truthStatus: record.truthStatus,
    column,
    primaryAgentId: worker?.agentId,
    primaryAgentRole: worker?.role,
    workerCount: record.workers.length,
    verificationCount: record.verificationReports.length,
    latestVerificationStatus: verification?.status,
    latestVerificationObserved: verification?.observed,
    mergeState: merge.state,
    mergeCommitSha: merge.sha,
    nextActionLabel: nextActionLabelForColumn(column),
    updatedAt: record.updatedAt,
  };
}

export type MissionKanbanBoard = {
  columns: Array<{ id: MissionKanbanColumnId; label: string; cards: MissionKanbanCard[] }>;
  total: number;
};

export function deriveMissionKanbanBoard(records: ReadonlyArray<ServerMissionRecord>): MissionKanbanBoard {
  const cards = records.map(deriveMissionKanbanCard);
  const columns = MISSION_KANBAN_COLUMN_ORDER.map((id) => ({
    id,
    label: MISSION_KANBAN_COLUMN_LABEL[id],
    cards: cards
      .filter((card) => card.column === id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  }));
  return { columns, total: cards.length };
}

// ── Live Trace ──────────────────────────────────────────────────────────────

export const missionTraceEventTypeSchema = z.enum([
  "mission.created",
  "worker.assigned",
  "worker.started",
  "checkpoint.created",
  "workspace.attached",
  "preview.recorded",
  "design.blueprint.recorded",
  "visual_qa.recorded",
  "design.issue.recorded",
  "scaffold.planned",
  "scaffold.applied",
  "sandbox.preflight",
  "sandbox.exec.started",
  "sandbox.exec.completed",
  "sandbox.exec.failed",
  "verification.recorded",
  "error_card.recorded",
  "self_correction.started",
  "self_correction.stopped",
  "approval.required",
  "merge.queued",
  "merge.completed",
  "merge.conflict",
  "zombie.detected",
]);
export type MissionTraceEventType = z.infer<typeof missionTraceEventTypeSchema>;

export type MissionTraceSeverity = "info" | "success" | "warning" | "error";

export type MissionTraceEvent = {
  id: string;
  missionId: string;
  workerId?: string;
  type: MissionTraceEventType;
  severity: MissionTraceSeverity;
  title: string;
  summary: string;
  payloadPreview?: string;
  truthStatus: TruthStatus;
  createdAt: string;
};

const SECRET_RE =
  // gh[pousr]_ = classic GitHub 토큰(ghp_/gho_/ghu_/ghs_/ghr_). github_pat_ = 2022년 이후
  // 권장 형식인 fine-grained PAT — prefix(github_)·body underscore가 classic과 달라 위
  // gh[pousr]_ 규칙으로는 안 잡힌다. body가 base62라 hex blob 규칙([A-Fa-f0-9]{32,})도
  // 회피 가능 → 별도 alternation 없으면 평문 PAT가 trace preview에 그대로 노출된다.
  /(sk-[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{8,}|[A-Fa-f0-9]{32,}|AKIA[0-9A-Z]{12,})/g;

/** trace preview에서 시크릿 류를 마스킹 — raw secret/log는 절대 보관/노출하지 않는다. */
export function redactTracePreview(text: string | undefined, max = 240): string | undefined {
  if (!text) return undefined;
  const redacted = text.replace(SECRET_RE, "[redacted]");
  return redacted.length > max ? `${redacted.slice(0, max - 1)}…` : redacted;
}

function verificationSeverity(status: "pending" | "passed" | "failed" | "blocked"): MissionTraceSeverity {
  return status === "passed" ? "success" : status === "failed" ? "error" : status === "blocked" ? "warning" : "info";
}

// ── Per-component trace builders ─────────────────────────────────────────────
// 같은 매핑을 두 곳에서 쓴다: deriveMissionTrace(materialized record 전체 스냅샷)와
// traceEventFromMissionEnvelope(라이브 SSE 증분). 한 함수로 묶어 스냅샷/스트림이
// 절대 어긋나지 않게 한다.

function createdTraceEvent(
  mission: { missionId: string; title: string; truthStatus: TruthStatus; sourceSessionId?: string; debateId?: string; codingPacketId?: string },
  createdAt: string,
): MissionTraceEvent {
  // 출처(provenance)를 trace summary에 정직하게 노출 — 어느 세션/토론/패킷에서 왔는지.
  // 이전엔 record/응답엔 저장돼도 trace엔 안 보였다(=관측 불가). 있는 것만 덧붙인다.
  const lineage: string[] = [];
  if (mission.sourceSessionId) lineage.push(`출처 세션 ${mission.sourceSessionId}`);
  if (mission.debateId) lineage.push(`출처 토론 ${mission.debateId}`);
  if (mission.codingPacketId) lineage.push(`출처 패킷 ${mission.codingPacketId}`);
  const summary = lineage.length ? `${mission.title} · ${lineage.join(" · ")}` : mission.title;
  return {
    id: `${mission.missionId}:created`,
    missionId: mission.missionId,
    type: "mission.created",
    severity: "info",
    title: "미션 생성",
    summary,
    truthStatus: mission.truthStatus,
    createdAt,
  };
}

function workerTraceEvent(worker: MissionWorkerAssignment): MissionTraceEvent {
  return {
    id: `${worker.missionId}:worker:${worker.id}`,
    missionId: worker.missionId,
    workerId: worker.agentId,
    type: "worker.assigned",
    severity: "info",
    title: `워커 배정 · ${worker.role}`,
    summary: `${worker.agentId}${worker.branchName ? ` · ${worker.branchName}` : ""}`,
    truthStatus: "configured",
    createdAt: worker.assignedAt,
  };
}

function verificationTraceEvent(report: VerificationReport, createdAt: string): MissionTraceEvent {
  const failed = report.checks.find((check) => check.status === "failed");
  return {
    id: `${report.missionId}:verify:${report.id}`,
    missionId: report.missionId,
    workerId: report.verifierAgentId,
    type: "verification.recorded",
    severity: verificationSeverity(report.status),
    title: `검증 ${report.status === "passed" ? "통과" : report.status === "failed" ? "실패" : report.status}`,
    summary: `${report.checks.length}개 검사 · ${report.observed ? "실측(observed)" : "미관측"}`,
    payloadPreview: redactTracePreview(failed?.summary),
    truthStatus: report.observed ? "observed" : "simulated",
    createdAt,
  };
}

function checkpointTraceEvent(checkpoint: MissionCheckpoint): MissionTraceEvent {
  return {
    id: `${checkpoint.missionId}:checkpoint:${checkpoint.id}`,
    missionId: checkpoint.missionId,
    workerId: checkpoint.workerId,
    type: "checkpoint.created",
    severity: "info",
    title: `체크포인트 · ${checkpoint.reason}`,
    summary: `${checkpoint.gitRef} @ ${checkpoint.headSha.slice(0, 10)}`,
    truthStatus: "observed", // 실제 git rev-parse 관측 sha
    createdAt: checkpoint.createdAt,
  };
}

function workspaceTraceEvent(workspace: AppWorkspace): MissionTraceEvent {
  return {
    id: `${workspace.missionId}:workspace:${workspace.id}`,
    missionId: workspace.missionId,
    type: "workspace.attached",
    severity: "info",
    title: `작업공간 · ${workspace.appType}`,
    summary: `${workspace.repoRootRef}${workspace.worktreeRef ? ` · ${workspace.worktreeRef}` : ""} · preview ${workspace.preview.status}`,
    truthStatus: workspace.preview.truthStatus, // preview observed는 실제 포트 관측 시만
    createdAt: workspace.createdAt,
  };
}

function previewTraceEvent(missionId: string, workspaceId: string, preview: AppWorkspacePreview, createdAt: string): MissionTraceEvent {
  return {
    id: `${missionId}:preview:${workspaceId}:${preview.status}`,
    missionId,
    type: "preview.recorded",
    severity: preview.status === "running" ? "success" : preview.status === "failed" ? "warning" : "info",
    title: `프리뷰 · ${preview.status}`,
    summary: preview.url ? `${preview.url} (${preview.truthStatus})` : `포트 ${preview.port ?? "?"} · ${preview.truthStatus}`,
    truthStatus: preview.truthStatus, // running+바인딩 관측만 observed
    createdAt,
  };
}

function visualQaTraceEvent(report: VisualQaReport): MissionTraceEvent {
  return {
    id: `${report.missionId}:visualqa:${report.id}`,
    missionId: report.missionId,
    type: "visual_qa.recorded",
    severity: report.status === "failed" ? "error" : report.status === "warning" || report.status === "blocked" ? "warning" : "success",
    title: `비주얼 QA · ${report.status}`,
    summary: `${report.checks.length}개 검사 · 이슈 ${report.issues.length} · ${report.truthStatus === "observed" ? "실측" : "미관측"}`,
    truthStatus: report.truthStatus, // 실제 관측 항목 있을 때만 observed
    createdAt: report.createdAt,
  };
}

function designIssueTraceEvent(issue: DesignIssueCard): MissionTraceEvent {
  return {
    id: `${issue.missionId}:issue:${issue.id}`,
    missionId: issue.missionId,
    type: "design.issue.recorded",
    severity: issue.severity === "high" ? "error" : "warning",
    title: `디자인 이슈 · ${issue.kind}`,
    summary: `${issue.summary} → ${issue.recommendation}`,
    truthStatus: issue.truthStatus,
    createdAt: issue.createdAt,
  };
}

function scaffoldTraceEvent(plan: ScaffoldPlan): MissionTraceEvent {
  const applied = plan.apply?.status === "applied";
  return {
    id: `${plan.missionId}:scaffold:${plan.id}${applied ? ":applied" : ""}`,
    missionId: plan.missionId,
    type: applied ? "scaffold.applied" : "scaffold.planned",
    severity: plan.apply?.status === "blocked" || plan.apply?.status === "failed" ? "warning" : applied ? "success" : "info",
    title: applied ? `스캐폴드 적용 · ${plan.templateId}` : `스캐폴드 계획 · ${plan.templateId}`,
    summary: applied
      ? `${plan.apply?.appliedPaths.length ?? 0}개 파일 기록${plan.apply?.checkpointSha ? ` · cp ${plan.apply.checkpointSha.slice(0, 10)}` : ""}`
      : `${plan.files.length}개 파일 (덮어쓰기 ${plan.hasOverwrites ? "있음" : "없음"})`,
    truthStatus: applied ? (plan.apply?.observed ? "observed" : "configured") : "planned",
    createdAt: plan.apply?.appliedAt ?? plan.createdAt,
  };
}

function designBlueprintTraceEvent(blueprint: DesignBlueprint): MissionTraceEvent {
  return {
    id: `${blueprint.missionId}:blueprint:${blueprint.id}`,
    missionId: blueprint.missionId,
    type: "design.blueprint.recorded",
    severity: "info",
    title: `디자인 청사진 · ${blueprint.targetSurface}`,
    summary: `${blueprint.title} · ${blueprint.screens.length}개 화면 · ${blueprint.acceptanceCriteria.length}개 수용기준`,
    truthStatus: "planned", // 청사진은 계획 — 구현/관측 아님
    createdAt: blueprint.createdAt,
  };
}

function errorCardTraceEvent(card: SandboxErrorCard): MissionTraceEvent {
  const where = card.targetFile ? `${card.targetFile}${card.targetLine ? `:${card.targetLine}` : ""} · ` : "";
  return {
    id: `${card.missionId}:errorcard:${card.id}`,
    missionId: card.missionId,
    workerId: card.workerId,
    type: "error_card.recorded",
    severity: "error",
    title: `에러 카드 · ${card.errorClass ?? card.status}`,
    summary: `${where}${card.directive}`,
    payloadPreview: redactTracePreview(card.rootCause),
    truthStatus: card.truthStatus, // observed runtime error는 observed, blocked는 configured
    createdAt: card.createdAt,
  };
}

function selfCorrectionTraceEvent(record: MissionSelfCorrectionRecord): MissionTraceEvent {
  const stopped = record.action !== "retry";
  return {
    id: `${record.missionId}:selfcorrection:${record.id}`,
    missionId: record.missionId,
    workerId: record.workerId,
    type: stopped ? "self_correction.stopped" : "self_correction.started",
    severity: stopped ? "warning" : "info",
    title: stopped ? `자가수정 중단 (${record.action})` : `자가수정 제안 #${record.attempt}`,
    summary: record.directive ? `${record.reason} · ${record.directive}` : record.reason,
    truthStatus: "configured", // 제안일 뿐 — observed 아님
    createdAt: record.createdAt,
  };
}

function mergeTraceEvent(item: SequentialMergeQueueItem): MissionTraceEvent {
  const type: MissionTraceEventType =
    item.status === "merged" ? "merge.completed" : item.status === "conflict" ? "merge.conflict" : "merge.queued";
  const severity: MissionTraceSeverity =
    item.status === "merged" ? "success" : item.status === "conflict" ? "error" : "info";
  return {
    id: `${item.missionId}:merge:${item.id}`,
    missionId: item.missionId,
    type,
    severity,
    title:
      item.status === "merged"
        ? "머지 완료"
        : item.status === "conflict"
          ? "머지 충돌"
          : item.status === "dry_run"
            ? "머지 드라이런"
            : "머지 대기열",
    summary:
      item.status === "merged" && item.mergeCommitSha
        ? `${item.branchName} → ${item.mergeCommitSha.slice(0, 10)}`
        : item.status === "conflict"
          ? `${item.conflictFiles.length}개 충돌 파일`
          : item.reason,
    truthStatus:
      item.status === "merged" && item.mergeCommitSha ? "observed" : item.status === "dry_run" ? "configured" : "planned",
    createdAt: item.queuedAt,
  };
}

/**
 * mission 레코드의 구성요소(생성/워커/검증/머지)에서 trace 타임라인을 파생한다.
 * (터미널/승인 등 EventStorage 전역 이벤트로의 보강은 후속 — 여기서는 mission
 * 라이프사이클을 정직하게 재구성한다.)
 */
export function deriveMissionTrace(record: ServerMissionRecord): MissionTraceEvent[] {
  const events: MissionTraceEvent[] = [createdTraceEvent(record.mission, record.mission.createdAt)];
  for (const worker of record.workers) events.push(workerTraceEvent(worker));
  for (const workspace of record.workspaces ?? []) {
    events.push(workspaceTraceEvent(workspace));
    if (workspace.preview.status !== "not_started") {
      events.push(previewTraceEvent(workspace.missionId, workspace.id, workspace.preview, workspace.createdAt));
    }
  }
  for (const blueprint of record.designBlueprints ?? []) events.push(designBlueprintTraceEvent(blueprint));
  for (const report of record.visualQaReports ?? []) events.push(visualQaTraceEvent(report));
  for (const issue of record.designIssues ?? []) events.push(designIssueTraceEvent(issue));
  for (const plan of record.scaffoldPlans ?? []) events.push(scaffoldTraceEvent(plan));
  for (const checkpoint of record.checkpoints ?? []) events.push(checkpointTraceEvent(checkpoint));
  for (const report of record.verificationReports) events.push(verificationTraceEvent(report, report.createdAt));
  for (const card of record.errorCards ?? []) events.push(errorCardTraceEvent(card));
  for (const correction of record.selfCorrections ?? []) events.push(selfCorrectionTraceEvent(correction));
  for (const item of record.mergeQueueItems) events.push(mergeTraceEvent(item));
  return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * 하나의 mission.* 이벤트 봉투를 단일 trace 이벤트로 매핑한다 — 라이브 SSE 증분용.
 * deriveMissionTrace와 같은 빌더를 쓰므로 스냅샷과 스트림이 항상 일치한다. payload는
 * 신뢰하지 않고 스키마로 재검증하며, 매핑 대상이 아니거나 깨진 payload는 null(무시).
 * mission.closed는 별도 trace 이벤트를 만들지 않는다(머지/실패 이벤트가 이미 상태를 전달).
 */
export function traceEventFromMissionEnvelope(envelope: {
  type: string;
  payload: unknown;
  createdAt: string;
}): MissionTraceEvent | null {
  switch (envelope.type) {
    case "mission.created": {
      const parsed = missionCreatedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? createdTraceEvent(parsed.data, envelope.createdAt) : null;
    }
    case "mission.worker.assigned": {
      const parsed = missionWorkerAssignedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? workerTraceEvent(parsed.data.worker) : null;
    }
    case "mission.checkpoint.created": {
      const parsed = missionCheckpointRecordedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? checkpointTraceEvent(parsed.data.checkpoint) : null;
    }
    case "mission.workspace.attached": {
      const parsed = missionWorkspaceAttachedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? workspaceTraceEvent(parsed.data.workspace) : null;
    }
    case "mission.workspace.preview.recorded": {
      const parsed = missionWorkspacePreviewRecordedPayloadSchema.safeParse(envelope.payload);
      return parsed.success
        ? previewTraceEvent(parsed.data.missionId, parsed.data.workspaceId, parsed.data.preview, envelope.createdAt)
        : null;
    }
    case "mission.design.blueprint.recorded": {
      const parsed = missionDesignBlueprintRecordedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? designBlueprintTraceEvent(parsed.data.blueprint) : null;
    }
    case "mission.visual_qa.recorded": {
      const parsed = missionVisualQaRecordedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? visualQaTraceEvent(parsed.data.report) : null;
    }
    case "mission.design.issue.recorded": {
      const parsed = missionDesignIssueRecordedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? designIssueTraceEvent(parsed.data.issue) : null;
    }
    case "mission.scaffold.planned": {
      const parsed = missionScaffoldPlannedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? scaffoldTraceEvent(parsed.data.plan) : null;
    }
    case "mission.scaffold.applied": {
      const parsed = missionScaffoldAppliedPayloadSchema.safeParse(envelope.payload);
      if (!parsed.success) return null;
      // applied 이벤트는 plan 전체를 들고 있지 않으므로 결과만으로 경량 trace 이벤트를 만든다
      return {
        id: `${parsed.data.missionId}:scaffold:${parsed.data.planId}:applied`,
        missionId: parsed.data.missionId,
        type: "scaffold.applied",
        severity: parsed.data.result.status === "applied" ? "success" : "warning",
        title: `스캐폴드 적용 · ${parsed.data.result.status}`,
        summary: `${parsed.data.result.appliedPaths.length}개 파일 · ${parsed.data.result.reason}`,
        truthStatus: parsed.data.result.observed ? "observed" : "configured",
        createdAt: parsed.data.result.appliedAt,
      };
    }
    case "mission.error_card.recorded": {
      const parsed = missionErrorCardRecordedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? errorCardTraceEvent(parsed.data.errorCard) : null;
    }
    case "mission.self_correction.suggested":
    case "mission.self_correction.stopped": {
      const parsed = missionSelfCorrectionRecordSchema.safeParse(envelope.payload);
      return parsed.success ? selfCorrectionTraceEvent(parsed.data) : null;
    }
    case "mission.verification.recorded": {
      const parsed = missionVerificationRecordedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? verificationTraceEvent(parsed.data.report, parsed.data.report.createdAt) : null;
    }
    case "mission.merge.queued": {
      const parsed = missionMergeQueuedPayloadSchema.safeParse(envelope.payload);
      return parsed.success ? mergeTraceEvent(parsed.data.item) : null;
    }
    default:
      return null;
  }
}
