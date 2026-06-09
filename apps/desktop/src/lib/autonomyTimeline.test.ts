import { describe, expect, it } from "vitest";
import { actionBadgeVariant, actionLabel, outcomeLabel, stepRowFromReduce } from "./autonomyTimeline";
import type { ReduceResult } from "./closedLoopController";

const reduce = (overrides: Partial<ReduceResult> = {}): ReduceResult => ({
  state: {
    verificationPlan: ["run tests"],
    stepIndex: 0,
    verificationPassed: 0,
    consecutiveNoProgress: 0,
    status: "running",
    maxNoProgress: 3,
  },
  decision: { action: "await_capture", reason: "still progressing" },
  outcome: "progressing",
  ...overrides,
});

describe("stepRowFromReduce", () => {
  it("maps a reduce result to a display row", () => {
    const row = stepRowFromReduce(
      reduce({ decision: { action: "dispatch_next", reason: "step completed" }, outcome: "completed" }),
      2,
    );
    expect(row).toEqual({ step: 2, outcome: "completed", action: "dispatch_next", reason: "step completed" });
  });
});

describe("labels and variants", () => {
  it("labels outcomes and actions in Korean", () => {
    expect(outcomeLabel("completed")).toBe("완료");
    expect(outcomeLabel("needs_approval")).toContain("승인");
    expect(actionLabel("escalate_approval")).toContain("에스컬레이트");
    expect(actionLabel("dispatch_next")).toContain("다음");
  });

  it("colors actions by severity", () => {
    expect(actionBadgeVariant("complete")).toBe("success");
    expect(actionBadgeVariant("fail")).toBe("danger");
    expect(actionBadgeVariant("escalate_approval")).toBe("warning");
    expect(actionBadgeVariant("await_capture")).toBe("muted");
  });
});
