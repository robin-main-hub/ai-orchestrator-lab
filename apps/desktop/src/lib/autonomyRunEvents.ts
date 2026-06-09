import type { EventEnvelope } from "@ai-orchestrator/protocol";
import { sanitizePublicText } from "./publicRedaction";
import type { AutonomyMode } from "./autonomousRun";
import type { AutonomyStepRow } from "./autonomyTimeline";
import type { PersonaTaskOutcome } from "./personaTaskRunner";

/**
 * Map an autonomous run into event-store envelopes so runs are auditable and
 * replayable like everything else in this event-sourced system. Pure: callers
 * push the returned envelopes through the existing event-sync path.
 *
 * Event types (open string taxonomy):
 *   autonomy.run.started   — a run began (persona, role, mode, goal)
 *   autonomy.run.step      — one closed-loop iteration (outcome + decision)
 *   autonomy.run.completed — terminal outcome (loopStatus) or summon refusal
 *
 * All free text is redacted before it lands in an event.
 */

export type AutonomyRunEventContext = {
  sessionId: string;
  runId: string;
  personaName: string;
  role: string;
  mode: AutonomyMode;
  goal: string;
  now: string;
};

function envelope(type: string, ctx: AutonomyRunEventContext, payload: Record<string, unknown>, seq: number): EventEnvelope {
  return {
    id: `event_${ctx.runId}_${type.replace(/\./g, "_")}_${seq}`,
    sessionId: ctx.sessionId,
    type,
    payload,
    createdAt: ctx.now,
    source: "desktop",
    sourceTrust: "trusted",
    redacted: true,
    correlationId: ctx.runId,
  };
}

export function createAutonomyRunStartedEvent(ctx: AutonomyRunEventContext): EventEnvelope {
  return envelope(
    "autonomy.run.started",
    ctx,
    {
      runId: ctx.runId,
      personaName: sanitizePublicText(ctx.personaName),
      role: ctx.role,
      mode: ctx.mode,
      goal: sanitizePublicText(ctx.goal),
    },
    0,
  );
}

export function createAutonomyRunStepEvent(ctx: AutonomyRunEventContext, step: AutonomyStepRow): EventEnvelope {
  return envelope(
    "autonomy.run.step",
    ctx,
    {
      runId: ctx.runId,
      step: step.step,
      outcome: step.outcome,
      action: step.action,
      reason: sanitizePublicText(step.reason),
    },
    step.step,
  );
}

export function createAutonomyRunCompletedEvent(ctx: AutonomyRunEventContext, outcome: PersonaTaskOutcome): EventEnvelope {
  const payload: Record<string, unknown> = outcome.ok
    ? { runId: ctx.runId, result: "ran", loopStatus: outcome.loopStatus, agentId: outcome.session.agentId, paneId: outcome.session.paneId }
    : { runId: ctx.runId, result: "not_summoned", reason: outcome.reason };
  return envelope("autonomy.run.completed", ctx, payload, 9_999);
}

/** Convenience: the full envelope sequence for a finished run. */
export function createAutonomyRunEvents(
  ctx: AutonomyRunEventContext,
  steps: ReadonlyArray<AutonomyStepRow>,
  outcome: PersonaTaskOutcome,
): EventEnvelope[] {
  return [
    createAutonomyRunStartedEvent(ctx),
    ...steps.map((step) => createAutonomyRunStepEvent(ctx, step)),
    createAutonomyRunCompletedEvent(ctx, outcome),
  ];
}
