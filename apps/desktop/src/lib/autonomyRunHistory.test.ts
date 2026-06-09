import type { EventEnvelope } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import {
  projectAutonomyRunHistory,
  runHistoryStatusLabel,
  runHistoryStatusVariant,
} from "./autonomyRunHistory";

const event = (type: string, runId: string, payload: Record<string, unknown>): EventEnvelope => ({
  id: `e_${type}_${runId}_${JSON.stringify(payload).length}`,
  sessionId: "s1",
  type,
  payload: { runId, ...payload },
  createdAt: "2026-06-10T00:00:00.000Z",
  source: "desktop",
  sourceTrust: "trusted",
  redacted: true,
  correlationId: runId,
});

describe("projectAutonomyRunHistory", () => {
  it("groups events into per-run summaries in first-seen order", () => {
    const history = projectAutonomyRunHistory([
      event("autonomy.run.started", "r1", { personaName: "makise", role: "qa", goal: "fix bug" }),
      event("autonomy.run.step", "r1", { step: 1 }),
      event("autonomy.run.step", "r1", { step: 2 }),
      event("autonomy.run.completed", "r1", { result: "ran", loopStatus: "completed" }),
      event("autonomy.run.started", "r2", { personaName: "builder", role: "code", goal: "add feature" }),
      event("autonomy.run.completed", "r2", { result: "not_summoned", reason: "no_free_pane" }),
    ]);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ runId: "r1", personaName: "makise", goal: "fix bug", stepCount: 2, status: "completed" });
    expect(history[1]).toMatchObject({ runId: "r2", personaName: "builder", status: "not_summoned" });
  });

  it("ignores non-autonomy events and marks an unfinished run as running", () => {
    const history = projectAutonomyRunHistory([
      event("conversation.message", "x", {}),
      event("autonomy.run.started", "r3", { personaName: "yui" }),
      event("autonomy.run.step", "r3", { step: 1 }),
    ]);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ runId: "r3", stepCount: 1, status: "running" });
  });

  it("labels and colors statuses", () => {
    expect(runHistoryStatusLabel("not_summoned")).toBe("소환 불가");
    expect(runHistoryStatusVariant("completed")).toBe("success");
    expect(runHistoryStatusVariant("failed")).toBe("danger");
  });
});
