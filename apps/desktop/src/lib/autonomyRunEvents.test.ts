import { eventEnvelopeSchema } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import {
  createAutonomyRunCompletedEvent,
  createAutonomyRunEvents,
  createAutonomyRunStartedEvent,
  createAutonomyRunStepEvent,
  type AutonomyRunEventContext,
} from "./autonomyRunEvents";
import type { AutonomyStepRow } from "./autonomyTimeline";
import type { PersonaTaskOutcome } from "./personaTaskRunner";

const ctx: AutonomyRunEventContext = {
  sessionId: "s1",
  runId: "run_42",
  personaName: "makise",
  role: "qa",
  mode: "auto_safe",
  goal: "Add a rate limiter",
  now: "2026-06-10T00:00:00.000Z",
};

const step: AutonomyStepRow = { step: 1, outcome: "completed", action: "dispatch_next", reason: "step completed" };

const completedOutcome: PersonaTaskOutcome = {
  ok: true,
  registry: { panes: [], sessions: [] },
  session: {
    id: "as_makise_%1",
    sessionId: "s1",
    agentId: "makise",
    role: "qa",
    backend: "tmux",
    paneId: "%1",
    status: "completed",
    createdAt: "2026-06-10T00:00:00.000Z",
  },
  loopStatus: "completed",
};

describe("autonomy run events", () => {
  it("produces schema-valid envelopes correlated by runId", () => {
    const events = createAutonomyRunEvents(ctx, [step], completedOutcome);
    expect(events).toHaveLength(3);
    for (const event of events) {
      expect(() => eventEnvelopeSchema.parse(event)).not.toThrow();
      expect(event.correlationId).toBe("run_42");
      expect(event.source).toBe("desktop");
      expect(event.redacted).toBe(true);
    }
    expect(events.map((e) => e.type)).toEqual([
      "autonomy.run.started",
      "autonomy.run.step",
      "autonomy.run.completed",
    ]);
  });

  it("captures the started context", () => {
    const event = createAutonomyRunStartedEvent(ctx);
    expect(event.payload).toMatchObject({ personaName: "makise", role: "qa", mode: "auto_safe", goal: "Add a rate limiter" });
  });

  it("captures a step's outcome and decision", () => {
    const event = createAutonomyRunStepEvent(ctx, step);
    expect(event.payload).toMatchObject({ step: 1, outcome: "completed", action: "dispatch_next" });
  });

  it("records the terminal loop status for a run", () => {
    expect(createAutonomyRunCompletedEvent(ctx, completedOutcome).payload).toMatchObject({
      result: "ran",
      loopStatus: "completed",
      agentId: "makise",
    });
  });

  it("records a summon refusal", () => {
    const refused: PersonaTaskOutcome = { ok: false, reason: "no_free_pane" };
    expect(createAutonomyRunCompletedEvent(ctx, refused).payload).toMatchObject({
      result: "not_summoned",
      reason: "no_free_pane",
    });
  });
});
