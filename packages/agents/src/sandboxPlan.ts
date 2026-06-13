import type {
  CodingPacket,
  MissionCapabilityMode,
  SandboxExecRequest,
  SandboxRunMode,
} from "@ai-orchestrator/protocol";

/**
 * Pure planning bridge between the product-kernel capability layer and the
 * SandboxRunner execution layer.
 *
 * Keeps "what a worker is allowed to do" (MissionCapabilityMode) and "how an
 * execution request is classified for a runner" (SandboxRunMode) explicitly
 * mapped, and turns a CodingPacket's verification plan into concrete sandbox
 * exec requests. No I/O — the runtime LegacyTmuxRunner consumes these.
 */

/** Capability mode → the run mode a sandbox runner enforces for that worker. */
export function sandboxRunModeForCapability(mode: MissionCapabilityMode): SandboxRunMode {
  switch (mode) {
    case "sandbox_build":
      return "build";
    case "sandbox_verify":
      return "verify";
    case "merge_recommend":
      return "merge_recommend";
    case "plan_only":
    case "research":
    case "memory_curate":
    case "conversation_only":
    default:
      // Non-executing roles can still drive read-only inspection commands.
      return "read_only";
  }
}

export type SandboxPlanInput = {
  packet: CodingPacket;
  missionId: string;
  workerId: string;
  /** run mode for the worker that will execute the plan; defaults to "verify" */
  mode?: SandboxRunMode;
  /** ISO timestamp; injected so the function stays pure/testable */
  now: string;
  cwd?: string;
  timeoutMs?: number;
};

/**
 * Turn a CodingPacket's verification plan into sandbox exec requests. The
 * verification plan is the part that is meant to run (pnpm test, typecheck,
 * …), so each line becomes one request under the worker's run mode.
 */
export function createSandboxPlanFromCodingPacket(input: SandboxPlanInput): SandboxExecRequest[] {
  const mode = input.mode ?? "verify";
  return input.packet.verificationPlan
    .map((command) => command.trim())
    .filter((command) => command.length > 0)
    .map((command, index) => ({
      id: `sandbox_exec_${input.missionId}_${input.workerId}_${index + 1}`,
      missionId: input.missionId,
      workerId: input.workerId,
      command,
      mode,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs,
      createdAt: input.now,
    }));
}
