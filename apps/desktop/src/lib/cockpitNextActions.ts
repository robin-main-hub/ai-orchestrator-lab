import type { OperatorCockpitSnapshot } from "@ai-orchestrator/protocol";
import type { ControlQueueContinuitySummary } from "./controlQueueContinuity";
import type { OrchestrationMaturityReport } from "./orchestrationMaturity";
import type { SettingsDiagnostics } from "./settingsDiagnostics";
import type { WorkTraceSearchItem } from "./workTraceSearch";
import { resolveOperatorWorkerDisplay } from "./operatorWorkerDisplay";

export type CockpitNextActionItem = {
  ctaLabel: string;
  id: string;
  label: string;
  priority: "high" | "normal" | "warning";
  source: "approval" | "control_queue" | "diagnostics" | "handoff" | "maturity" | "receipt" | "smoke" | "worker";
  targetSurface: "approvals" | "control_queue" | "diagnostics" | "fleet" | "handoffs" | "maturity" | "receipts";
};

export function deriveCockpitNextActions({
  controlQueue,
  diagnostics,
  maturity,
  snapshot,
  workTraceItems = [],
  limit = 3,
}: {
  controlQueue?: ControlQueueContinuitySummary;
  diagnostics: SettingsDiagnostics;
  maturity: OrchestrationMaturityReport;
  snapshot: OperatorCockpitSnapshot;
  workTraceItems?: WorkTraceSearchItem[];
  limit?: number;
}): CockpitNextActionItem[] {
  const unsafeReceiptCount = workTraceItems.filter((item) => !item.searchable).length;
  const candidates: CockpitNextActionItem[] = [
    ...(unsafeReceiptCount > 0
      ? [
          {
            ctaLabel: "영수증 점검",
            id: "receipt_unsafe",
            label: `공개 영수증 마스킹 점검: ${unsafeReceiptCount}건`,
            priority: "high" as const,
            source: "receipt" as const,
            targetSurface: "receipts" as const,
          },
        ]
      : []),
    ...snapshot.fleet
      .filter((worker) => worker.status === "blocked" || worker.status === "error")
      .map((worker) => ({
        ctaLabel: "워커 확인",
        id: `worker_${worker.workerId}`,
        label: `${resolveOperatorWorkerDisplay(worker).displayName}: ${worker.blockedReason ?? "차단 원인 확인"}`,
        priority: "high" as const,
        source: "worker" as const,
        targetSurface: "fleet" as const,
      })),
    ...snapshot.approvals.map((approval) => ({
      ctaLabel: "승인 대기열 보기",
      id: `approval_${approval.blockReason}`,
      label: `승인 필요: ${approvalBlockReasonLabel(approval.blockReason)}`,
      priority: approval.securityRisk === "high" ? ("high" as const) : ("warning" as const),
      source: "approval" as const,
      targetSurface: "approvals" as const,
    })),
    ...snapshot.handoffs
      .filter((handoff) => handoff.nextAction)
      .map((handoff) => ({
        ctaLabel: "인계 보기",
        id: `handoff_${handoff.ownerAgentId}`,
        label: handoff.nextAction,
        priority: handoff.missingInfoSlots.length > 0 ? ("warning" as const) : ("normal" as const),
        source: "handoff" as const,
        targetSurface: "handoffs" as const,
      })),
    ...(controlQueue?.hasItems
      ? [
          {
            ctaLabel: "큐 이어받기",
            id: "control_queue_followup",
            label: controlQueue.latestTitle ? `${controlQueue.label} — ${controlQueue.latestTitle}` : controlQueue.label,
            priority: "warning" as const,
            source: "control_queue" as const,
            targetSurface: "control_queue" as const,
          },
        ]
      : []),
    ...diagnostics.nextActions.map((action, index) => ({
      ctaLabel: "진단 보기",
      id: `diagnostics_${index}`,
      label: action,
      priority: "warning" as const,
      source: "diagnostics" as const,
      targetSurface: "diagnostics" as const,
    })),
    ...maturity.nextActions.map((action, index) => ({
      ctaLabel: "성숙도 보기",
      id: `maturity_${index}`,
      label: action,
      priority: maturity.overallStatus === "blocked" ? ("high" as const) : ("normal" as const),
      source: "maturity" as const,
      targetSurface: "maturity" as const,
    })),
    ...snapshot.fleet
      .filter((worker) => worker.status === "working")
      .map((worker) => ({
        ctaLabel: "워커 확인",
        id: `worker_active_${worker.workerId}`,
        label: `작업 중: ${resolveOperatorWorkerDisplay(worker).displayName} 결과 확인`,
        priority: "normal" as const,
        source: "worker" as const,
        targetSurface: "fleet" as const,
      })),
  ];

  return dedupeByLabel(candidates)
    .sort((left, right) => priorityRank(right.priority) - priorityRank(left.priority))
    .slice(0, limit);
}

function dedupeByLabel(items: CockpitNextActionItem[]): CockpitNextActionItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.label.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function priorityRank(priority: CockpitNextActionItem["priority"]) {
  if (priority === "high") return 3;
  if (priority === "warning") return 2;
  return 1;
}

function approvalBlockReasonLabel(reason: string) {
  const normalized = reason.trim().toLowerCase();
  if (normalized.includes("terminal_run") || normalized.includes("terminal run")) {
    return "터미널 실행 권한";
  }
  if (normalized.includes("file_write") || normalized.includes("write")) {
    return "파일 변경 권한";
  }
  if (normalized.includes("network") || normalized.includes("http")) {
    return "네트워크 접근 권한";
  }
  if (normalized.includes("danger") || normalized.includes("destructive")) {
    return "고위험 작업 권한";
  }
  return "승인 사유 확인";
}
