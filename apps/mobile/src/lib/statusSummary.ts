import type { RuntimeStatus } from "../types";

export function pendingApprovalLabel(count: number, loading: boolean): string {
  if (loading) return "checking";
  if (count === 0) return "clear";
  return `${count} pending`;
}

export function connectionHealthLabel(status: RuntimeStatus): string {
  switch (status) {
    case "online":
      return "online";
    case "syncing":
      return "syncing";
    case "degraded":
      return "fallback";
    case "offline":
      return "offline";
    case "unknown":
      return "unknown";
  }
}
