import type { LoadedPersona } from "@ai-orchestrator/agents";
import type { AgentSession, CodingPacket } from "@ai-orchestrator/protocol";
import type { ClosedLoopEffects } from "./closedLoopController";
import {
  createAutonomyEffectsFactory,
  type AutonomyClientOverrides,
  type AutonomyMode,
  type AutonomyServerConfig,
} from "./autonomousRun";
import {
  runParallelMissions,
  type Mission,
  type MissionResult,
  type MissionUpdate,
} from "./parallelMissions";
import { runSummonedMission } from "./personaTaskRunner";
import type { SummonContext, SummonInput, SummonRegistry } from "./personaSummon";

/**
 * App-level entry point for Manus/Kimi-style parallel agent execution: take N
 * persona missions, allocate each a distinct pane (a real terminal in the
 * runtime), and drive all of their closed loops concurrently behind the scenes
 * — every dispatch still flowing through the same permission/approval/redaction
 * gate as a single mission.
 *
 * This is pure wiring over two tested pieces — `runParallelMissions` (the
 * allocate-sequential / run-concurrent engine) and `runSummonedMission` (inject
 * identity + drive the verification plan) — joined by the shared autonomy
 * effects factory. So it is verified here with faked clients.
 */

export type ParallelMissionSpec = {
  /** stable id for streaming/labelling this mission in the UI */
  id: string;
  summon: SummonInput;
  persona: LoadedPersona;
  packet: CodingPacket;
  kickoffTask?: string;
};

export type RunParallelAutonomyInput = {
  registry: SummonRegistry;
  missions: ReadonlyArray<ParallelMissionSpec>;
  ctx: SummonContext;
  mode: AutonomyMode;
  server?: AutonomyServerConfig;
  clients?: AutonomyClientOverrides;
  /** max missions executing at once (default: all allocated) */
  maxConcurrency?: number;
  maxIterations?: number;
  runId?: string;
  now?: () => string;
  safePrefixes?: ReadonlyArray<string>;
  extraSafePrefixes?: ReadonlyArray<string>;
  logger?: (message: string) => void;
  /** running/done transitions per mission, for a live multi-terminal board */
  onMissionUpdate?: (update: MissionUpdate) => void;
  /** per-mission loop-iteration observer (drives each mission's terminal feed) */
  onMissionStep?: (missionId: string, step: Parameters<NonNullable<ClosedLoopEffects["onStep"]>>[0]) => void;
};

export async function runParallelAutonomy(
  input: RunParallelAutonomyInput,
): Promise<{ registry: SummonRegistry; results: MissionResult[] }> {
  const now = input.now ?? (() => new Date().toISOString());

  const missions: Mission[] = input.missions.map((spec) => ({
    id: spec.id,
    summon: spec.summon,
    persona: spec.persona,
    packet: spec.packet,
    kickoffTask: spec.kickoffTask,
  }));

  return runParallelMissions({
    registry: input.registry,
    missions,
    ctx: input.ctx,
    maxConcurrency: input.maxConcurrency,
    onUpdate: input.onMissionUpdate,
    now,
    runMission: async ({ mission, session }) => {
      // Each mission gets its own effects factory so the onStep observer and the
      // id-counter are scoped to this mission's pane — no cross-talk between the
      // concurrently running terminals.
      const createEffects = createAutonomyEffectsFactory({
        mode: input.mode,
        server: input.server,
        clients: input.clients,
        runId: input.runId ? `${input.runId}_${mission.id}` : mission.id,
        now,
        safePrefixes: input.safePrefixes,
        extraSafePrefixes: input.extraSafePrefixes,
        logger: input.logger,
        onStep: input.onMissionStep ? (step) => input.onMissionStep!(mission.id, step) : undefined,
      });

      return runSummonedMission({
        session,
        persona: mission.persona,
        packet: mission.packet,
        effects: createEffects(session as AgentSession),
        kickoffTask: mission.kickoffTask,
        maxIterations: input.maxIterations,
      });
    },
  });
}
