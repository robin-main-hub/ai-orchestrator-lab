import type { LoadedPersona } from "@ai-orchestrator/agents";
import type { AgentSession, CodingPacket, TerminalHostKind } from "@ai-orchestrator/protocol";
import { createAutoApproveStrategy } from "./autoApproveStrategy";
import type { ClosedLoopEffects } from "./closedLoopController";
import {
  createClosedLoopEffects,
  pollForApprovalDecision,
  type ApprovalDecisionOutcome,
} from "./closedLoopRuntime";
import type { PersonaAgentSet } from "./personaAgentSet";
import { runPersonaCodingTask, type PersonaTaskOutcome } from "./personaTaskRunner";
import type { SummonContext, SummonInput, SummonRegistry } from "./personaSummon";

/**
 * The single public entry point of the autonomy layer: given a persona, a
 * CodingPacket, and an autonomy mode, summon the persona, inject its identity,
 * and drive the packet's verification plan to a terminal state — wiring
 * together everything from #1 (closed loop) and #2 (persona summon).
 *
 *   mode "human"     -> every dispatch waits for a human grant (poll the queue)
 *   mode "auto_safe" -> safe verification commands auto-approve (mode B),
 *                       everything else falls back to the human poll
 *
 * All server I/O flows through the injected/real DGX clients; the dispatch path
 * always replays through the server gate, so neither mode bypasses
 * permission/approval/redaction. This module only wires the pieces — the
 * pieces themselves are independently tested — so it is verified here with
 * faked clients.
 */

export type AutonomyMode = "human" | "auto_safe";

export type ApprovalStrategy = (
  sourceItemId: string,
  context: { command: string },
) => Promise<ApprovalDecisionOutcome>;

export type AutonomyServerConfig = {
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  host?: TerminalHostKind;
  terminalSessionId?: string;
  tmuxSessionName?: string;
};

export type AutonomyClientOverrides = Partial<{
  dispatchClient: Parameters<typeof createClosedLoopEffects>[0]["dispatchClient"];
  captureClient: Parameters<typeof createClosedLoopEffects>[0]["captureClient"];
  replayClient: Parameters<typeof createClosedLoopEffects>[0]["replayClient"];
  grant: Parameters<typeof createAutoApproveStrategy>[0]["grant"];
  fetchQueue: Parameters<typeof pollForApprovalDecision>[0]["fetchQueue"];
}>;

/** Build the approval strategy for a mode: mode-A poll, optionally fronted by mode-B auto-approve. */
export function createApprovalStrategy(
  mode: AutonomyMode,
  config: AutonomyServerConfig & {
    clients?: AutonomyClientOverrides;
    pollIntervalMs?: number;
    pollTimeoutMs?: number;
    safePrefixes?: ReadonlyArray<string>;
    extraSafePrefixes?: ReadonlyArray<string>;
    logger?: (message: string) => void;
  } = {},
): ApprovalStrategy {
  const humanFallback: ApprovalStrategy = (sourceItemId) =>
    pollForApprovalDecision({
      sourceItemId,
      serverBaseUrl: config.serverBaseUrl,
      fetchImpl: config.fetchImpl,
      fetchQueue: config.clients?.fetchQueue,
      intervalMs: config.pollIntervalMs,
      timeoutMs: config.pollTimeoutMs,
    });

  if (mode === "auto_safe") {
    return createAutoApproveStrategy({
      fallback: humanFallback,
      grant: config.clients?.grant,
      serverBaseUrl: config.serverBaseUrl,
      fetchImpl: config.fetchImpl,
      safePrefixes: config.safePrefixes,
      extraSafePrefixes: config.extraSafePrefixes,
      logger: config.logger,
    });
  }
  return humanFallback;
}

export type RunAutonomousPersonaTaskInput = {
  registry: SummonRegistry;
  summon: SummonInput;
  persona: LoadedPersona;
  packet: CodingPacket;
  ctx: SummonContext;
  mode: AutonomyMode;
  server?: AutonomyServerConfig;
  clients?: AutonomyClientOverrides;
  kickoffTask?: string;
  /** persona's atomic agent set: fresh Hermes session boot + declared role travel with the soul */
  agentSet?: PersonaAgentSet;
  /** optional lorebook/world-info fragment appended to the identity injection */
  worldInfo?: string;
  maxIterations?: number;
  /** unique-id seed for dispatched commands; defaults to a timestamp-free counter prefix */
  runId?: string;
  now?: () => string;
  safePrefixes?: ReadonlyArray<string>;
  extraSafePrefixes?: ReadonlyArray<string>;
  logger?: (message: string) => void;
  /** observer invoked once per loop iteration (for a live timeline) */
  onStep?: ClosedLoopEffects["onStep"];
};

/**
 * Build the per-session closed-loop effects factory for an autonomy run: a
 * mode-aware approval strategy plus a gated dispatch/capture/replay adapter
 * bound to each summoned session's pane. Shared by the single-mission entry
 * point and the parallel runner so both drive identical, fully-gated effects.
 */
export function createAutonomyEffectsFactory(input: {
  mode: AutonomyMode;
  server?: AutonomyServerConfig;
  clients?: AutonomyClientOverrides;
  runId?: string;
  now?: () => string;
  safePrefixes?: ReadonlyArray<string>;
  extraSafePrefixes?: ReadonlyArray<string>;
  logger?: (message: string) => void;
  onStep?: ClosedLoopEffects["onStep"];
}): (session: AgentSession) => ClosedLoopEffects {
  const server = input.server ?? {};
  const runId = input.runId ?? "run";
  const now = input.now ?? (() => new Date().toISOString());

  const strategy = createApprovalStrategy(input.mode, {
    ...server,
    clients: input.clients,
    safePrefixes: input.safePrefixes,
    extraSafePrefixes: input.extraSafePrefixes,
    logger: input.logger,
  });

  return (session: AgentSession): ClosedLoopEffects => {
    // Monotonic counter guarantees unique dispatch ids (and thus approval
    // source ids) across iterations and captures within this run. Including
    // session.id in the prefix keeps ids distinct across parallel missions.
    let seq = 0;
    return createClosedLoopEffects({
      sessionId: session.sessionId,
      role: session.role,
      paneId: session.paneId,
      host: server.host,
      terminalSessionId: server.terminalSessionId,
      tmuxSessionName: server.tmuxSessionName,
      serverBaseUrl: server.serverBaseUrl,
      fetchImpl: server.fetchImpl,
      awaitApprovalDecision: strategy,
      newId: (stepIndex) => `${runId}_${session.id}_${seq++}_${stepIndex}`,
      now,
      escalateNotify: input.logger,
      onStep: input.onStep,
      dispatchClient: input.clients?.dispatchClient,
      captureClient: input.clients?.captureClient,
      replayClient: input.clients?.replayClient,
    });
  };
}

export async function runAutonomousPersonaTask(input: RunAutonomousPersonaTaskInput): Promise<PersonaTaskOutcome> {
  const now = input.now ?? (() => new Date().toISOString());

  const createEffects = createAutonomyEffectsFactory({
    mode: input.mode,
    server: input.server,
    clients: input.clients,
    runId: input.runId,
    now,
    safePrefixes: input.safePrefixes,
    extraSafePrefixes: input.extraSafePrefixes,
    logger: input.logger,
    onStep: input.onStep,
  });

  return runPersonaCodingTask({
    registry: input.registry,
    summon: input.summon,
    persona: input.persona,
    packet: input.packet,
    ctx: input.ctx,
    createEffects,
    kickoffTask: input.kickoffTask,
    agentSet: input.agentSet,
    worldInfo: input.worldInfo,
    maxIterations: input.maxIterations,
    now,
  });
}
