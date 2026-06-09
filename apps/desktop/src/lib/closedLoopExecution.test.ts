import { describe, expect, it } from "vitest";
import { classifyPaneOutput, decideNextStep } from "./closedLoopExecution";

describe("classifyPaneOutput", () => {
  it("treats empty or whitespace output as still progressing", () => {
    expect(classifyPaneOutput("")).toBe("progressing");
    expect(classifyPaneOutput("   \n  ")).toBe("progressing");
  });

  it("flags failures even when a success word is also present", () => {
    expect(classifyPaneOutput("done\nTraceback (most recent call last):")).toBe("failed");
    expect(classifyPaneOutput("Error: cannot find module 'x'")).toBe("failed");
    expect(classifyPaneOutput("2 tests failed")).toBe("failed");
    expect(classifyPaneOutput("process exited with exit code 1")).toBe("failed");
  });

  it("detects approval prompts before generic input prompts", () => {
    expect(classifyPaneOutput("Allow Claude to edit src/index.ts?")).toBe("needs_approval");
    expect(classifyPaneOutput("Run the command? (y/n)")).toBe("needs_approval");
    expect(classifyPaneOutput("permission required to write file")).toBe("needs_approval");
  });

  it("detects blocked workers", () => {
    expect(classifyPaneOutput("I am blocked: missing dependency foo")).toBe("blocked");
    expect(classifyPaneOutput("cannot proceed without the API spec")).toBe("blocked");
  });

  it("detects completion", () => {
    expect(classifyPaneOutput("All tests passed")).toBe("completed");
    expect(classifyPaneOutput("12 passed, 0 failed")).toBe("completed");
    expect(classifyPaneOutput("Refactor finished.")).toBe("completed");
  });

  it("detects awaiting-input when a bare shell prompt is left", () => {
    expect(classifyPaneOutput("please provide the target branch")).toBe("awaiting_input");
    expect(classifyPaneOutput("user@host:~/work$ ")).toBe("awaiting_input");
  });

  it("falls back to progressing for ordinary chatter", () => {
    expect(classifyPaneOutput("Reading files and building a plan...")).toBe("progressing");
  });
});

describe("decideNextStep", () => {
  const base = {
    slotStatus: "running" as const,
    outcome: "progressing" as const,
    verificationPassed: 0,
    verificationTotal: 3,
    consecutiveNoProgress: 0,
  };

  it("fails when the worker or slot reports failure", () => {
    expect(decideNextStep({ ...base, outcome: "failed" }).action).toBe("fail");
    expect(decideNextStep({ ...base, slotStatus: "failed" }).action).toBe("fail");
  });

  it("escalates to a human on approval, blocked, and stuck states", () => {
    expect(decideNextStep({ ...base, outcome: "needs_approval" }).action).toBe("escalate_approval");
    expect(decideNextStep({ ...base, outcome: "blocked" }).action).toBe("escalate_approval");
    expect(decideNextStep({ ...base, slotStatus: "blocked" }).action).toBe("escalate_approval");
    expect(decideNextStep({ ...base, consecutiveNoProgress: 3 }).action).toBe("escalate_approval");
  });

  it("completes only when every verification step has passed", () => {
    expect(
      decideNextStep({ ...base, outcome: "completed", verificationPassed: 3, verificationTotal: 3 }).action,
    ).toBe("complete");
    expect(
      decideNextStep({ ...base, outcome: "completed", verificationPassed: 1, verificationTotal: 3 }).action,
    ).toBe("dispatch_next");
  });

  it("dispatches the next instruction when the worker is idle and awaiting input", () => {
    expect(decideNextStep({ ...base, outcome: "awaiting_input" }).action).toBe("dispatch_next");
  });

  it("waits for the next capture while the worker is still progressing", () => {
    expect(decideNextStep({ ...base, outcome: "progressing" }).action).toBe("await_capture");
  });

  it("prioritizes failure over a stuck counter", () => {
    expect(
      decideNextStep({ ...base, outcome: "failed", consecutiveNoProgress: 9 }).action,
    ).toBe("fail");
  });
});
