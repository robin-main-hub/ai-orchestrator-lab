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
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}
