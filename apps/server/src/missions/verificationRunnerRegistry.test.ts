import { describe, expect, it, vi } from "vitest";
import type { LocalExecOutcome } from "./localSandboxRunner";
import { runRegistryMissionVerification, selectVerificationRunner } from "./verificationRunnerRegistry";

const now = () => "2026-06-13T00:00:00.000Z";
const BASE = {
  commands: ["pnpm typecheck"],
  missionId: "m1",
  verifierAgentId: "agent_verifier",
  verifierCapabilityMode: "sandbox_verify",
  probeRunsc: async () => true,
  worktreePath: "/repo",
  timeoutMs: 60_000,
  now,
};

function exec(outcome: Partial<LocalExecOutcome>): (cmd: string, args: string[]) => Promise<LocalExecOutcome> {
  return vi.fn(async () => ({ exitCode: 0, stdout: "", stderr: "", timedOut: false, ...outcome }));
}
const throwingExec = vi.fn(async () => {
  throw new Error("docker: command not found");
});

describe("selectVerificationRunner", () => {
  const allowed = ["node:20-slim"];
  it("defaults to local (no behavior change for existing deployments)", () => {
    expect(selectVerificationRunner({ requested: undefined, dockerEnabled: false, gvisorEnabled: false, allowedImages: [] })).toEqual({ kind: "local" });
    expect(selectVerificationRunner({ requested: "local", dockerEnabled: false, gvisorEnabled: false, allowedImages: [] })).toEqual({ kind: "local" });
  });

  it("blocks docker/gvisor when disabled, imageless, or image not allowlisted — never silently local", () => {
    expect(selectVerificationRunner({ requested: "docker", dockerEnabled: false, gvisorEnabled: false, image: "node:20-slim", allowedImages: allowed }).kind).toBe("blocked");
    expect(selectVerificationRunner({ requested: "docker", dockerEnabled: true, gvisorEnabled: false, allowedImages: allowed }).kind).toBe("blocked");
    expect(selectVerificationRunner({ requested: "docker", dockerEnabled: true, gvisorEnabled: false, image: "evil:latest", allowedImages: allowed }).kind).toBe("blocked");
    expect(selectVerificationRunner({ requested: "gvisor", dockerEnabled: false, gvisorEnabled: false, image: "node:20-slim", allowedImages: allowed }).kind).toBe("blocked");
  });

  it("selects docker/gvisor when enabled with an allowlisted image", () => {
    expect(selectVerificationRunner({ requested: "docker", dockerEnabled: true, gvisorEnabled: false, image: "node:20-slim", allowedImages: allowed })).toEqual({ kind: "docker", image: "node:20-slim" });
    expect(selectVerificationRunner({ requested: "gvisor", dockerEnabled: false, gvisorEnabled: true, image: "node:20-slim", allowedImages: allowed })).toEqual({ kind: "gvisor", image: "node:20-slim" });
  });

  it("blocks an unknown runner name", () => {
    expect(selectVerificationRunner({ requested: "firecracker", dockerEnabled: true, gvisorEnabled: true, image: "x", allowedImages: ["x"] }).kind).toBe("blocked");
  });
});

describe("runRegistryMissionVerification", () => {
  it("local: observed report from real exit codes", async () => {
    const report = await runRegistryMissionVerification({ ...BASE, selection: { kind: "local" }, localExec: exec({ exitCode: 0 }), dockerExec: throwingExec });
    expect(report.observed).toBe(true);
    expect(report.status).toBe("passed");
  });

  it("capability mismatch: blocked WITHOUT running anything (companion cannot verify)", async () => {
    const localExec = exec({ exitCode: 0 });
    const report = await runRegistryMissionVerification({ ...BASE, verifierCapabilityMode: "no_direct_mutation", selection: { kind: "local" }, localExec, dockerExec: throwingExec });
    expect(report.status).toBe("blocked");
    expect(report.observed).toBe(false);
    expect(localExec).not.toHaveBeenCalled();
  });

  it("blocked selection: honest unobserved report (no fake observed)", async () => {
    const report = await runRegistryMissionVerification({ ...BASE, selection: { kind: "blocked", reason: "docker disabled" }, localExec: exec({ exitCode: 0 }), dockerExec: throwingExec });
    expect(report.status).toBe("blocked");
    expect(report.observed).toBe(false);
    expect(report.checks[0]!.summary).toContain("docker disabled");
  });

  it("docker: builds an observed report via the docker runner", async () => {
    const calls: string[] = [];
    const dockerExec = vi.fn(async (cmd: string) => {
      calls.push(cmd);
      return { exitCode: 0, stdout: "ok", stderr: "", timedOut: false };
    });
    const report = await runRegistryMissionVerification({ ...BASE, selection: { kind: "docker", image: "node:20-slim" }, localExec: throwingExec, dockerExec });
    expect(report.observed).toBe(true);
    expect(report.status).toBe("passed");
    expect(dockerExec).toHaveBeenCalledTimes(1);
    expect(calls[0]).toBe("docker"); // host docker, not local fallback
  });

  it("docker missing: failed + NOT observed, never silently local", async () => {
    const localExec = exec({ exitCode: 0 });
    const report = await runRegistryMissionVerification({ ...BASE, selection: { kind: "docker", image: "node:20-slim" }, localExec, dockerExec: throwingExec });
    expect(report.status).toBe("failed");
    expect(report.observed).toBe(false);
    expect(localExec).not.toHaveBeenCalled(); // no secret local fallback
  });

  it("gvisor without runsc: blocked, not faked as observed", async () => {
    const report = await runRegistryMissionVerification({ ...BASE, selection: { kind: "gvisor", image: "node:20-slim" }, probeRunsc: async () => false, localExec: throwingExec, dockerExec: exec({ exitCode: 0 }) });
    expect(report.observed).toBe(false);
    expect(report.checks[0]!.status).toBe("skipped");
  });
});
