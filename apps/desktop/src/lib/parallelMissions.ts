import type { LoadedPersona } from "@ai-orchestrator/agents";
import type { AgentSession, CodingPacket } from "@ai-orchestrator/protocol";
import type { LoopStatus } from "./closedLoopController";
import {
  failPersona,
  markRunning,
  releasePersona,
  summonPersona,
  type SummonContext,
  type SummonInput,
  type SummonRegistry,
} from "./personaSummon";

/**
 * Parallel mission runner — drive N persona missions at once, each in its own
 * pane (a real tmux pane in the runtime), like Manus/Kimi opening a terminal
 * per agent.
 *
 * The hard part is pane allocation: summoning N missions from the SAME registry
 * snapshot concurrently would make them all grab the same free pane. So this
 * splits the two phases:
 *   - allocate (SEQUENTIAL over the shared registry) — guarantees each mission
 *     gets a distinct pane, or is rejected (no_free_pane / already_summoned).
 *   - run (CONCURRENT, bounded pool) — each mission's loop runs on its already-
 *     allocated session and never mutates the registry; terminal pane
 *     transitions (release/fail) are folded back sequentially at the end.
 * The loop execution itself is injected (`runMission`), so this is pure and
 * fully unit-tested; the runtime binds it to gated dispatch/capture effects.
 */

export type Mission = {
  id: string;
  summon: SummonInput;
  persona: LoadedPersona;
  packet: CodingPacket;
  kickoffTask?: string;
};

export type MissionAllocation = { mission: Mission; session: AgentSession };
export type MissionRejection = { mission: Mission; reason: "no_free_pane" | "already_summoned" };

export type AllocationResult = {
  registry: SummonRegistry;
  allocations: MissionAllocation[];
  rejected: MissionRejection[];
};

/** Summon each mission sequentially so no two grab the same pane. Pure. */
export function allocateMissions(
  registry: SummonRegistry,
  missions: ReadonlyArray<Mission>,
  ctx: SummonContext,
): AllocationResult {
  let current = registry;
  const allocations: MissionAllocation[] = [];
  const rejected: MissionRejection[] = [];
  for (const mission of missions) {
    const result = summonPersona(current, mission.summon, ctx);
    if (result.ok) {
      current = markRunning(result.registry, result.session.id, ctx.now);
      allocations.push({ mission, session: result.session });
    } else {
      rejected.push({ mission, reason: result.reason });
    }
  }
  return { registry: current, allocations, rejected };
}

export type MissionResult =
  | { missionId: string; ok: true; session: AgentSession; loopStatus: LoopStatus }
  | { missionId: string; ok: false; reason: "no_free_pane" | "already_summoned" };

export type MissionUpdate = {
  missionId: string;
  phase: "running" | "done";
  loopStatus?: LoopStatus;
};

export type RunParallelMissionsInput = {
  registry: SummonRegistry;
  missions: ReadonlyArray<Mission>;
  ctx: SummonContext;
  /** drive an allocated mission's loop to a terminal status (no registry mutation) */
  runMission: (allocation: MissionAllocation) => Promise<LoopStatus>;
  /** max missions executing at once (default: all allocated) */
  maxConcurrency?: number;
  /** live per-mission phase updates */
  onUpdate?: (update: MissionUpdate) => void;
  /** fired once after the allocation phase, before any mission runs — gives callers (broadcast/check-in) the live session bindings */
  onAllocate?: (allocations: ReadonlyArray<MissionAllocation>) => void;
  now?: () => string;
};

export async function runParallelMissions(
  input: RunParallelMissionsInput,
): Promise<{ registry: SummonRegistry; results: MissionResult[] }> {
  const now = input.now ?? (() => new Date().toISOString());
  const { registry, allocations, rejected } = allocateMissions(input.registry, input.missions, input.ctx);
  input.onAllocate?.(allocations);

  const results: MissionResult[] = rejected.map((entry) => ({
    missionId: entry.mission.id,
    ok: false,
    reason: entry.reason,
  }));

  const statusById = new Map<string, LoopStatus>();
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < allocations.length) {
      const allocation = allocations[cursor]!;
      cursor += 1;
      input.onUpdate?.({ missionId: allocation.mission.id, phase: "running" });
      let status: LoopStatus;
      try {
        status = await input.runMission(allocation);
      } catch {
        status = "failed";
      }
      statusById.set(allocation.mission.id, status);
      input.onUpdate?.({ missionId: allocation.mission.id, phase: "done", loopStatus: status });
    }
  };

  const poolSize = Math.max(1, Math.min(input.maxConcurrency ?? allocations.length, allocations.length || 1));
  await Promise.all(Array.from({ length: Math.min(poolSize, allocations.length) }, () => worker()));

  // Fold terminal pane transitions back into the shared registry sequentially.
  let finalRegistry = registry;
  for (const allocation of allocations) {
    const status = statusById.get(allocation.mission.id) ?? "failed";
    if (status === "completed") {
      finalRegistry = releasePersona(finalRegistry, allocation.session.id, now());
    } else if (status === "failed") {
      finalRegistry = failPersona(finalRegistry, allocation.session.id, now());
    }
    // awaiting_human keeps the pane bound until a human resolves it.
    results.push({ missionId: allocation.mission.id, ok: true, session: allocation.session, loopStatus: status });
  }

  return { registry: finalRegistry, results };
}
