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

describe("runClosedLoop cancellation", () => {
  function countingEffects(
    captures: string[],
    onCapture?: (call: number) => void,
  ): {
    effects: ClosedLoopEffects;
    counts: { dispatch: number; capture: number };
    dispatched: string[];
    escalations: string[];
  } {
    const counts = { dispatch: 0, capture: 0 };
    const dispatched: string[] = [];
    const escalations: string[] = [];
    const effects: ClosedLoopEffects = {
      dispatch: (command) => {
        counts.dispatch += 1;
        dispatched.push(command);
      },
      capture: () => {
        counts.capture += 1;
        onCapture?.(counts.capture);
        return captures[Math.min(counts.capture - 1, captures.length - 1)] ?? "";
      },
      escalate: (reason) => {
        escalations.push(reason);
      },
    };
    return { effects, counts, dispatched, escalations };
  }

  it("returns cancelled without dispatching or capturing when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { effects, counts } = countingEffects(["All tests passed"]);
    const state = createInitialLoopState(["run tests"]);

    const final = await runClosedLoop({ state, effects, signal: controller.signal });

    expect(final.status).toBe("cancelled");
    expect(counts.dispatch).toBe(0);
    expect(counts.capture).toBe(0);
  });

  it("resolves cancelled mid-run and stops dispatching after the abort", async () => {
    const controller = new AbortController();
    // Progressing captures keep the loop iterating (await_capture). The 2nd
    // capture flips the signal, so the loop must stop right after it — before
    // the no-progress escalation, which needs a 4th capture at the default
    // threshold (proving the abort, not the fakes, ended the run).
    const { effects, counts, dispatched, escalations } = countingEffects(
      ["still working...", "still working...", "still working...", "still working..."],
      (call) => {
        if (call === 2) controller.abort();
      },
    );
    const state = createInitialLoopState(["run tests"]);

    const final = await runClosedLoop({ state, effects, signal: controller.signal });

    expect(final.status).toBe("cancelled");
    expect(counts.capture).toBe(2); // stopped right after the aborting capture
    expect(counts.dispatch).toBe(1); // only the kickoff dispatch; none after abort
    expect(dispatched).toEqual(["run tests"]);
    expect(escalations).toEqual([]);
  });

  it("without a signal the same fakes still escalate at the iteration cap (regression)", async () => {
    const { effects, counts, escalations } = countingEffects([
      "still working...",
      "still working...",
      "still working...",
    ]);
    const state = createInitialLoopState(["run tests"]);

    const final = await runClosedLoop({ state, effects, maxIterations: 3 });

    expect(final.status).toBe("awaiting_human");
    expect(counts.capture).toBe(3);
    expect(escalations.some((reason) => reason.includes("cap"))).toBe(true);
  });
});
