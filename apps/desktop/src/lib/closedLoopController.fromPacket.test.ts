import { describe, expect, it } from "vitest";
import type { CodingPacket } from "@ai-orchestrator/protocol";
import {
  createInitialLoopState,
  createLoopStateFromPacket,
  currentCommand,
  type LoopState,
} from "./closedLoopController";

// Characterization tests (no behavior change) for the two previously-unasserted
// exports of closedLoopController.ts: createLoopStateFromPacket and
// currentCommand. The existing closedLoopController.test.ts drives
// createInitialLoopState, reduceClosedLoop, and runClosedLoop but never these two.
//
// - createLoopStateFromPacket is the CodingPacket entry point into the loop. Its
//   load-bearing contract is that it seeds the loop from ONLY packet.verificationPlan
//   (every other packet field is irrelevant to the loop) and otherwise delegates
//   verbatim to createInitialLoopState — so the blank-step filter and the
//   empty-plan -> "completed" rule it inherits must hold, and the maxNoProgress
//   option must pass through.
// - currentCommand is what the async driver dispatches each iteration: the
//   verification step at state.stepIndex, or undefined once stepIndex runs past
//   the plan (the signal the loop is out of steps).

function packet(overrides: Partial<CodingPacket> = {}): CodingPacket {
  return {
    goal: "g",
    context: [],
    decisions: [],
    rejectedOptions: [],
    constraints: [],
    filesToInspect: [],
    implementationPlan: [],
    verificationPlan: [],
    reviewerNotes: [],
    ...overrides,
  };
}

describe("createLoopStateFromPacket", () => {
  it("seeds the loop from packet.verificationPlan, ignoring every other packet field", () => {
    const plan = ["pnpm test", "pnpm build"];
    const fromPacket = createLoopStateFromPacket(
      packet({
        verificationPlan: plan,
        // junk in unrelated fields must not change the seeded state
        goal: "irrelevant",
        implementationPlan: ["do a thing"],
        constraints: ["no network"],
      }),
    );
    // delegates verbatim to createInitialLoopState(verificationPlan)
    expect(fromPacket).toEqual(createInitialLoopState(plan));
    expect(fromPacket.status).toBe("running");
    expect(fromPacket.stepIndex).toBe(0);
    expect(fromPacket.verificationPlan).toEqual(plan);
  });

  it("inherits the blank-step filter and the empty-plan -> completed rule", () => {
    const filtered = createLoopStateFromPacket(packet({ verificationPlan: ["  ", "real step", "\t"] }));
    expect(filtered.verificationPlan).toEqual(["real step"]);
    expect(filtered.status).toBe("running");

    // a plan that is empty (or all-blank) leaves nothing to verify -> completed
    expect(createLoopStateFromPacket(packet({ verificationPlan: [] })).status).toBe("completed");
    expect(createLoopStateFromPacket(packet({ verificationPlan: ["   ", ""] })).status).toBe("completed");
  });

  it("passes the maxNoProgress option through (default 3)", () => {
    expect(createLoopStateFromPacket(packet({ verificationPlan: ["s"] })).maxNoProgress).toBe(3);
    expect(createLoopStateFromPacket(packet({ verificationPlan: ["s"] }), { maxNoProgress: 7 }).maxNoProgress).toBe(7);
  });
});

describe("currentCommand", () => {
  const state = (verificationPlan: string[], stepIndex: number): LoopState => ({
    verificationPlan,
    stepIndex,
    verificationPassed: 0,
    consecutiveNoProgress: 0,
    status: "running",
    maxNoProgress: 3,
  });

  it("returns the verification step at the current stepIndex", () => {
    const s = state(["a", "b", "c"], 1);
    expect(currentCommand(s)).toBe("b");
    expect(currentCommand(state(["a", "b", "c"], 0))).toBe("a");
  });

  it("returns undefined once stepIndex runs past the plan (out of steps)", () => {
    expect(currentCommand(state(["a", "b"], 2))).toBeUndefined();
    expect(currentCommand(state([], 0))).toBeUndefined();
  });
});
