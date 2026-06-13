import type { AgentProfile, AgentRole } from "@ai-orchestrator/protocol";
import { describe, expect, it, vi } from "vitest";
import { createAgentMissionCapability } from "@ai-orchestrator/agents";
import { createLegacyTmuxRunner, createSandboxGatedEffects } from "./legacyTmuxRunner";

function capabilityFor(role: AgentRole, overrides: Partial<AgentProfile> = {}) {
  const profile: AgentProfile = {
    id: `agent_${role}`,
    name: role,
    kind: "virtual",
    role,
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
    permissionLevel: "read_only",
    ...overrides,
  };
  return createAgentMissionCapability(profile);
}

function request(overrides: Partial<Parameters<ReturnType<typeof createLegacyTmuxRunner>["exec"]>[0]> = {}) {
  return {
    id: "sandbox_exec_1",
    missionId: "mission_1",
    workerId: "worker_1",
    command: "pnpm test",
    mode: "verify" as const,
    createdAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

const now = () => "2026-06-13T00:00:00.000Z";

describe("LegacyTmuxRunner preflight", () => {
  it("lets a verifier run an allowlisted safe command without approval", async () => {
    const runner = createLegacyTmuxRunner({ capability: capabilityFor("verifier"), effects: { dispatch: vi.fn(), capture: vi.fn() }, now });
    const gate = await runner.preflight(request({ command: "pnpm typecheck", mode: "verify" }));
    expect(gate).toEqual({ allowed: true, requiresApproval: false, reason: expect.stringContaining("safe prefix") });
  });

  it("blocks a verifier from an off-allowlist command", async () => {
    const runner = createLegacyTmuxRunner({ capability: capabilityFor("verifier"), effects: { dispatch: vi.fn(), capture: vi.fn() }, now });
    const gate = await runner.preflight(request({ command: "rm -rf dist", mode: "verify" }));
    expect(gate.allowed).toBe(false);
  });

  it("lets a builder run a build, but always behind approval", async () => {
    const runner = createLegacyTmuxRunner({ capability: capabilityFor("builder"), effects: { dispatch: vi.fn(), capture: vi.fn() }, now });
    const gate = await runner.preflight(request({ command: "apply patch", mode: "build" }));
    expect(gate).toEqual({ allowed: true, requiresApproval: true, reason: expect.any(String) });
  });

  it("blocks a companion (write_files permission) from a build run — request-right is not execute-right", async () => {
    const companion = capabilityFor("companion", { permissionLevel: "write_files", personaName: "kurumi", soulMode: "full", configSource: "markdown" });
    const runner = createLegacyTmuxRunner({ capability: companion, effects: { dispatch: vi.fn(), capture: vi.fn() }, now });
    const gate = await runner.preflight(request({ command: "apply patch", mode: "build" }));
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("request-only");
  });

  it("blocks merge_recommend mode from executing at all", async () => {
    const runner = createLegacyTmuxRunner({ capability: capabilityFor("companion"), effects: { dispatch: vi.fn(), capture: vi.fn() }, now });
    const gate = await runner.preflight(request({ mode: "merge_recommend" }));
    expect(gate.allowed).toBe(false);
  });
});

describe("LegacyTmuxRunner exec/capture delegate to existing effects", () => {
  it("dispatches through the injected effects on a passing preflight and reports observed completed", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const runner = createLegacyTmuxRunner({ capability: capabilityFor("verifier"), effects: { dispatch, capture: vi.fn() }, now });
    const result = await runner.exec(request({ command: "pnpm test", mode: "verify" }));
    expect(dispatch).toHaveBeenCalledWith("pnpm test", { stepIndex: 0 });
    expect(result).toMatchObject({ requestId: "sandbox_exec_1", status: "completed", observed: true });
  });

  it("does not dispatch when preflight blocks, and reports blocked/unobserved", async () => {
    const dispatch = vi.fn();
    const runner = createLegacyTmuxRunner({ capability: capabilityFor("verifier"), effects: { dispatch, capture: vi.fn() }, now });
    const result = await runner.exec(request({ command: "rm -rf /", mode: "verify" }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(result.status).toBe("blocked");
    expect(result.observed).toBe(false);
  });

  it("maps a dispatch error to failed, and a timeout message to timeout", async () => {
    const failing = createLegacyTmuxRunner({
      capability: capabilityFor("verifier"),
      effects: { dispatch: vi.fn().mockRejectedValue(new Error("dispatch blocked: gate closed")), capture: vi.fn() },
      now,
    });
    expect((await failing.exec(request())).status).toBe("failed");

    const timing = createLegacyTmuxRunner({
      capability: capabilityFor("verifier"),
      effects: { dispatch: vi.fn().mockRejectedValue(new Error("approval timeout for step 0")), capture: vi.fn() },
      now,
    });
    expect((await timing.exec(request())).status).toBe("timeout");
  });

  it("capture delegates to the existing effects.capture", async () => {
    const capture = vi.fn().mockResolvedValue("pane output here");
    const runner = createLegacyTmuxRunner({ capability: capabilityFor("verifier"), effects: { dispatch: vi.fn(), capture }, now });
    const result = await runner.capture("worker_1");
    expect(capture).toHaveBeenCalledOnce();
    expect(result).toEqual({ workerId: "worker_1", outputPreview: "pane output here", observedAt: now() });
  });

  it("exposes its kind as legacy_tmux", () => {
    const runner = createLegacyTmuxRunner({ capability: capabilityFor("verifier"), effects: { dispatch: vi.fn(), capture: vi.fn() }, now });
    expect(runner.kind).toBe("legacy_tmux");
  });
});

describe("createSandboxGatedEffects (live closed-loop wiring)", () => {
  function baseEffects() {
    return {
      dispatch: vi.fn().mockResolvedValue(undefined),
      capture: vi.fn().mockResolvedValue("output"),
      escalate: vi.fn().mockResolvedValue(undefined),
      onStep: vi.fn(),
    };
  }

  it("routes a safe verify dispatch through preflight to the underlying dispatch", async () => {
    const effects = baseEffects();
    const gated = createSandboxGatedEffects({
      effects,
      capability: capabilityFor("verifier"),
      runMode: "verify",
      now,
    });
    await gated.dispatch("pnpm test", { stepIndex: 0 });
    expect(effects.dispatch).toHaveBeenCalledWith("pnpm test", { stepIndex: 0 });
  });

  it("throws (so the loop escalates) when preflight blocks, without dispatching", async () => {
    const effects = baseEffects();
    const gated = createSandboxGatedEffects({
      effects,
      capability: capabilityFor("verifier"),
      runMode: "verify",
      now,
    });
    await expect(gated.dispatch("rm -rf /", { stepIndex: 0 })).rejects.toThrow(/sandbox blocked/);
    expect(effects.dispatch).not.toHaveBeenCalled();
  });

  it("blocks a companion build dispatch (write_files is request-right, not execute-right)", async () => {
    const effects = baseEffects();
    const companion = capabilityFor("companion", { permissionLevel: "write_files", personaName: "kurumi" });
    const gated = createSandboxGatedEffects({ effects, capability: companion, runMode: "build", now });
    await expect(gated.dispatch("apply patch", { stepIndex: 0 })).rejects.toThrow(/sandbox blocked/);
    expect(effects.dispatch).not.toHaveBeenCalled();
  });

  it("passes capture/escalate/onStep straight through to the base effects", async () => {
    const effects = baseEffects();
    const gated = createSandboxGatedEffects({ effects, capability: capabilityFor("verifier"), runMode: "verify", now });
    await gated.capture();
    await gated.escalate?.("reason", {} as never);
    expect(effects.capture).toHaveBeenCalledOnce();
    expect(effects.escalate).toHaveBeenCalledOnce();
    expect(gated.onStep).toBe(effects.onStep);
  });
});
