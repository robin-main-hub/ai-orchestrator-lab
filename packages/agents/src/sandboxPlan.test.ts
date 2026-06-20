import { describe, expect, it } from "vitest";
import { sandboxExecRequestSchema, type CodingPacket, type MissionCapabilityMode } from "@ai-orchestrator/protocol";
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

// sandboxRunModeForCapability is the capability→runner authority bridge, and
// createSandboxPlanFromCodingPacket turns a packet into the requests a runner
// will execute — so both are security-relevant. The existing tests enumerate the
// NAMED capability cases but not the `default` (unknown capability) fallback, and
// exercise one mixed packet but not: an empty/all-blank plan (→ no requests), the
// id-index invariant (a blank line between two commands must NOT leave a gap in
// the request ids — the index is the *filtered* position, not the source line),
// padded-but-nonblank command trimming, and omitted cwd/timeout (→ undefined yet
// still schema-valid). Pin these, self-consistent (derived from the packet).
describe("sandboxPlan — deny-by-default capability + plan-shaping edges", () => {
  it("an UNKNOWN capability mode falls back to read_only (never an executing mode)", () => {
    // deny-by-default: anything not explicitly executing must be read-only
    expect(sandboxRunModeForCapability("totally_unknown" as MissionCapabilityMode)).toBe("read_only");
  });

  it("an empty or all-blank verification plan yields zero exec requests", () => {
    const empty = createSandboxPlanFromCodingPacket({
      packet: { ...packet, verificationPlan: [] },
      missionId: "m",
      workerId: "w",
      now: "2026-06-13T00:00:00.000Z",
    });
    expect(empty).toEqual([]);
    const allBlank = createSandboxPlanFromCodingPacket({
      packet: { ...packet, verificationPlan: ["", "   ", "\t"] },
      missionId: "m",
      workerId: "w",
      now: "2026-06-13T00:00:00.000Z",
    });
    expect(allBlank).toEqual([]);
  });

  it("request ids use the FILTERED position — a dropped blank line does not leave an id gap", () => {
    // source plan: ["pnpm typecheck", "  "(blank), "pnpm test"] → the 2nd kept command is _2, NOT _3
    const plan = createSandboxPlanFromCodingPacket({
      packet,
      missionId: "mission_1",
      workerId: "worker_verifier",
      now: "2026-06-13T00:00:00.000Z",
    });
    expect(plan.map((r) => r.id)).toEqual([
      "sandbox_exec_mission_1_worker_verifier_1",
      "sandbox_exec_mission_1_worker_verifier_2", // not _3 despite the blank being the 2nd source line
    ]);
  });

  it("trims padded-but-nonblank commands and leaves cwd/timeout undefined when omitted (still schema-valid)", () => {
    const plan = createSandboxPlanFromCodingPacket({
      packet: { ...packet, verificationPlan: ["   pnpm lint   "] },
      missionId: "m",
      workerId: "w",
      now: "2026-06-13T00:00:00.000Z",
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]!.command).toBe("pnpm lint"); // trimmed
    expect(plan[0]!.cwd).toBeUndefined();
    expect(plan[0]!.timeoutMs).toBeUndefined();
    expect(sandboxExecRequestSchema.safeParse(plan[0]).success).toBe(true);
  });
});
