import { describe, expect, it } from "vitest";
import { sandboxExecRequestSchema, type CodingPacket } from "@ai-orchestrator/protocol";
import { createSandboxPlanFromCodingPacket, sandboxRunModeForCapability } from "./sandboxPlan";

describe("sandboxRunModeForCapability", () => {
  it("maps executing capabilities to their run mode and non-executing ones to read_only", () => {
    expect(sandboxRunModeForCapability("sandbox_build")).toBe("build");
    expect(sandboxRunModeForCapability("sandbox_verify")).toBe("verify");
    expect(sandboxRunModeForCapability("merge_recommend")).toBe("merge_recommend");
    expect(sandboxRunModeForCapability("plan_only")).toBe("read_only");
    expect(sandboxRunModeForCapability("research")).toBe("read_only");
    expect(sandboxRunModeForCapability("memory_curate")).toBe("read_only");
    expect(sandboxRunModeForCapability("conversation_only")).toBe("read_only");
  });
});

const packet: CodingPacket = {
  goal: "g",
  context: [],
  decisions: [],
  rejectedOptions: [],
  constraints: [],
  filesToInspect: [],
  implementationPlan: [],
  verificationPlan: ["pnpm typecheck", "  ", "pnpm test"],
  reviewerNotes: [],
};

describe("createSandboxPlanFromCodingPacket", () => {
  it("turns each non-blank verification step into a schema-valid exec request", () => {
    const plan = createSandboxPlanFromCodingPacket({
      packet,
      missionId: "mission_1",
      workerId: "worker_verifier",
      now: "2026-06-13T00:00:00.000Z",
    });

    expect(plan).toHaveLength(2); // blank line dropped
    expect(plan.map((r) => r.command)).toEqual(["pnpm typecheck", "pnpm test"]);
    expect(plan[0]!.id).toBe("sandbox_exec_mission_1_worker_verifier_1");
    expect(plan[0]!.mode).toBe("verify"); // default
    for (const request of plan) {
      expect(sandboxExecRequestSchema.safeParse(request).success).toBe(true);
    }
  });

  it("honors an explicit run mode and cwd/timeout", () => {
    const plan = createSandboxPlanFromCodingPacket({
      packet,
      missionId: "m",
      workerId: "w",
      mode: "build",
      cwd: "/repo/.worktrees/m",
      timeoutMs: 30_000,
      now: "2026-06-13T00:00:00.000Z",
    });
    expect(plan[0]!.mode).toBe("build");
    expect(plan[0]!.cwd).toBe("/repo/.worktrees/m");
    expect(plan[0]!.timeoutMs).toBe(30_000);
  });
});
