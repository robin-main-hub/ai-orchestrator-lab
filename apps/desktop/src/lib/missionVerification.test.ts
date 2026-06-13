import { describe, expect, it } from "vitest";
import type { SandboxExecRequest, SandboxExecResult } from "@ai-orchestrator/protocol";
import type { SandboxRunner } from "./sandboxRunner";
import { runMissionVerificationPlan } from "./missionVerification";

function request(id: string, command: string): SandboxExecRequest {
  return {
    id,
    missionId: "mission_v",
    workerId: "worker_verifier",
    command,
    mode: "verify",
    createdAt: "2026-06-13T00:00:00.000Z",
  };
}

function runnerReturning(results: Record<string, Partial<SandboxExecResult>>): SandboxRunner {
  return {
    kind: "legacy_tmux",
    preflight: async () => ({ allowed: true, requiresApproval: false, reason: "test" }),
    exec: async (req) => ({
      requestId: req.id,
      status: "completed",
      observed: true,
      observedAt: "2026-06-13T00:00:01.000Z",
      ...results[req.id],
    }),
    capture: async () => ({ workerId: "w", outputPreview: "", observedAt: "" }),
  };
}

const now = () => "2026-06-13T00:00:02.000Z";

describe("runMissionVerificationPlan", () => {
  it("observed passed report when every check has exit code 0", async () => {
    const runner = runnerReturning({ c1: { exitCode: 0 }, c2: { exitCode: 0 } });
    const { report } = await runMissionVerificationPlan({
      requests: [request("c1", "pnpm typecheck"), request("c2", "pnpm test")],
      runner,
      missionId: "mission_v",
      verifierAgentId: "agent_verifier",
      now,
    });
    expect(report.observed).toBe(true);
    expect(report.status).toBe("passed");
    expect(report.checks.map((check) => check.status)).toEqual(["passed", "passed"]);
  });

  it("a nonzero exit code makes the report failed (still observed)", async () => {
    const runner = runnerReturning({ c1: { exitCode: 0 }, c2: { exitCode: 1 } });
    const { report } = await runMissionVerificationPlan({
      requests: [request("c1", "pnpm typecheck"), request("c2", "pnpm test")],
      runner,
      missionId: "mission_v",
      verifierAgentId: "agent_verifier",
      now,
    });
    expect(report.observed).toBe(true);
    expect(report.status).toBe("failed");
  });

  it("legacy tmux dispatch without exit codes is honest: warning checks, observed=false, pending", async () => {
    const runner = runnerReturning({ c1: {} }); // exitCode 없음 — tmux 디스패치만 성공
    const { report } = await runMissionVerificationPlan({
      requests: [request("c1", "pnpm test")],
      runner,
      missionId: "mission_v",
      verifierAgentId: "agent_verifier",
      now,
    });
    expect(report.observed).toBe(false);
    expect(report.status).toBe("pending");
    expect(report.checks[0]!.status).toBe("warning");
    expect(report.checks[0]!.summary).toContain("종료코드 미관측");
  });

  it("a preflight-blocked command yields skipped check and a blocked report", async () => {
    const runner = runnerReturning({
      c1: { status: "blocked", observed: false, reason: "not in the safe-command allowlist" },
    });
    const { report } = await runMissionVerificationPlan({
      requests: [request("c1", "rm -rf /")],
      runner,
      missionId: "mission_v",
      verifierAgentId: "agent_verifier",
      now,
    });
    expect(report.status).toBe("blocked");
    expect(report.checks[0]!.status).toBe("skipped");
    expect(report.observed).toBe(false);
  });

  it("truncates long commands in the stored check preview", async () => {
    const long = `echo ${"x".repeat(400)}`;
    const runner = runnerReturning({ c1: { exitCode: 0 } });
    const { report } = await runMissionVerificationPlan({
      requests: [request("c1", long)],
      runner,
      missionId: "mission_v",
      verifierAgentId: "agent_verifier",
      now,
    });
    expect(report.checks[0]!.command.length).toBeLessThanOrEqual(200);
  });
});
