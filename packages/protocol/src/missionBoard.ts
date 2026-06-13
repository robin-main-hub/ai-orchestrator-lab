import { z } from "zod";
import type {
  OrchestrationMissionStatus,
  ServerMissionRecord,
  TruthStatus,
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
  "sandbox.preflight",
  "sandbox.exec.started",
  "sandbox.exec.completed",
  "sandbox.exec.failed",
  "verification.recorded",
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
  /(sk-[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|[A-Fa-f0-9]{32,}|AKIA[0-9A-Z]{12,})/g;

/** trace preview에서 시크릿 류를 마스킹 — raw secret/log는 절대 보관/노출하지 않는다. */
export function redactTracePreview(text: string | undefined, max = 240): string | undefined {
  if (!text) return undefined;
  const redacted = text.replace(SECRET_RE, "[redacted]");
  return redacted.length > max ? `${redacted.slice(0, max - 1)}…` : redacted;
}

function verificationSeverity(status: "pending" | "passed" | "failed" | "blocked"): MissionTraceSeverity {
  return status === "passed" ? "success" : status === "failed" ? "error" : status === "blocked" ? "warning" : "info";
}

/**
 * mission 레코드의 구성요소(생성/워커/검증/머지)에서 trace 타임라인을 파생한다.
 * (터미널/승인 등 EventStorage 전역 이벤트로의 보강은 후속 — 여기서는 mission
 * 라이프사이클을 정직하게 재구성한다.)
 */
export function deriveMissionTrace(record: ServerMissionRecord): MissionTraceEvent[] {
  const missionId = record.mission.missionId;
  const events: MissionTraceEvent[] = [];

  events.push({
    id: `${missionId}:created`,
    missionId,
    type: "mission.created",
    severity: "info",
    title: "미션 생성",
    summary: record.mission.title,
    truthStatus: record.mission.truthStatus,
    createdAt: record.mission.createdAt,
  });

  for (const worker of record.workers) {
    events.push({
      id: `${missionId}:worker:${worker.id}`,
      missionId,
      workerId: worker.agentId,
      type: "worker.assigned",
      severity: "info",
      title: `워커 배정 · ${worker.role}`,
      summary: `${worker.agentId}${worker.branchName ? ` · ${worker.branchName}` : ""}`,
      truthStatus: "configured",
      createdAt: worker.assignedAt,
    });
  }

  for (const report of record.verificationReports) {
    const failed = report.checks.find((check) => check.status === "failed");
    events.push({
      id: `${missionId}:verify:${report.id}`,
      missionId,
      workerId: report.verifierAgentId,
      type: "verification.recorded",
      severity: verificationSeverity(report.status),
      title: `검증 ${report.status === "passed" ? "통과" : report.status === "failed" ? "실패" : report.status}`,
      summary: `${report.checks.length}개 검사 · ${report.observed ? "실측(observed)" : "미관측"}`,
      payloadPreview: redactTracePreview(failed?.summary),
      truthStatus: report.observed ? "observed" : "simulated",
      createdAt: report.createdAt,
    });
  }

  for (const item of record.mergeQueueItems) {
    const type: MissionTraceEventType =
      item.status === "merged" ? "merge.completed" : item.status === "conflict" ? "merge.conflict" : "merge.queued";
    const severity: MissionTraceSeverity =
      item.status === "merged" ? "success" : item.status === "conflict" ? "error" : "info";
    events.push({
      id: `${missionId}:merge:${item.id}`,
      missionId,
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
      truthStatus: item.status === "merged" && item.mergeCommitSha ? "observed" : item.status === "dry_run" ? "configured" : "planned",
      createdAt: item.queuedAt,
    });
  }

  return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
