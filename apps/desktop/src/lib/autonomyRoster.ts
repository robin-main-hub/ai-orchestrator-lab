import type { StatusBadgeVariant } from "@/ui/status-badge";
import type { SummonRegistry } from "./personaSummon";

/**
 * Present the shared pane pool (SummonRegistry) as roster rows for the UI: which
 * panes exist, which are busy, and which persona currently holds each. Pure, so
 * it is unit-tested.
 */

export type AutonomyRosterRow = {
  paneId: string;
  role: string;
  busy: boolean;
  agentId?: string;
};

export type AutonomyRosterSummary = {
  rows: AutonomyRosterRow[];
  busyCount: number;
  freeCount: number;
};

export function rosterFromRegistry(registry: SummonRegistry): AutonomyRosterSummary {
  const rows: AutonomyRosterRow[] = registry.panes.map((pane) => ({
    paneId: pane.paneId,
    role: pane.role,
    busy: pane.status === "busy",
    agentId: pane.agentId,
  }));
  const busyCount = rows.filter((row) => row.busy).length;
  return { rows, busyCount, freeCount: rows.length - busyCount };
}

export function rosterRowVariant(busy: boolean): StatusBadgeVariant {
  return busy ? "primary" : "muted";
}

export function rosterRowLabel(row: AutonomyRosterRow): string {
  return row.busy ? `${row.agentId ?? "?"} 점유` : "비어 있음";
}
