import { describe, expect, it } from "vitest";
import {
  createInitialLoopState,
  reduceClosedLoop,
  runClosedLoop,
  type ClosedLoopEffects,
} from "./closedLoopController";

describe("createInitialLoopState", () => {
  it("starts running with a non-empty plan and drops blank steps", () => {
    const state = createInitialLoopState(["run tests", "  ", "lint"]);
    expect(state.status).toBe("running");
    expect(state.verificationPlan).toEqual(["run tests", "lint"]);
    expect(state.stepIndex).toBe(0);
  });

  it("is already complete when there is nothing to verify", () => {
    expect(createInitialLoopState([]).status).toBe("completed");
    expect(createInitialLoopState(["   "]).status).toBe("completed");
  });
});

describe("reduceClosedLoop", () => {
  it("advances to the next step when the current one completes", () => {
    const state = createInitialLoopState(["step A", "step B"]);
    const result = reduceClosedLoop(state, "All tests passed");
    expect(result.decision.action).toBe("dispatch_next");
    expect(result.state.stepIndex).toBe(1);
    expect(result.state.verificationPassed).toBe(1);
    expect(result.nextCommand).toBe("step B");
  });

  it("completes when the final step passes", () => {
    const state = { ...createInitialLoopState(["only step"]), stepIndex: 0, verificationPassed: 0 };
    const result = reduceClosedLoop(state, "12 passed, 0 failed");
    expect(result.decision.action).toBe("complete");
    expect(result.state.status).toBe("completed");
    expect(result.state.verificationPassed).toBe(1);
  });

  it("fails fast on a worker failure", () => {
    const state = createInitialLoopState(["step A"]);
    const result = reduceClosedLoop(state, "Traceback (most recent call last):");
    expect(result.state.status).toBe("failed");
  });

  it("re-issues the current step when the worker goes idle awaiting input", () => {
    const state = createInitialLoopState(["step A", "step B"]);
    const result = reduceClosedLoop(state, "please provide the branch name");
    expect(result.decision.action).toBe("dispatch_next");
    expect(result.state.stepIndex).toBe(0);
    expect(result.nextCommand).toBe("step A");
  });

  it("counts no-progress captures and escalates once stuck", () => {
    let state = createInitialLoopState(["step A"], { maxNoProgress: 2 });
    state = reduceClosedLoop(state, "still working...").state;
    expect(state.consecutiveNoProgress).toBe(1);
    const stuck = reduceClosedLoop(state, "still working...");
    expect(stuck.state.consecutiveNoProgress).toBe(2);
    const escalated = reduceClosedLoop(stuck.state, "still working...");
    expect(escalated.decision.action).toBe("escalate_approval");
    expect(escalated.state.status).toBe("awaiting_human");
  });
});

describe("runClosedLoop", () => {
  function recordingEffects(captures: string[]): {
    effects: ClosedLoopEffects;
    dispatched: string[];
    escalations: string[];
  } {
    const dispatched: string[] = [];
    const escalations: string[] = [];
    let captureIndex = 0;
    const effects: ClosedLoopEffects = {
      dispatch: (command) => {
        dispatched.push(command);
      },
      capture: () => captures[Math.min(captureIndex++, captures.length - 1)] ?? "",
      escalate: (reason) => {
        escalations.push(reason);
      },
    };
    return { effects, dispatched, escalations };
  }

  it("drives every verification step to completion (happy path)", async () => {
    const state = createInitialLoopState(["run unit tests", "run lint"]);
    const { effects, dispatched, escalations } = recordingEffects([
      "All tests passed", // step A done -> dispatch step B
      "lint clean, all passed", // step B done -> complete
    ]);
    const final = await runClosedLoop({ state, effects });
    expect(final.status).toBe("completed");
    expect(dispatched).toEqual(["run unit tests", "run lint"]);
    expect(escalations).toEqual([]);
  });

  it("halts and does not dispatch further on failure", async () => {
    const state = createInitialLoopState(["run unit tests", "run lint"]);
    const { effects, dispatched } = recordingEffects(["2 tests failed"]);
    const final = await runClosedLoop({ state, effects });
    expect(final.status).toBe("failed");
    expect(dispatched).toEqual(["run unit tests"]); // never reached step B
  });

  it("escalates to a human when the worker needs approval", async () => {
    const state = createInitialLoopState(["edit src/index.ts"]);
    const { effects, escalations } = recordingEffects(["Allow Claude to edit the file? (y/n)"]);
    const final = await runClosedLoop({ state, effects });
    expect(final.status).toBe("awaiting_human");
    expect(escalations).toHaveLength(1);
  });

  it("escalates instead of spinning when iterations are capped", async () => {
    const state = createInitialLoopState(["long task"]);
    const { effects, escalations } = recordingEffects(["still working..."]);
    const final = await runClosedLoop({ state, effects, maxIterations: 3 });
    expect(final.status).toBe("awaiting_human");
    expect(escalations.some((reason) => reason.includes("cap"))).toBe(true);
  });

  it("returns immediately when there is nothing to verify", async () => {
    const state = createInitialLoopState([]);
    const { effects, dispatched } = recordingEffects([]);
    const final = await runClosedLoop({ state, effects });
    expect(final.status).toBe("completed");
    expect(dispatched).toEqual([]);
  });
});
