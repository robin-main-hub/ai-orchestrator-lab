import type {
  SandboxCaptureResult,
  SandboxExecRequest,
  SandboxExecResult,
  SandboxKind,
  SandboxPreflightResult,
} from "@ai-orchestrator/protocol";

/**
 * The execution seam. Coding execution goes through a SandboxRunner instead of
 * touching tmux directly, so docker/gvisor/remote runners can be added later
 * behind the same shape without changing the persona or mission layers.
 *
 * The first implementation (createLegacyTmuxRunner) is a pure adapter over the
 * existing gated tmux dispatch/capture path — it adds the capability +
 * safe-command preflight gate and reuses, rather than replaces, the closed-loop
 * effects already in the runtime.
 */
export interface SandboxRunner {
  readonly kind: SandboxKind;
  /** Decide whether a command may run under its mode, and whether it still needs approval. */
  preflight(request: SandboxExecRequest): Promise<SandboxPreflightResult>;
  /** Dispatch the command (only after a passing preflight). Returns an observed status. */
  exec(request: SandboxExecRequest): Promise<SandboxExecResult>;
  /** Read the worker pane's latest output. */
  capture(workerId: string): Promise<SandboxCaptureResult>;
}
