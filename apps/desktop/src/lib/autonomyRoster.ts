import type { TmuxPaneRole } from "@ai-orchestrator/protocol";
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

export type RolePaneOption = {
  role: TmuxPaneRole;
  paneId?: string;
  busy: boolean;
  occupantId?: string;
  /** "비어 있음" 또는 "<persona> 점유" */
  statusLabel: string;
};

/**
 * 역할 선택 드롭다운 한 줄 = 선택 가능한 역할 + 해당 pane의 점유 상태.
 * 로스터 줄글을 따로 보여주는 대신 역할을 고르는 자리에서 상태를 본다.
 * 로스터가 없으면(레지스트리 미연결) 상태 없이 역할만 나열한다.
 */
export function buildRolePaneOptions(
  roles: ReadonlyArray<TmuxPaneRole>,
  roster?: AutonomyRosterSummary,
): RolePaneOption[] {
  return roles.map((role) => {
    const row = roster?.rows.find((candidate) => candidate.role === role);
    if (!row) {
      return { role, busy: false, statusLabel: "비어 있음" };
    }
    return {
      role,
      paneId: row.paneId,
      busy: row.busy,
      occupantId: row.agentId,
      statusLabel: rosterRowLabel(row),
    };
  });
}
