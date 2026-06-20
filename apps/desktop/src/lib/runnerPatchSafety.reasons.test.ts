import { describe, expect, it } from "vitest";
import {
  SAFETY_BLOCKER_REASON,
  SAFETY_WARNING_REASON,
  annotateHandoffWithSafety,
  type PatchSafetyBlocker,
  type PatchSafetyWarning,
  type RunnerPatchSafetyReport,
} from "./runnerPatchSafety";
import type { RunnerPatchHandoff } from "./runnerPatchHandoff";

// Characterization tests (no behavior change) for SAFETY_BLOCKER_REASON and
// SAFETY_WARNING_REASON, the only exports in runnerPatchSafety.ts the existing
// runnerPatchSafety.test.ts leaves unasserted (that suite pins runSecretScan /
// runPathPolicy / buildVerificationReport / buildRunnerPatchSafetyReport /
// annotateHandoffWithSafety, but never the two human-facing reason tables the
// approval UI reads to explain WHY a patch was blocked or flagged).
//
// The load-bearing invariant is reason-coverage: every blocker code
// annotateHandoffWithSafety can push into safetyBlockers, and every warning code
// it can push into safetyWarnings, MUST have a non-empty reason entry — otherwise
// a surfaced blocker/warning would render with no explanation. We pin this through
// the annotator seam: drive one report that emits every blocker and one that emits
// every warning, then assert each emitted code maps to a non-empty reason and that
// the emitted set exactly equals the Record's keys (no orphan reason, no missing).

const ALL_BLOCKERS: PatchSafetyBlocker[] = ["secret_in_patch", "path_policy_violation"];
const ALL_WARNINGS: PatchSafetyWarning[] = ["path_policy_unset", "verification_mismatch"];

function makeHandoff(): RunnerPatchHandoff {
  return {
    id: "patch_m1_t",
    missionId: "m1",
    repoRoot: "/tmp/repo",
    runnerId: "opencode",
    createdAt: "2026-06-20T00:00:00Z",
    files: [],
    unifiedDiff: "",
    stats: { files: 0, additions: 0, deletions: 0 },
    testResult: { ran: false, passed: 0, failed: 0 },
    applicable: true,
    requiresApproval: true,
    blockers: [],
    warnings: [],
  };
}

// A report whose two block-producing statuses are both "blocked" → the annotator
// pushes BOTH blocker codes.
function reportAllBlocked(): RunnerPatchSafetyReport {
  return {
    status: "blocked",
    secretScan: { status: "blocked", findings: [] },
    pathPolicy: { status: "blocked", allowedPaths: [], deniedPaths: [], violations: [] },
    verification: {
      runnerClaimedTests: { ran: false, passed: 0, failed: 0 },
      actualVerification: { status: "not_run" },
      mismatch: false,
    },
  };
}

// A report whose two warn-producing signals fire (path policy unset + verifier
// mismatch) → the annotator pushes BOTH warning codes.
function reportAllWarned(): RunnerPatchSafetyReport {
  return {
    status: "warning",
    secretScan: { status: "pass", findings: [] },
    pathPolicy: { status: "warning", allowedPaths: [], deniedPaths: [], violations: [] },
    verification: {
      runnerClaimedTests: { ran: true, passed: 12, failed: 0 },
      actualVerification: { status: "failed" },
      mismatch: true,
    },
  };
}

describe("SAFETY_BLOCKER_REASON", () => {
  it("maps exactly the PatchSafetyBlocker union to non-empty reasons", () => {
    expect(Object.keys(SAFETY_BLOCKER_REASON).sort()).toEqual([...ALL_BLOCKERS].sort());
    for (const code of ALL_BLOCKERS) {
      expect(SAFETY_BLOCKER_REASON[code].length, code).toBeGreaterThan(0);
    }
  });

  it("covers every blocker the annotator can emit (reason-coverage)", () => {
    const emitted = annotateHandoffWithSafety(makeHandoff(), reportAllBlocked()).safetyBlockers;
    expect([...emitted].sort()).toEqual([...ALL_BLOCKERS].sort());
    for (const code of emitted) {
      expect(SAFETY_BLOCKER_REASON[code], code).toBeTruthy();
    }
  });
});

describe("SAFETY_WARNING_REASON", () => {
  it("maps exactly the PatchSafetyWarning union to non-empty reasons", () => {
    expect(Object.keys(SAFETY_WARNING_REASON).sort()).toEqual([...ALL_WARNINGS].sort());
    for (const code of ALL_WARNINGS) {
      expect(SAFETY_WARNING_REASON[code].length, code).toBeGreaterThan(0);
    }
  });

  it("covers every warning the annotator can emit (reason-coverage)", () => {
    const emitted = annotateHandoffWithSafety(makeHandoff(), reportAllWarned()).safetyWarnings;
    expect([...emitted].sort()).toEqual([...ALL_WARNINGS].sort());
    for (const code of emitted) {
      expect(SAFETY_WARNING_REASON[code], code).toBeTruthy();
    }
  });
});
