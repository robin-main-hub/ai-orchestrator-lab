import { describe, expect, it } from "vitest";
import { decideSelfCorrection, DEFAULT_SELF_CORRECTION_POLICY } from "./selfCorrection.js";

describe("decideSelfCorrection", () => {
  it("retries while under the attempt cap", () => {
    const d = decideSelfCorrection({ priorErrorSignatures: ["e1"], currentErrorSignature: "e2", workerRole: "builder" });
    expect(d.action).toBe("retry");
    expect(d.attempt).toBe(2);
  });

  it("stops when the same error repeats (no infinite loop)", () => {
    const d = decideSelfCorrection({ priorErrorSignatures: ["e1"], currentErrorSignature: "e1" });
    expect(d.action).toBe("stop_same_error");
  });

  it("requires human review after max attempts", () => {
    const d = decideSelfCorrection({ priorErrorSignatures: ["e1", "e2", "e3"], currentErrorSignature: "e4" });
    expect(d.action).toBe("require_human");
  });

  it("never auto-marks failure as success — resolved only when no error", () => {
    const d = decideSelfCorrection({ priorErrorSignatures: ["e1"], currentErrorSignature: undefined });
    expect(d.action).toBe("stop_resolved");
  });

  it("blocks roles outside the allowlist", () => {
    const d = decideSelfCorrection({ priorErrorSignatures: [], currentErrorSignature: "e1", workerRole: "companion" });
    expect(d.action).toBe("require_human");
  });
});

// DEFAULT_SELF_CORRECTION_POLICY is 0-ref across the test tree yet is the
// fallback every decideSelfCorrection call uses when no policy is passed — its
// values are the bounded-loop safety contract (cap 3, stop on repeat, human
// after max, only builder/verifier may auto-fix). And the existing tests only
// hit one branch at a time; the *precedence* between the guards (resolved >
// max-attempts > same-error > role) is the honesty-critical part: a worse
// ordering could dress a stuck loop up as a fresh retry, or skip the
// human-review gate. Pin the default and the branch ordering directly.
describe("DEFAULT_SELF_CORRECTION_POLICY + decideSelfCorrection precedence", () => {
  it("pins the bounded-loop safety defaults", () => {
    expect(DEFAULT_SELF_CORRECTION_POLICY).toEqual({
      maxAttempts: 3,
      requireHumanAfterMax: true,
      allowedRoles: ["builder", "verifier"],
      stopOnSameErrorTwice: true,
    });
  });

  it("omitting policy decides identically to passing DEFAULT_SELF_CORRECTION_POLICY explicitly", () => {
    const input = { priorErrorSignatures: ["e1"], currentErrorSignature: "e2", workerRole: "builder" } as const;
    expect(decideSelfCorrection(input)).toEqual(
      decideSelfCorrection({ ...input, policy: DEFAULT_SELF_CORRECTION_POLICY }),
    );
  });

  it("resolved wins over everything — no current error stops as resolved even past the attempt cap", () => {
    const d = decideSelfCorrection({ priorErrorSignatures: ["e1", "e2", "e3", "e4", "e5"], currentErrorSignature: undefined });
    expect(d.action).toBe("stop_resolved");
    // the one branch that reports attempt as the count so far (no +1), unlike every retry/stop branch
    expect(d.attempt).toBe(5);
  });

  it("the max-attempts gate runs BEFORE the same-error gate — a repeat at the cap escalates to human, not stop_same_error", () => {
    const d = decideSelfCorrection({ priorErrorSignatures: ["e1", "e2", "e1"], currentErrorSignature: "e1" });
    expect(d.action).toBe("require_human"); // max (3>=3) wins over the same-error repeat
    expect(d.attempt).toBe(4);
  });

  it("stopOnSameErrorTwice:false lets the same error retry (under the cap)", () => {
    const policy = { ...DEFAULT_SELF_CORRECTION_POLICY, stopOnSameErrorTwice: false };
    const d = decideSelfCorrection({ policy, priorErrorSignatures: ["e1"], currentErrorSignature: "e1", workerRole: "builder" });
    expect(d.action).toBe("retry");
  });

  it("a custom allowedRoles can permit a role the default would block", () => {
    const policy = { ...DEFAULT_SELF_CORRECTION_POLICY, allowedRoles: ["companion"] };
    const d = decideSelfCorrection({ policy, priorErrorSignatures: [], currentErrorSignature: "e1", workerRole: "companion" });
    expect(d.action).toBe("retry");
  });
});
