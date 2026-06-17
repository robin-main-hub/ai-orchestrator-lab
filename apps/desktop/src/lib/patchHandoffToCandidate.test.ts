import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { patchCandidateFromHandoff, patchCandidatesFromApprovalItems } from "./patchHandoffToCandidate";
import type { RunnerPatchHandoff } from "./runnerPatchHandoff";
import type { RunnerPatchSafetyReport } from "./runnerPatchSafety";
import type { RunnerPatchApprovalItem } from "./runnerPatchApprovalQueue";

const handoff = (over: Partial<RunnerPatchHandoff> = {}): RunnerPatchHandoff => ({
  id: "patch_mission-001_2026-06-18T10:00:00.000Z",
  missionId: "mission-001",
  repoRoot: "/repo",
  runnerId: "runner-001",
  createdAt: "2026-06-18T10:00:00.000Z",
  files: [
    { path: "src/module-a.ts", change: "modified", additions: 12, deletions: 3, diff: "@@ ..." },
  ],
  unifiedDiff: "diff --git a/src/module-a.ts b/src/module-a.ts\n@@ ...",
  stats: { files: 1, additions: 12, deletions: 3 },
  testResult: { ran: true, passed: 8, failed: 0 },
  applicable: true,
  requiresApproval: true,
  blockers: [],
  warnings: [],
  ...over,
});

const safety = (over: Partial<RunnerPatchSafetyReport> = {}): RunnerPatchSafetyReport => ({
  status: "pass",
  secretScan: { status: "pass", findings: [] },
  pathPolicy: { status: "pass", allowedPaths: ["src/"], deniedPaths: [], violations: [] },
  verification: {
    runnerClaimedTests: { ran: true, passed: 8, failed: 0 },
    actualVerification: { status: "passed", summary: "8 passed" },
    mismatch: false,
  },
  ...over,
});

describe("Batch 18 — patchCandidateFromHandoff (pure, type-only)", () => {
  it("maps a pass candidate with actual verification", () => {
    const c = patchCandidateFromHandoff(handoff(), safety());
    expect(c).toMatchObject({
      candidateId: "patch_mission-001_2026-06-18T10:00:00.000Z",
      runnerId: "runner-001",
      missionId: "mission-001",
      changedFileCount: 1,
      additions: 12,
      deletions: 3,
      safetyStatus: "pass",
      verificationStatus: "actual",
      source: "handoff",
      observed: true,
    });
    expect(c.actualTests).toMatchObject({ status: "actual", summary: "8 passed" });
    expect(c.claimedTests).toMatchObject({ ran: true, passed: 8, failed: 0 });
  });

  it("maps a warning candidate (safety warning) and keeps claimed-only verification", () => {
    const c = patchCandidateFromHandoff(
      handoff({ testResult: { ran: true, passed: 3, failed: 0 } }),
      safety({
        status: "warning",
        pathPolicy: { status: "warning", allowedPaths: [], deniedPaths: [], violations: [] },
        verification: {
          runnerClaimedTests: { ran: true, passed: 3, failed: 0 },
          actualVerification: { status: "not_run" },
          mismatch: false,
        },
      }),
    );
    expect(c.safetyStatus).toBe("warning");
    expect(c.verificationStatus).toBe("claimed"); // claimed ran, actual not_run
    expect(c.safetyWarnings).toContain("path_policy_unset");
  });

  it("maps a blocked candidate (hard blocker) and stays blocked + not observed", () => {
    const c = patchCandidateFromHandoff(
      handoff({ applicable: false, blockers: ["not_observed", "empty_diff"] }),
    );
    expect(c.safetyStatus).toBe("blocked");
    expect(c.observed).toBe(false);
    expect(c.safetyBlockers).toEqual(expect.arrayContaining(["not_observed", "empty_diff"]));
  });

  it("blocks on a secret finding from the safety report", () => {
    const c = patchCandidateFromHandoff(
      handoff(),
      safety({
        status: "blocked",
        secretScan: {
          status: "blocked",
          findings: [{ filePath: "src/module-a.ts", pattern: "github_token", redactedPreview: "ghp_…<redacted>" }],
        },
      }),
    );
    expect(c.safetyStatus).toBe("blocked");
    expect(c.secretFindingCount).toBe(1);
    expect(c.safetyBlockers).toContain("secret_in_patch");
  });

  it("missing safety report degrades to warning, NOT pass", () => {
    const c = patchCandidateFromHandoff(handoff()); // no safety arg
    expect(c.safetyStatus).toBe("warning");
    expect(c.verificationStatus).toBe("claimed"); // tests ran, no actual
    expect(c.secretFindingCount).toBe(0);
  });

  it("never surfaces raw diff text (no hunkSummary, no diff body) — secret-safe", () => {
    const c = patchCandidateFromHandoff(handoff(), safety());
    for (const f of c.files ?? []) {
      expect(f.hunkSummary).toBeUndefined();
      expect(JSON.stringify(f)).not.toContain("@@");
      expect(JSON.stringify(f)).not.toContain("diff --git");
    }
  });

  it("maps approval queue items (SafetyAnnotatedHandoff) → candidates", () => {
    const item = {
      id: "rpa-1",
      createdAt: "2026-06-18T10:00:00.000Z",
      updatedAt: "2026-06-18T10:00:00.000Z",
      state: "pending",
      handoff: { ...handoff(), safety: safety(), safetyBlockers: [], safetyWarnings: [] },
    } as unknown as RunnerPatchApprovalItem;
    const out = patchCandidatesFromApprovalItems([item]);
    expect(out).toHaveLength(1);
    expect(out[0]!.safetyStatus).toBe("pass");
    expect(out[0]!.verificationStatus).toBe("actual");
  });
});

describe("Batch 18 — mapper imports no runner execution path", () => {
  it("uses import type only (no runtime import of codingRunner / apply / dispatch)", () => {
    const candidates = [
      resolve(process.cwd(), "src/lib/patchHandoffToCandidate.ts"),
      resolve(process.cwd(), "apps/desktop/src/lib/patchHandoffToCandidate.ts"),
    ];
    const path = candidates.find((p) => existsSync(p));
    expect(path, "could not locate patchHandoffToCandidate.ts").toBeTruthy();
    // strip comments — we check the actual import graph, not doc-comment prose.
    const code = readFileSync(path!, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    // runner type modules must be imported type-only
    expect(/import type \{[^}]*\} from "\.\/runnerPatchHandoff"/.test(code)).toBe(true);
    expect(/import type \{[^}]*\} from "\.\/runnerPatchSafety"/.test(code)).toBe(true);
    // no execution-path coupling: no codingRunner import, no VALUE import from runner modules
    expect(/from "\.\/codingRunner"/.test(code)).toBe(false);
    expect(/import\s+\{[^}]*\}\s+from "\.\/runnerPatch(Handoff|Safety|ApprovalQueue)"/.test(code)).toBe(
      false,
    );
  });
});
