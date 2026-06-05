import type {
  OperatorCockpitApprovalEvidence,
  OperatorCockpitDispatchHistory,
  OperatorCockpitMemoryRecall,
  OperatorCockpitProviderRouting,
  OperatorCockpitRecovery,
  OperatorCockpitWorkerFleet,
} from "@ai-orchestrator/protocol";

export type BadgeColor = "green" | "yellow" | "red" | "gray" | "blue" | "purple" | "outline";

export function badgeColorForStatus(status: OperatorCockpitWorkerFleet["status"]): BadgeColor {
  if (status === "working") return "green";
  if (status === "waiting_approval") return "yellow";
  if (status === "blocked" || status === "error") return "red";
  return "gray";
}

export function badgeColorForPayload(status: OperatorCockpitApprovalEvidence["payloadBindingStatus"]): BadgeColor {
  if (status === "bound") return "green";
  if (status === "expired") return "red";
  return "yellow";
}

export function badgeColorForApproval(status: OperatorCockpitDispatchHistory["approvalState"]): BadgeColor {
  if (status === "approved" || status === "not_required") return "green";
  if (status === "required") return "yellow";
  if (status === "rejected" || status === "expired") return "red";
  return "gray";
}

export function badgeColorForMirror(status: OperatorCockpitMemoryRecall["dgxMirrorHealth"]): BadgeColor {
  if (status === "healthy") return "green";
  if (status === "degraded") return "yellow";
  return "red";
}

export function badgeColorForFallback(status: OperatorCockpitProviderRouting["fallbackStatus"]): BadgeColor {
  if (status === "available") return "green";
  if (status === "active") return "yellow";
  return "gray";
}

export function badgeColorForCost(status: OperatorCockpitProviderRouting["costBadge"]): BadgeColor {
  if (status === "low") return "green";
  if (status === "medium") return "yellow";
  return "red";
}

export function badgeColorForSpeed(status: OperatorCockpitProviderRouting["speedBadge"]): BadgeColor {
  if (status === "fast") return "green";
  if (status === "average") return "yellow";
  return "red";
}

export function badgeColorForTrust(status: OperatorCockpitProviderRouting["trustBadge"]): BadgeColor {
  if (status === "trusted") return "green";
  if (status === "limited") return "yellow";
  return "red";
}

export function badgeColorForOutbox(status: OperatorCockpitRecovery["outboxSyncStatus"]): BadgeColor {
  if (status === "synced") return "green";
  if (status === "pending") return "yellow";
  return "red";
}

export function workerStatusLabel(status: OperatorCockpitWorkerFleet["status"]) {
  const labels: Record<OperatorCockpitWorkerFleet["status"], string> = {
    blocked: "차단됨",
    error: "오류",
    idle: "대기",
    waiting_approval: "승인 대기",
    working: "작업 중",
  };
  return labels[status];
}

export function payloadBindingLabel(status: OperatorCockpitApprovalEvidence["payloadBindingStatus"]) {
  const labels: Record<OperatorCockpitApprovalEvidence["payloadBindingStatus"], string> = {
    bound: "페이로드 묶임",
    expired: "묶임 만료",
    unbound: "묶임 확인 필요",
  };
  return labels[status];
}

export function approvalStateLabel(status: OperatorCockpitDispatchHistory["approvalState"]) {
  const labels: Record<OperatorCockpitDispatchHistory["approvalState"], string> = {
    approved: "승인됨",
    expired: "만료됨",
    not_required: "승인 불필요",
    rejected: "거부됨",
    required: "승인 필요",
  };
  return labels[status];
}

export function mirrorHealthLabel(status: OperatorCockpitMemoryRecall["dgxMirrorHealth"]) {
  const labels: Record<OperatorCockpitMemoryRecall["dgxMirrorHealth"], string> = {
    degraded: "저하",
    disconnected: "연결 끊김",
    healthy: "정상",
  };
  return labels[status];
}

export function fallbackStatusLabel(status: OperatorCockpitProviderRouting["fallbackStatus"]) {
  const labels: Record<OperatorCockpitProviderRouting["fallbackStatus"], string> = {
    active: "대체 경로 사용 중",
    available: "대체 경로 있음",
    none: "대체 경로 없음",
  };
  return labels[status];
}

export function costBadgeLabel(status: OperatorCockpitProviderRouting["costBadge"]) {
  const labels: Record<OperatorCockpitProviderRouting["costBadge"], string> = {
    high: "고비용",
    low: "저비용",
    medium: "중간 비용",
  };
  return labels[status];
}

export function speedBadgeLabel(status: OperatorCockpitProviderRouting["speedBadge"]) {
  const labels: Record<OperatorCockpitProviderRouting["speedBadge"], string> = {
    average: "보통",
    fast: "빠름",
    slow: "느림",
  };
  return labels[status];
}

export function trustBadgeLabel(status: OperatorCockpitProviderRouting["trustBadge"]) {
  const labels: Record<OperatorCockpitProviderRouting["trustBadge"], string> = {
    limited: "제한 신뢰",
    trusted: "신뢰됨",
    untrusted: "비신뢰",
  };
  return labels[status];
}

export function outboxSyncLabel(status: OperatorCockpitRecovery["outboxSyncStatus"]) {
  const labels: Record<OperatorCockpitRecovery["outboxSyncStatus"], string> = {
    failed: "동기화 실패",
    pending: "동기화 대기",
    synced: "동기화됨",
  };
  return labels[status];
}

export function compactId(value: string, keep = 6) {
  if (value.length <= keep * 2 + 3) return value;
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

export function initials(value: string) {
  const parts = value.split(/[\s_-]+/).filter(Boolean);
  const first = parts[0] ?? value;
  const second = parts[1];
  const letters = second ? `${first[0] ?? ""}${second[0] ?? ""}` : first.slice(0, 2);
  return letters.toUpperCase();
}

export function formatClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function relativeMinutes(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(Math.round(diffMs / 60000), 0);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  return `${hours}시간 전`;
}
