import { describe, expect, it } from "vitest";
import {
  APPROVAL_STATE_LABEL,
  isApprovableState,
  isPendingState,
  type RunnerPatchApprovalState,
} from "./runnerPatchApprovalQueue";

// Characterization tests for the two runnerPatchApprovalQueue selectors the
// existing runnerPatchApprovalQueue.test.ts leaves uncovered (it pins
// isApprovableState only). No behavior change. Both are pure: the selectors
// read a RunnerPatchApprovalState literal and return a label / boolean, no
// queue mutation, no React/DOM/network. We pin the exhaustive label table and
// isPendingState's (pending|blocked) predicate, contrasting it with the
// narrower isApprovableState (pending only) so the two aren't conflated.

const ALL_STATES: RunnerPatchApprovalState[] = ["pending", "blocked", "approved_for_apply", "rejected"];

describe("APPROVAL_STATE_LABEL", () => {
  it("maps every approval state to its Korean label", () => {
    expect(APPROVAL_STATE_LABEL).toEqual({
      pending: "결재 대기",
      blocked: "안전 차단",
      approved_for_apply: "승인됨 — 적용 단계 대기",
      rejected: "거절됨",
    });
  });

  it("has a label for every state literal", () => {
    for (const state of ALL_STATES) {
      expect(APPROVAL_STATE_LABEL[state], state).toBeTruthy();
    }
  });
});

describe("isPendingState", () => {
  it("treats pending and blocked as still-awaiting-decision", () => {
    expect(isPendingState("pending")).toBe(true);
    expect(isPendingState("blocked")).toBe(true);
  });

  it("treats resolved states as no longer pending", () => {
    expect(isPendingState("approved_for_apply")).toBe(false);
    expect(isPendingState("rejected")).toBe(false);
  });

  it("is broader than isApprovableState (which excludes blocked)", () => {
    expect(isPendingState("blocked")).toBe(true);
    expect(isApprovableState("blocked")).toBe(false);
    expect(isPendingState("pending")).toBe(isApprovableState("pending"));
  });
});
