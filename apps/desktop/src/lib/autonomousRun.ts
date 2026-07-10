import { sandboxRunModeForCapability, type LoadedPersona } from "@ai-orchestrator/agents";
import type { AgentSession, CodingPacket, MissionWorkerCapability, TerminalHostKind } from "@ai-orchestrator/protocol";
import { createAutoApproveAllStrategy, createAutoApproveStrategy } from "./autoApproveStrategy";
import { createPatternApprovalStrategy } from "./sessionPatternApproval";
import { grantDgxApproval } from "../runtime/stage34ApprovalServer";
import type { ClosedLoopEffects } from "./closedLoopController";
import { createSandboxGatedEffects } from "./legacyTmuxRunner";
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
 *   mode "full_auto" -> 완전 자동: 위험 명령 카브아웃 없이 모든 명령을 자동 승인한다
 *                       (사용자 확정 "예외 없이 전부 자동 승인"). 사람 승인 게이트는 사라지지만
 *                       그랜트는 여전히 서버 grant 를 round-trip 해 append-only 감사에 남는다.
 *
 * All server I/O flows through the injected/real DGX clients; the dispatch path
 * always replays through the server gate, so no mode bypasses the server's
 * append-only record-keeping/redaction — full_auto removes the *human*, not the
 * server's grant round-trip. This module only wires the pieces — the pieces
 * themselves are independently tested — so it is verified here with faked clients.
 */

export type AutonomyMode = "human" | "auto_safe" | "full_auto";

export type ApprovalStrategy = (
  sourceItemId: string,
  context: { command: string; stepIndex?: number },
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

/**
 * Build the approval strategy for a mode, composing (inner → outer):
 *   human poll  ←  pattern (remembered prefixes)  ←  auto_safe  ←  full-auto
 * Each layer auto-grants what it can and defers everything else inward.
 *
 * mode "full_auto"(또는 legacy `autoApproveAll` 플래그)는 최상위에 전체 자동 레이어를 얹는다:
 *   - "full_auto": 위험 명령 카브아웃 없이 전부 자동 승인(사용자 확정 "예외 없이 전부").
 *   - `autoApproveAll` 플래그(guided_auto): DANGEROUS_PATTERN만 사람으로 카브아웃하는 등급형.
 * 어느 쪽이든 그랜트는 서버 grant 를 통과해 감사에 남는다.
 */
export function createApprovalStrategy(
  mode: AutonomyMode,
  config: AutonomyServerConfig & {
    clients?: AutonomyClientOverrides;
    pollIntervalMs?: number;
    pollTimeoutMs?: number;
    safePrefixes?: ReadonlyArray<string>;
    extraSafePrefixes?: ReadonlyArray<string>;
    /** 사용자가 "이 계열 항상 허용"으로 기억시킨 prefix 목록(세션 영속). 위험 명령은 여전히 게이트. */
    getApprovedPrefixes?: () => ReadonlyArray<string>;
    /** 전체 자동(full-auto) — DANGEROUS_PATTERN 제외 전부 자동 승인. 사용자가 명시적으로 켠다. */
    autoApproveAll?: boolean;
    logger?: (message: string) => void;
    signal?: AbortSignal;
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
      signal: config.signal,
    });

  const grantFn = config.clients?.grant ?? grantDgxApproval;
  let strategy: ApprovalStrategy = humanFallback;

  // 기억된 계열(prefix) 자동 승인 — 위험 명령은 matchesApprovedPrefix가 거부한다.
  if (config.getApprovedPrefixes) {
    const base = strategy;
    strategy = createPatternApprovalStrategy({
      base,
      getApprovedPrefixes: config.getApprovedPrefixes,
      grant: async (sourceItemId, ctx) => {
        const result = await grantFn({
          request: { sourceItemId, actor: "agent", reason: `pattern auto-approve: "${ctx.prefix}"` },
          serverBaseUrl: config.serverBaseUrl,
          fetchImpl: config.fetchImpl,
        });
        return "status" in result && result.status === "approved";
      },
      logger: config.logger,
    });
  }

  if (mode === "auto_safe") {
    strategy = createAutoApproveStrategy({
      fallback: strategy,
      grant: config.clients?.grant,
      serverBaseUrl: config.serverBaseUrl,
      fetchImpl: config.fetchImpl,
      safePrefixes: config.safePrefixes,
      extraSafePrefixes: config.extraSafePrefixes,
      logger: config.logger,
    });
  }

  if (mode === "full_auto" || config.autoApproveAll) {
    strategy = createAutoApproveAllStrategy({
      fallback: strategy,
      grant: config.clients?.grant,
      serverBaseUrl: config.serverBaseUrl,
      fetchImpl: config.fetchImpl,
      // "full_auto"는 위험 명령 카브아웃을 건너뛴다(완전 자동). guided_auto 플래그는 카브아웃 유지.
      includeDangerous: mode === "full_auto",
      logger: config.logger,
    });
  }

  return strategy;
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
  /** cooperative cancellation — aborting resolves the run with loopStatus "cancelled" (audit events still emitted by the caller) */
  signal?: AbortSignal;
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
  signal?: AbortSignal;
  onStep?: ClosedLoopEffects["onStep"];
  /**
   * When provided, every dispatch is routed through the SandboxRunner preflight
   * (capability + safe-command gate) before reaching tmux. Opt-in: without a
   * capability the autonomy loop keeps its existing un-gated effects.
   */
  capability?: MissionWorkerCapability;
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
    signal: input.signal,
  });

  return (session: AgentSession): ClosedLoopEffects => {
    // Monotonic counter guarantees unique dispatch ids (and thus approval
    // source ids) across iterations and captures within this run. Including
    // session.id in the prefix keeps ids distinct across parallel missions.
    let seq = 0;
    const base = createClosedLoopEffects({
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

    if (!input.capability) {
      return base;
    }
    return createSandboxGatedEffects({
      effects: base,
      capability: input.capability,
      runMode: sandboxRunModeForCapability(input.capability.mode),
      missionId: runId,
      now,
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
    signal: input.signal,
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
    signal: input.signal,
    now,
  });
}
