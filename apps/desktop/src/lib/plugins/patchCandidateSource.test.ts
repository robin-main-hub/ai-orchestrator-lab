import { describe, expect, it } from "vitest";
import {
  buildPatchCompareBoard,
  patchLaneOf,
  projectPatchCandidates,
  summarizePatchCandidates,
  type PatchCandidateInput,
} from "./patchCandidateSource";

const input = (over: Partial<PatchCandidateInput> = {}): PatchCandidateInput => ({
  candidateId: "patch-001",
  runnerId: "runner-001",
  missionId: "mission-001",
  changedFileCount: 2,
  additions: 10,
  deletions: 3,
  safetyStatus: "pass",
  verificationStatus: "actual",
  source: "runner",
  observed: true,
  ...over,
});

describe("Batch 17 — projectPatchCandidates (pure, read-only)", () => {
  it("projects valid candidates and carries the read-only note", () => {
    const rows = projectPatchCandidates([input()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      candidateId: "patch-001",
      runnerId: "runner-001",
      missionId: "mission-001",
      safetyStatus: "pass",
      verificationStatus: "actual",
      source: "runner",
      observed: true,
    });
    expect(rows[0]!.note).toContain("read-only");
    expect(rows[0]!.note).toContain("no apply");
  });

  it("drops invalid rows (missing ids / bad enums) and never mutates input", () => {
    const items = [
      input(),
      input({ candidateId: "" }),
      input({ runnerId: "" }),
      input({ safetyStatus: "bogus" as never }),
      input({ source: "external" as never }),
    ];
    const frozen = JSON.stringify(items);
    expect(projectPatchCandidates(items)).toHaveLength(1);
    expect(JSON.stringify(items)).toBe(frozen);
  });

  it("keeps observed honest (only true when asserted) and coerces bad numbers to 0", () => {
    const out = projectPatchCandidates([
      input({ observed: undefined as never, additions: -5 as never, changedFileCount: NaN as never }),
    ])[0]!;
    expect(out.observed).toBe(false);
    expect(out.additions).toBe(0);
    expect(out.changedFileCount).toBe(0);
  });

  it("is deterministic and free of Date.now (same input → same output)", () => {
    const a = JSON.stringify(projectPatchCandidates([input()]));
    const b = JSON.stringify(projectPatchCandidates([input()]));
    expect(a).toBe(b);
  });
});

describe("Batch 17 — summarizePatchCandidates (pure comparison)", () => {
  it("counts blocked/warning and picks the safest non-blocked candidate", () => {
    const rows = projectPatchCandidates([
      input({ candidateId: "patch-001", safetyStatus: "warning", verificationStatus: "claimed" }),
      input({ candidateId: "patch-002", safetyStatus: "pass", verificationStatus: "actual" }),
      input({ candidateId: "patch-003", safetyStatus: "blocked", verificationStatus: "not_run" }),
    ]);
    const s = summarizePatchCandidates(rows);
    expect(s.count).toBe(3);
    expect(s.blocked).toBe(1);
    expect(s.warning).toBe(1);
    expect(s.safest).toBe("patch-002"); // pass beats warning
  });

  it("has no safe pick when every candidate is blocked", () => {
    const rows = projectPatchCandidates([
      input({ candidateId: "patch-001", safetyStatus: "blocked" }),
      input({ candidateId: "patch-002", safetyStatus: "blocked" }),
    ]);
    const s = summarizePatchCandidates(rows);
    expect(s.safest).toBeUndefined();
    expect(s.blocked).toBe(2);
  });

  it("computes files-touched overlap only when ≥2 candidates carry files", () => {
    const rows = projectPatchCandidates([
      input({
        candidateId: "patch-001",
        files: [
          { path: "src/a.ts", change: "modified", additions: 1, deletions: 0 },
          { path: "src/shared.ts", change: "modified", additions: 1, deletions: 0 },
        ],
      }),
      input({
        candidateId: "patch-002",
        files: [
          { path: "src/b.ts", change: "modified", additions: 1, deletions: 0 },
          { path: "src/shared.ts", change: "modified", additions: 1, deletions: 0 },
        ],
      }),
    ]);
    const s = summarizePatchCandidates(rows);
    expect(s.overlapCount).toBe(1); // src/shared.ts touched by both
    expect(s.filesTouched).toContain("src/shared.ts");
  });
});

describe("Batch 20 — buildPatchCompareBoard (pure compare board)", () => {
  it("buckets candidates into safe / watch / risk lanes", () => {
    const rows = projectPatchCandidates([
      input({ candidateId: "p-safe", safetyStatus: "pass", observed: true }),
      input({ candidateId: "p-watch", safetyStatus: "warning", observed: true }),
      input({ candidateId: "p-blocked", safetyStatus: "blocked", observed: true }),
      input({ candidateId: "p-unobs", safetyStatus: "pass", observed: false }),
    ]);
    const board = buildPatchCompareBoard(rows);
    expect(board.lanes.safe.map((c) => c.candidateId)).toEqual(["p-safe"]);
    expect(board.lanes.watch.map((c) => c.candidateId)).toEqual(["p-watch"]);
    // blocked AND unobserved both land in risk
    expect(board.lanes.risk.map((c) => c.candidateId).sort()).toEqual(["p-blocked", "p-unobs"]);
    expect(patchLaneOf(rows[0]!)).toBe("safe");
  });

  it("sorts each lane by churn ascending (fastest to review first)", () => {
    const rows = projectPatchCandidates([
      input({ candidateId: "big", additions: 90, deletions: 20 }),
      input({ candidateId: "small", additions: 3, deletions: 1 }),
    ]);
    const board = buildPatchCompareBoard(rows);
    expect(board.lanes.safe.map((c) => c.candidateId)).toEqual(["small", "big"]);
  });

  it("builds a file-overlap heatmap (count desc, ≥2 = overlap)", () => {
    const rows = projectPatchCandidates([
      input({
        candidateId: "a",
        files: [
          { path: "src/shared.ts", change: "modified", additions: 1, deletions: 0 },
          { path: "src/a.ts", change: "modified", additions: 1, deletions: 0 },
        ],
      }),
      input({
        candidateId: "b",
        files: [{ path: "src/shared.ts", change: "modified", additions: 1, deletions: 0 }],
      }),
    ]);
    const board = buildPatchCompareBoard(rows);
    expect(board.heatmap[0]).toEqual({ path: "src/shared.ts", count: 2 });
    expect(board.heatmap.find((h) => h.path === "src/a.ts")?.count).toBe(1);
  });

  it("flags a claimed-clean / actual-unconfirmed verification mismatch", () => {
    const rows = projectPatchCandidates([
      input({
        candidateId: "claims-clean",
        claimedTests: { ran: true, passed: 9, failed: 0 },
        actualTests: { status: "not_run" },
      }),
      input({
        candidateId: "confirmed",
        claimedTests: { ran: true, passed: 9, failed: 0 },
        actualTests: { status: "actual", summary: "9 passed" },
      }),
    ]);
    const board = buildPatchCompareBoard(rows);
    const d = (id: string) => board.deltas.find((x) => x.candidateId === id)!;
    expect(d("claims-clean").mismatch).toBe(true);
    expect(d("confirmed").mismatch).toBe(false);
    expect(d("confirmed").actual).toBe("actual");
  });

  it("is empty-safe (no rows → empty lanes/heatmap/deltas)", () => {
    const board = buildPatchCompareBoard([]);
    expect(board.lanes).toEqual({ safe: [], watch: [], risk: [] });
    expect(board.heatmap).toEqual([]);
    expect(board.deltas).toEqual([]);
  });
});
