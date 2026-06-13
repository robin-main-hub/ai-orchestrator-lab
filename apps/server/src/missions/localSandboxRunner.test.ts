import { describe, expect, it, vi } from "vitest";
import { runLocalMissionVerification, type LocalExecOutcome } from "./localSandboxRunner";

const now = () => "2026-06-13T00:00:00.000Z";

function execReturning(byCmd: Record<string, Partial<LocalExecOutcome>>) {
  return vi.fn(async (cmd: string, args: string[]) => ({
    exitCode: 0,
    stdout: "",
    stderr: "",
    timedOut: false,
    ...byCmd[`${cmd} ${args.join(" ")}`.trim()],
  }));
}

describe("runLocalMissionVerification", () => {
  it("runs allowlisted commands and yields an observed passed report on exit 0", async () => {
    const exec = execReturning({ "pnpm typecheck": { exitCode: 0 }, "pnpm test": { exitCode: 0, stdout: "ok" } });
    const report = await runLocalMissionVerification({
      commands: ["pnpm typecheck", "pnpm test"],
      missionId: "m1",
      verifierAgentId: "agent_verifier",
      exec,
      now,
    });
    expect(report.observed).toBe(true);
    expect(report.status).toBe("passed");
    expect(report.checks.map((c) => c.status)).toEqual(["passed", "passed"]);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("a nonzero exit makes the report failed (still observed)", async () => {
    const exec = execReturning({ "pnpm test": { exitCode: 1, stderr: "1 failing" } });
    const report = await runLocalMissionVerification({
      commands: ["pnpm test"],
      missionId: "m1",
      verifierAgentId: "agent_verifier",
      exec,
      now,
    });
    expect(report.observed).toBe(true);
    expect(report.status).toBe("failed");
    expect(report.checks[0]!.summary).toContain("1 failing");
  });

  it("blocks a command outside the allowlist WITHOUT executing it (security boundary)", async () => {
    const exec = vi.fn();
    const report = await runLocalMissionVerification({
      commands: ["rm -rf /"],
      missionId: "m1",
      verifierAgentId: "agent_verifier",
      exec: exec as never,
      now,
    });
    expect(exec).not.toHaveBeenCalled();
    expect(report.status).toBe("blocked");
    expect(report.checks[0]!.status).toBe("skipped");
    expect(report.observed).toBe(false);
  });

  it("blocks shell-metacharacter smuggling even with an allowlisted prefix", async () => {
    const exec = vi.fn();
    const report = await runLocalMissionVerification({
      commands: ["pnpm test; rm -rf /"],
      missionId: "m1",
      verifierAgentId: "agent_verifier",
      exec: exec as never,
      now,
    });
    expect(exec).not.toHaveBeenCalled();
    expect(report.checks[0]!.status).toBe("skipped");
  });

  it("marks a timeout as failed", async () => {
    const exec = execReturning({ "pnpm test": { exitCode: null, timedOut: true } });
    const report = await runLocalMissionVerification({
      commands: ["pnpm test"],
      missionId: "m1",
      verifierAgentId: "agent_verifier",
      exec,
      now,
    });
    expect(report.status).toBe("failed");
    expect(report.checks[0]!.summary).toContain("시간 초과");
  });
});
