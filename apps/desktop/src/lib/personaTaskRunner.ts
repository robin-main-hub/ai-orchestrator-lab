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
import type { PersonaAgentSet } from "./personaAgentSet";
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
  /** persona's atomic agent set: fresh Hermes session boot + declared role travel with the soul */
  agentSet?: PersonaAgentSet;
  /** optional lorebook/world-info fragment appended to the identity injection */
  worldInfo?: string;
  maxIterations?: number;
  /** cooperative cancellation — resolves the mission as "cancelled" at the next loop boundary */
  signal?: AbortSignal;
  now?: () => string;
}): Promise<PersonaTaskOutcome> {
  const now = input.now ?? (() => new Date().toISOString());

  const summon = summonPersona(input.registry, input.summon, input.ctx);
  if (!summon.ok) {
    return { ok: false, reason: summon.reason };
  }

  const { session } = summon;
  let registry = markRunning(summon.registry, session.id, now());
  const loopStatus = await runSummonedMission({
    session,
    persona: input.persona,
    packet: input.packet,
    effects: input.createEffects(session),
    kickoffTask: input.kickoffTask,
    agentSet: input.agentSet,
    worldInfo: input.worldInfo,
    maxIterations: input.maxIterations,
    signal: input.signal,
  });

  // Release / fail / retain the pane based on the loop outcome. awaiting_human
  // keeps the session active so the pane stays bound until a human resolves it.
  // cancelled releases the pane too — a stopped mission must not leak its pane.
  if (loopStatus === "completed" || loopStatus === "cancelled") {
    registry = releasePersona(registry, session.id, now());
  } else if (loopStatus === "failed") {
    registry = failPersona(registry, session.id, now());
  }

  return { ok: true, registry, session, loopStatus };
}

/**
 * Inject a summoned persona's identity and drive its CodingPacket verification
 * plan to a terminal LoopStatus. Does NOT touch the registry — the caller owns
 * pane allocation/release. Extracted so the parallel runner can drive many
 * already-summoned sessions concurrently without registry contention.
 */
export async function runSummonedMission(input: {
  session: AgentSession;
  persona: LoadedPersona;
  packet: CodingPacket;
  effects: ClosedLoopEffects;
  kickoffTask?: string;
  /** persona's atomic agent set: boots a fresh Hermes session before injecting the identity */
  agentSet?: PersonaAgentSet;
  /** optional lorebook/world-info fragment appended to the identity injection */
  worldInfo?: string;
  maxIterations?: number;
  /** cooperative cancellation — resolves the mission as "cancelled" at the next loop boundary */
  signal?: AbortSignal;
}): Promise<LoopStatus> {
  const { session, effects } = input;
  const plan = buildPersonaInjectionPlan({
    session,
    persona: input.persona,
    kickoffTask: input.kickoffTask ?? input.packet.goal,
    agentSet: input.agentSet,
    worldInfo: input.worldInfo,
  });
  try {
    if (input.signal?.aborted) return "cancelled";
    for (let index = 0; index < plan.steps.length; index += 1) {
      if (input.signal?.aborted) return "cancelled";
      await effects.dispatch(plan.steps[index]!, { stepIndex: -(index + 1) });
    }
  } catch (error) {
    // A dispatch failing while we are being cancelled is the cancel, not a failure
    // (e.g. the approval poll waking up on abort) — mirror runClosedLoop's rule.
    if (input.signal?.aborted) return "cancelled";
    await safeEscalate(effects, `identity injection failed: ${describe(error)}`, session);
    return "failed";
  }

  const state = createInitialLoopState(input.packet.verificationPlan);
  const final = await runClosedLoop({ state, effects, maxIterations: input.maxIterations, signal: input.signal });
  return final.status;
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
