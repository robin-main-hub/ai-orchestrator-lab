import type { EventEnvelope } from "@ai-orchestrator/protocol";
import type { StatusBadgeVariant } from "@/ui/status-badge";

/**
 * Project the autonomy.run.* events (recorded by autonomyRunEvents) back into a
 * per-run history for an audit/replay view. Pure, so it is unit-tested.
 */

export type AutonomyRunHistoryStatus = "completed" | "failed" | "awaiting_human" | "not_summoned" | "cancelled" | "running";

export type AutonomyRunSummary = {
  runId: string;
  personaName?: string;
  role?: string;
  goal?: string;
  stepCount: number;
  status: AutonomyRunHistoryStatus;
};

export function projectAutonomyRunHistory(events: ReadonlyArray<EventEnvelope>): AutonomyRunSummary[] {
  const byRun = new Map<string, AutonomyRunSummary>();
  const order: string[] = [];

  const ensure = (runId: string): AutonomyRunSummary => {
    let summary = byRun.get(runId);
    if (!summary) {
      summary = { runId, stepCount: 0, status: "running" };
      byRun.set(runId, summary);
      order.push(runId);
    }
    return summary;
  };

  for (const event of events) {
    if (!event.type.startsWith("autonomy.run.")) {
      continue;
    }
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const runId = typeof payload.runId === "string" ? payload.runId : event.correlationId;
    if (!runId) {
      continue;
    }
    const summary = ensure(runId);

    if (event.type === "autonomy.run.started") {
      summary.personaName = asString(payload.personaName);
      summary.role = asString(payload.role);
      summary.goal = asString(payload.goal);
    } else if (event.type === "autonomy.run.step") {
      summary.stepCount += 1;
    } else if (event.type === "autonomy.run.completed") {
      summary.status =
        payload.result === "not_summoned" ? "not_summoned" : (asString(payload.loopStatus) as AutonomyRunHistoryStatus) ?? "completed";
    }
  }

  return order.map((runId) => byRun.get(runId)!);
}

export function runHistoryStatusLabel(status: AutonomyRunHistoryStatus): string {
  switch (status) {
    case "completed":
      return "완료";
    case "failed":
      return "실패";
    case "awaiting_human":
      return "사람 승인 대기";
    case "not_summoned":
      return "소환 불가";
    case "cancelled":
      return "중지됨";
    case "running":
    default:
      return "실행 중";
  }
}

export function runHistoryStatusVariant(status: AutonomyRunHistoryStatus): StatusBadgeVariant {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "danger";
    case "awaiting_human":
      return "warning";
    case "not_summoned":
      return "muted";
    case "cancelled":
      return "muted";
    case "running":
    default:
      return "primary";
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
