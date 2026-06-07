import type { OperatorCockpitSnapshot } from "@ai-orchestrator/protocol";
import type { OrchestrationMaturityReport } from "./orchestrationMaturity";
import type { SettingsDiagnostics } from "./settingsDiagnostics";
import type { WorkTraceSearchItem } from "./workTraceSearch";

export type CockpitNextActionItem = {
  id: string;
  label: string;
  priority: "high" | "normal" | "warning";
  source: "approval" | "diagnostics" | "handoff" | "maturity" | "receipt" | "smoke" | "worker";
};

export function deriveCockpitNextActions({
  diagnostics,
  maturity,
  snapshot,
  workTraceItems = [],
  limit = 3,
}: {
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
            id: "receipt_unsafe",
            label: `공개 영수증 마스킹 점검: ${unsafeReceiptCount}건`,
            priority: "high" as const,
            source: "receipt" as const,
          },
        ]
      : []),
    ...snapshot.fleet
      .filter((worker) => worker.status === "blocked" || worker.status === "error")
      .map((worker) => ({
        id: `worker_${worker.workerId}`,
        label: `${worker.workerId}: ${worker.blockedReason ?? "차단 원인 확인"}`,
        priority: "high" as const,
        source: "worker" as const,
      })),
    ...snapshot.approvals.map((approval) => ({
      id: `approval_${approval.blockReason}`,
      label: `승인 필요: ${approval.blockReason}`,
      priority: approval.securityRisk === "high" ? ("high" as const) : ("warning" as const),
      source: "approval" as const,
    })),
    ...snapshot.handoffs
      .filter((handoff) => handoff.nextAction)
      .map((handoff) => ({
        id: `handoff_${handoff.ownerAgentId}`,
        label: handoff.nextAction,
        priority: handoff.missingInfoSlots.length > 0 ? ("warning" as const) : ("normal" as const),
        source: "handoff" as const,
      })),
    ...diagnostics.nextActions.map((action, index) => ({
      id: `diagnostics_${index}`,
      label: action,
      priority: "warning" as const,
      source: "diagnostics" as const,
    })),
    ...maturity.nextActions.map((action, index) => ({
      id: `maturity_${index}`,
      label: action,
      priority: maturity.overallStatus === "blocked" ? ("high" as const) : ("normal" as const),
      source: "maturity" as const,
    })),
    ...snapshot.fleet
      .filter((worker) => worker.status === "working")
      .map((worker) => ({
        id: `worker_active_${worker.workerId}`,
        label: `작업 중: ${worker.workerId} 결과 확인`,
        priority: "normal" as const,
        source: "worker" as const,
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
