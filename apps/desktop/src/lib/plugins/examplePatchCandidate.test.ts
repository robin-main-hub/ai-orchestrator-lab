import { describe, expect, it } from "vitest";
import { EXAMPLE_PATCH_CANDIDATES } from "./examplePatchCandidate";
import {
  buildPatchCompareBoard,
  patchLaneOf,
  projectPatchCandidates,
  summarizePatchCandidates,
} from "./patchCandidateSource";

// EXAMPLE_PATCH_CANDIDATES is the GENERIC fixture that actually renders in the
// live Assistant Inbox PREVIEW seat (AssistantInboxContainer). The projector
// functions are unit-tested with synthetic inputs, but this SHIPPED fixture's
// own integrity + honesty is never pinned — yet it is the data a real user sees.
// Four authority facts protect that seat: (1) WELL-FORMED & CLEARLY-PREVIEW —
// every example survives the real projector (none dropped = all well-formed) and
// every projected row carries the read-only "preview only (no apply/dispatch)"
// note, so shipped preview data can never look like a live/applied action.
// (2) FULL-SPECTRUM HONESTY — the fixture exercises ALL three safety states
// (pass/warning/blocked), both sources (runner/handoff), and both observed
// values, so the preview shows the real safety range, not a rosy subset.
// (3) UNEARNED-VERIFICATION GUARD — run through the real compare board, the
// claimed-clean-but-actual-unconfirmed example is flagged mismatch:true, and the
// only example claiming "actual" verification actually carries actualTests.status
// "actual" — the fixture never dresses an unconfirmed patch up as verified.
// (4) HONEST RISK ROUTING — the blocked + unobserved example lands in the "risk"
// lane with a non-zero secret finding; observed honesty holds. All expected
// values are derived from a real projector/board run (self-consistent).

const ROWS = projectPatchCandidates(EXAMPLE_PATCH_CANDIDATES);

describe("EXAMPLE_PATCH_CANDIDATES — shipped preview fixture: well-formed + clearly preview-only", () => {
  it("every example survives the real projector (none dropped = all well-formed)", () => {
    expect(EXAMPLE_PATCH_CANDIDATES.length).toBeGreaterThan(0);
    expect(ROWS).toHaveLength(EXAMPLE_PATCH_CANDIDATES.length);
    expect(ROWS.map((r) => r.candidateId)).toEqual(["patch-001", "patch-002", "patch-003"]);
  });

  it("every projected row is marked read-only preview — never a live/applied action", () => {
    for (const r of ROWS) {
      expect(r.note).toBe("patch candidate · read-only · preview only (no apply/dispatch)");
    }
  });

  it("uses only generic, non-domain identifiers (patch-/runner-/mission-/src/module)", () => {
    for (const c of EXAMPLE_PATCH_CANDIDATES) {
      expect(c.candidateId).toMatch(/^patch-\d+$/);
      expect(c.runnerId).toMatch(/^runner-\d+$/);
      expect(c.missionId).toMatch(/^mission-\d+$/);
      for (const f of c.files ?? []) expect(f.path).toMatch(/^src\//);
    }
  });
});

describe("EXAMPLE_PATCH_CANDIDATES — full-spectrum honesty (no rosy subset)", () => {
  it("covers all three safety states, both sources, and both observed values", () => {
    expect(new Set(ROWS.map((r) => r.safetyStatus))).toEqual(new Set(["pass", "warning", "blocked"]));
    expect(new Set(ROWS.map((r) => r.source))).toEqual(new Set(["runner", "handoff"]));
    expect(new Set(ROWS.map((r) => r.observed))).toEqual(new Set([true, false]));
  });

  it("summary reflects the real spread (1 pass / 1 warning / 1 blocked, safest = the pass row)", () => {
    const s = summarizePatchCandidates(ROWS);
    expect(s).toMatchObject({
      count: 3,
      pass: 1,
      warning: 1,
      blocked: 1,
      observed: 2,
      notObserved: 1,
      verificationNotRun: 1,
      claimedTestsPresent: 2,
      safest: "patch-001", // lowest safety severity wins
    });
  });
});

describe("EXAMPLE_PATCH_CANDIDATES — unearned-verification guard + honest risk routing", () => {
  it("flags the claimed-clean / actual-unconfirmed example, and never fabricates an 'actual' it didn't earn", () => {
    const board = buildPatchCompareBoard(ROWS);
    const deltaById = Object.fromEntries(board.deltas.map((d) => [d.candidateId, d]));
    expect(deltaById["patch-001"]!.mismatch).toBe(false); // claimed clean AND actual confirmed
    expect(deltaById["patch-002"]!.mismatch).toBe(true); // claims clean tests but actual=not_run → flagged
    expect(deltaById["patch-003"]!.mismatch).toBe(false); // claims nothing → nothing to mismatch

    // the only example whose verificationStatus is "actual" actually carries actualTests.status "actual"
    for (const c of EXAMPLE_PATCH_CANDIDATES) {
      if (c.verificationStatus === "actual") expect(c.actualTests?.status).toBe("actual");
    }
  });

  it("routes the blocked + unobserved example into the risk lane with a real secret finding", () => {
    const board = buildPatchCompareBoard(ROWS);
    expect(board.lanes.safe.map((r) => r.candidateId)).toEqual(["patch-001"]);
    expect(board.lanes.watch.map((r) => r.candidateId)).toEqual(["patch-002"]);
    expect(board.lanes.risk.map((r) => r.candidateId)).toEqual(["patch-003"]);

    const risky = ROWS.find((r) => r.candidateId === "patch-003")!;
    expect(patchLaneOf(risky)).toBe("risk");
    expect(risky.observed).toBe(false);
    expect(risky.safetyStatus).toBe("blocked");
    expect(risky.secretFindingCount).toBeGreaterThan(0); // a blocked patch surfaces its secret finding, not hidden
  });
});
