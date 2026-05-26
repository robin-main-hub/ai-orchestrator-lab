import type { StatusBadgeVariant } from "@/ui/status-badge";

export function runtimeBadgeVariant(status: string): StatusBadgeVariant {
  const s = status.toLowerCase();
  if (s === "online" || s === "connected" || s === "ready" || s === "passed" || s === "synced") {
    return "success";
  }
  if (s === "syncing" || s === "running" || s === "active" || s === "recorded") {
    return "primary";
  }
  if (s === "degraded" || s === "queued" || s === "pending" || s === "pending_approval") {
    return "warning";
  }
  if (s === "offline" || s === "failed" || s === "blocked" || s === "unreachable") {
    return "danger";
  }
  return "muted";
}

export function approvalBadgeVariant(status: string): StatusBadgeVariant {
  const s = status.toLowerCase();
  if (s === "approved" || s === "allowed") return "success";
  if (s === "required" || s === "approval_required" || s === "waiting_approval") return "warning";
  if (s === "rejected" || s === "denied" || s === "blocked") return "danger";
  return "muted";
}
