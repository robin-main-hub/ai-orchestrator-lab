import { describe, expect, it, vi } from "vitest";
import type { LocalExecOutcome } from "./localSandboxRunner.js";
import { buildDockerRunArgs, runDockerSandboxExec, type DockerSandboxRunnerConfig } from "./dockerSandboxRunner.js";

const config: DockerSandboxRunnerConfig = {
  image: "node:20-slim",
  worktreePath: "/repo/.worktrees/m1",
  repoMountMode: "rw_worktree",
  network: "none",
  memoryMb: 512,
  timeoutMs: 60_000,
};
const now = () => "2026-06-13T00:00:00.000Z";

describe("buildDockerRunArgs", () => {
  it("always applies the security defaults", () => {
    const args = buildDockerRunArgs(config, ["pnpm", "test"]);
    const joined = args.join(" ");
    expect(joined).toContain("--rm");
    expect(joined).toContain("--read-only");
    expect(joined).toContain("--cap-drop=ALL");
    expect(joined).toContain("--security-opt=no-new-privileges");
    expect(joined).toContain("--network=none");
    expect(joined).toContain("--memory=512m");
    expect(joined).toContain("--pids-limit=256");
  });

  it("mounts only the worktree and appends the command argv", () => {
    const args = buildDockerRunArgs(config, ["pnpm", "test"]);
    expect(args).toContain("-v");
    expect(args).toContain("/repo/.worktrees/m1:/work");
    // image then command argv last
    expect(args.slice(-3)).toEqual(["node:20-slim", "pnpm", "test"]);
  });

  it("mounts read-only with :ro when repoMountMode is readonly", () => {
    const ro = buildDockerRunArgs({ ...config, repoMountMode: "readonly" }, ["ls"]);
    expect(ro).toContain("/repo/.worktrees/m1:/work:ro");
  });

  it("adds --runtime=runsc only when the gVisor runtime is requested", () => {
    expect(buildDockerRunArgs(config, ["ls"]).join(" ")).not.toContain("runsc");
    expect(buildDockerRunArgs({ ...config, runtime: "runsc" }, ["ls"]).join(" ")).toContain("--runtime=runsc");
  });
});

describe("runDockerSandboxExec", () => {
  it("blocks a dangerous command without invoking docker (observed=false)", async () => {
    const exec = vi.fn();
    const result = await runDockerSandboxExec({
      request: { id: "r1", command: "rm -rf /" },
      config,
      exec,
      now,
    });
    expect(result.status).toBe("blocked");
    expect(result.observed).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it("maps a clean exit 0 to completed (observed)", async () => {
    const exec = vi.fn(async (): Promise<LocalExecOutcome> => ({ exitCode: 0, stdout: "ok", stderr: "", timedOut: false }));
    const result = await runDockerSandboxExec({ request: { id: "r2", command: "pnpm test" }, config, exec, now });
    expect(exec).toHaveBeenCalledWith("docker", expect.arrayContaining(["run", "--network=none"]));
    expect(result.status).toBe("completed");
    expect(result.observed).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("maps a nonzero exit to failed and a timeout to timeout", async () => {
    const fail = await runDockerSandboxExec({
      request: { id: "r3", command: "pnpm test" },
      config,
      exec: async () => ({ exitCode: 1, stdout: "", stderr: "boom", timedOut: false }),
      now,
    });
    expect(fail.status).toBe("failed");
    const timeout = await runDockerSandboxExec({
      request: { id: "r4", command: "pnpm test" },
      config,
      exec: async () => ({ exitCode: null, stdout: "", stderr: "", timedOut: true }),
      now,
    });
    expect(timeout.status).toBe("timeout");
  });
});
