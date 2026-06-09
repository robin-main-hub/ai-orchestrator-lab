import type { LoadedPersona } from "@ai-orchestrator/agents";
import type { AgentSession, CodingPacket } from "@ai-orchestrator/protocol";
import {
  createInitialLoopState,
  runClosedLoop,
  type ClosedLoopEffects,
  type LoopStatus,
} from "./closedLoopController";
import {
  failPersona,
  markRunning,
  releasePersona,
  summonPersona,
  type SummonContext,
  type SummonInput,
  type SummonRegistry,
} from "./personaSummon";
import { buildPersonaInjectionPlan } from "./personaSummonPlan";

/**
 * The capstone that ties #1 (closed-loop execution) and #2 (persona summon)
 * together: summon a persona into a pane, inject its identity, then drive a
 * CodingPacket's verification plan to completion in that pane — all through the
 * same gated dispatch path.
 *
 *   summonPersona            -> bind persona to a free pane (AgentSession)
 *   buildPersonaInjectionPlan -> identity preamble + kickoff task as steps
 *   runClosedLoop            -> drive verificationPlan until complete / fail /
 *                               escalate, reading captured output each step
 *
 * Side effects are confined to the injected `createEffects(session)` — in the
 * runtime that returns the mode-A adapter (dispatch -> approval -> replay), so
 * both identity injection and every verification step pass the permission/
 * approval/redaction gates. This composition itself performs no I/O beyond
 * those effects, so it is unit-tested with fakes.
 *
 * Pane lifecycle: completed -> release (pane freed), failed -> fail (pane
 * freed), awaiting_human -> session stays active (pane retained) until a human
 * resolves the queued approval.
 */

export type PersonaTaskOutcome =
  | { ok: true; registry: SummonRegistry; session: AgentSession; loopStatus: LoopStatus }
  | { ok: false; reason: "no_free_pane" | "already_summoned" };

export async function runPersonaCodingTask(input: {
  registry: SummonRegistry;
  summon: SummonInput;
  persona: LoadedPersona;
  packet: CodingPacket;
  ctx: SummonContext;
  /** returns the closed-loop effects bound to the summoned session's pane */
  createEffects: (session: AgentSession) => ClosedLoopEffects;
  /** first instruction after identity injection; defaults to the packet goal */
  kickoffTask?: string;
  maxIterations?: number;
  now?: () => string;
}): Promise<PersonaTaskOutcome> {
  const now = input.now ?? (() => new Date().toISOString());

  const summon = summonPersona(input.registry, input.summon, input.ctx);
  if (!summon.ok) {
    return { ok: false, reason: summon.reason };
  }

  const { session } = summon;
  let registry = markRunning(summon.registry, session.id, now());
  const effects = input.createEffects(session);

  // 1) Inject identity (+ kickoff task) through the gated dispatch path.
  const plan = buildPersonaInjectionPlan({
    session,
    persona: input.persona,
    kickoffTask: input.kickoffTask ?? input.packet.goal,
  });
  try {
    for (let index = 0; index < plan.steps.length; index += 1) {
      // Negative step indices keep injection ids distinct from verification steps.
      await effects.dispatch(plan.steps[index]!, { stepIndex: -(index + 1) });
    }
  } catch (error) {
    await safeEscalate(effects, `identity injection failed: ${describe(error)}`, session);
    registry = failPersona(registry, session.id, now());
    return { ok: true, registry, session, loopStatus: "failed" };
  }

  // 2) Drive the verification plan to a terminal state.
  const state = createInitialLoopState(input.packet.verificationPlan);
  const final = await runClosedLoop({ state, effects, maxIterations: input.maxIterations });

  // 3) Release / fail / retain the pane based on the loop outcome.
  if (final.status === "completed") {
    registry = releasePersona(registry, session.id, now());
  } else if (final.status === "failed") {
    registry = failPersona(registry, session.id, now());
  }
  // awaiting_human: leave the session active so the pane stays bound while a
  // human resolves the queued approval.

  return { ok: true, registry, session, loopStatus: final.status };
}

async function safeEscalate(effects: ClosedLoopEffects, reason: string, session: AgentSession): Promise<void> {
  try {
    await effects.escalate(reason, createInitialLoopState([]));
  } catch {
    // escalation is best-effort; swallow so the original failure is reported
    void session;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
