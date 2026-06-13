import type {
  MissionWorkerCapability,
  SandboxCaptureResult,
  SandboxExecRequest,
  SandboxExecResult,
  SandboxPreflightResult,
  SandboxRunMode,
} from "@ai-orchestrator/protocol";
import type { ClosedLoopEffects } from "./closedLoopController";
import { isAutoApprovableCommand } from "./safeCommandPolicy";
import type { SandboxRunner } from "./sandboxRunner";

/**
 * LegacyTmuxRunner — the compatibility adapter that puts the existing gated
 * tmux execution behind the SandboxRunner seam.
 *
 * It does NOT replace anything: `exec`/`capture` delegate to the
 * ClosedLoopEffects already wired to /tmux/dispatch + /tmux/capture. What it
 * adds is the preflight gate that ties execution to the product-kernel
 * capability + the safe-command allowlist, enforcing the core invariant:
 *
 *   permissionLevel grants the right to *request*; the runner preflight grants
 *   the right to *execute*. A companion with permissionLevel "write_files"
 *   whose capability cannot mutate files is still blocked from a build run.
 */
export type LegacyTmuxRunnerDeps = {
  capability: MissionWorkerCapability;
  /** existing closed-loop effects bound to the worker's pane (dispatch/capture) */
  effects: Pick<ClosedLoopEffects, "dispatch" | "capture">;
  now?: () => string;
  /** injectable for tests; defaults to the real safe-command allowlist */
  isCommandAutoApprovable?: typeof isAutoApprovableCommand;
};

export function createLegacyTmuxRunner(deps: LegacyTmuxRunnerDeps): SandboxRunner {
  const now = deps.now ?? (() => new Date().toISOString());
  const isSafe = deps.isCommandAutoApprovable ?? isAutoApprovableCommand;
  const { capability } = deps;

  async function preflight(request: SandboxExecRequest): Promise<SandboxPreflightResult> {
    // merge_recommend never executes — it may only produce a recommendation.
    if (request.mode === "merge_recommend") {
      return { allowed: false, requiresApproval: false, reason: "merge_recommend mode cannot execute commands" };
    }

    // A build run mutates files; only a capability that may mutate can request it.
    if (request.mode === "build" && !capability.canMutateFiles) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: `capability ${capability.mode} cannot mutate files (permission level is request-only)`,
      };
    }

    // Any execution at all requires a command-running capability.
    if (!capability.canRunCommands) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: `capability ${capability.mode} cannot run commands`,
      };
    }

    // read_only / verify: only allowlisted safe commands run, and they need no approval.
    if (request.mode === "read_only" || request.mode === "verify") {
      const verdict = isSafe(request.command);
      return verdict.allowed
        ? { allowed: true, requiresApproval: false, reason: verdict.reason }
        : { allowed: false, requiresApproval: false, reason: verdict.reason };
    }

    // build: allowed for a mutation-capable worker, but always behind approval.
    return { allowed: true, requiresApproval: true, reason: "build run requires human approval" };
  }

  async function exec(request: SandboxExecRequest): Promise<SandboxExecResult> {
    const gate = await preflight(request);
    if (!gate.allowed) {
      return { requestId: request.id, status: "blocked", observed: false, reason: gate.reason, observedAt: now() };
    }

    try {
      await deps.effects.dispatch(request.command, { stepIndex: 0 });
      return { requestId: request.id, status: "completed", observed: true, observedAt: now() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /timeout|timed out/i.test(message) ? "timeout" : "failed";
      return { requestId: request.id, status, observed: true, reason: message, observedAt: now() };
    }
  }

  async function capture(workerId: string): Promise<SandboxCaptureResult> {
    const outputPreview = await deps.effects.capture();
    return { workerId, outputPreview, observedAt: now() };
  }

  return { kind: "legacy_tmux", preflight, exec, capture };
}

/**
 * Wrap a worker's ClosedLoopEffects so every dispatch passes the SandboxRunner
 * preflight first. This is how the runner actually lands in the live autonomy
 * loop: capture/escalate/onStep pass through unchanged, but `dispatch` is
 * routed through LegacyTmuxRunner.exec — a blocked preflight throws (the loop
 * then escalates), and a passing one delegates to the original dispatch.
 *
 * Capability-free callers keep the un-gated effects, so this is opt-in and the
 * existing autonomy behavior is unchanged unless a capability is supplied.
 */
export function createSandboxGatedEffects(deps: {
  effects: ClosedLoopEffects;
  capability: MissionWorkerCapability;
  runMode: SandboxRunMode;
  missionId?: string;
  now?: () => string;
}): ClosedLoopEffects {
  const now = deps.now ?? (() => new Date().toISOString());
  const runner = createLegacyTmuxRunner({ capability: deps.capability, effects: deps.effects, now });
  const missionId = deps.missionId ?? "autonomy";
  let seq = 0;

  return {
    capture: deps.effects.capture,
    escalate: deps.effects.escalate,
    onStep: deps.effects.onStep,
    dispatch: async (command, context) => {
      const request: SandboxExecRequest = {
        id: `gated_${missionId}_${seq++}_${context.stepIndex}`,
        missionId,
        workerId: deps.capability.agentId,
        command,
        mode: deps.runMode,
        createdAt: now(),
      };
      const result = await runner.exec(request);
      if (result.status !== "completed") {
        throw new Error(`sandbox ${result.status}: ${result.reason ?? "preflight gate"}`);
      }
    },
  };
}
