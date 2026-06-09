import { describe, expect, it } from "vitest";
import { evaluateExecutionHandoffGate } from "./executionHandoffGate";

describe("evaluateExecutionHandoffGate", () => {
  it("blocks handoff when the debate decision is blocked", () => {
    const gate = evaluateExecutionHandoffGate({ readiness: "blocked", requestedMode: "human" });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("막혀");
  });

  it("allows a ready debate with the requested mode", () => {
    const gate = evaluateExecutionHandoffGate({ readiness: "ready", requestedMode: "auto_safe" });
    expect(gate).toMatchObject({ allowed: true, effectiveMode: "auto_safe", modeDowngraded: false });
  });

  it("downgrades auto_safe to human when the debate needs review", () => {
    const gate = evaluateExecutionHandoffGate({ readiness: "needs_review", requestedMode: "auto_safe" });
    expect(gate.allowed).toBe(true);
    expect(gate.effectiveMode).toBe("human");
    expect(gate.modeDowngraded).toBe(true);
  });

  it("keeps human mode without flagging a downgrade when already human", () => {
    const gate = evaluateExecutionHandoffGate({ readiness: "needs_review", requestedMode: "human" });
    expect(gate.effectiveMode).toBe("human");
    expect(gate.modeDowngraded).toBe(false);
  });
});
