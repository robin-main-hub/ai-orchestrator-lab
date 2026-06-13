import { describe, expect, it, vi } from "vitest";
import type { LocalExecOutcome } from "./localSandboxRunner.js";
import type { DockerSandboxRunnerConfig } from "./dockerSandboxRunner.js";
import { runGVisorSandboxExec } from "./gvisorSandboxRunner.js";

const config: DockerSandboxRunnerConfig = {
  image: "node:20-slim",
  worktreePath: "/repo/.worktrees/m1",
  repoMountMode: "rw_worktree",
  network: "none",
  memoryMb: 512,
  timeoutMs: 60_000,
};
const now = () => "2026-06-13T00:00:00.000Z";

describe("runGVisorSandboxExec", () => {
  it("blocks (not observed) when runsc is unavailable — no fake gVisor", async () => {
    const exec = vi.fn();
    const result = await runGVisorSandboxExec({
      request: { id: "r1", command: "pnpm test" },
      config,
      exec,
      probeRunsc: async () => false,
      now,
    });
    expect(result.status).toBe("blocked");
    expect(result.observed).toBe(false);
    expect(result.reason).toContain("runsc");
    expect(exec).not.toHaveBeenCalled();
  });

  it("runs docker with --runtime=runsc when runsc is available", async () => {
    const exec = vi.fn(async (): Promise<LocalExecOutcome> => ({ exitCode: 0, stdout: "ok", stderr: "", timedOut: false }));
    const result = await runGVisorSandboxExec({
      request: { id: "r2", command: "pnpm test" },
      config,
      exec,
      probeRunsc: async () => true,
      now,
    });
    expect(result.status).toBe("completed");
    expect(result.observed).toBe(true);
    expect(exec).toHaveBeenCalledWith("docker", expect.arrayContaining(["--runtime=runsc"]));
  });
});
