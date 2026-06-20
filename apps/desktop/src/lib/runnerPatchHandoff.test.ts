import { describe, expect, it } from "vitest";
import {
  buildRunnerPatchHandoff,
  parseUnifiedDiffFiles,
  PATCH_BLOCKER_REASON,
  summarizePatchHandoff,
} from "./runnerPatchHandoff";
import type { PatchHandoffBlocker } from "./runnerPatchHandoff";
import type { CodingRunResult } from "./codingRunner";

const ENDED = "2026-06-16T01:00:00.000Z";

function result(over: Partial<CodingRunResult> = {}): CodingRunResult {
  return {
    status: "completed",
    logChunks: [],
    changedFiles: [
      { path: "src/App.tsx", change: "modified", additions: 12, deletions: 3 },
      { path: "src/lib/util.ts", change: "added", additions: 30, deletions: 0 },
    ],
    diffSummary: [
      "--- a/src/App.tsx",
      "+++ b/src/App.tsx",
      "@@ -39,7 +39,16 @@",
      "-  const x = undefined;",
      "+  const x = props.value ?? fallback;",
      "--- a/src/lib/util.ts",
      "+++ b/src/lib/util.ts",
      "@@ -0,0 +1,3 @@",
      "+export const fallback = 0;",
    ].join("\n"),
    testResult: { ran: true, passed: 13, failed: 0 },
    startedAt: "2026-06-16T00:59:00.000Z",
    endedAt: ENDED,
    observed: true,
    ...over,
  };
}

const ctx = { missionId: "ms_1", repoRoot: "/home/robin/app", runnerId: "local_shell" };

describe("parseUnifiedDiffFiles", () => {
  it("--- a/ 경계로 파일별 조각 분리", () => {
    const map = parseUnifiedDiffFiles(result().diffSummary);
    expect([...map.keys()]).toEqual(["src/App.tsx", "src/lib/util.ts"]);
    expect(map.get("src/App.tsx")).toContain("props.value ?? fallback");
    expect(map.get("src/lib/util.ts")).toContain("export const fallback");
  });

  it("git --git 헤더 형식도 분리", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "-a",
      "+b",
      "diff --git a/src/b.ts b/src/b.ts",
      "--- a/src/b.ts",
      "+++ b/src/b.ts",
      "@@ -1 +1 @@",
      "-c",
      "+d",
    ].join("\n");
    const map = parseUnifiedDiffFiles(diff);
    expect([...map.keys()]).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("빈 diff → 빈 맵", () => {
    expect(parseUnifiedDiffFiles("").size).toBe(0);
    expect(parseUnifiedDiffFiles("   \n  ").size).toBe(0);
  });
});

describe("buildRunnerPatchHandoff", () => {
  it("정상 완료 → applicable, requiresApproval=true, 파일별 diff 첨부", () => {
    const handoff = buildRunnerPatchHandoff(result(), ctx);
    expect(handoff.applicable).toBe(true);
    expect(handoff.requiresApproval).toBe(true);
    expect(handoff.blockers).toEqual([]);
    expect(handoff.stats).toEqual({ files: 2, additions: 42, deletions: 3 });
    expect(handoff.files[0]!.diff).toContain("props.value ?? fallback");
    expect(handoff.id).toBe(`patch_ms_1_${ENDED}`); // 결정론적
    expect(handoff.createdAt).toBe(ENDED);
  });

  it("미관측(observed=false) → applicable=false + not_observed (자동 적용 막힘)", () => {
    const handoff = buildRunnerPatchHandoff(result({ observed: false }), ctx);
    expect(handoff.applicable).toBe(false);
    expect(handoff.blockers).toContain("not_observed");
    expect(handoff.requiresApproval).toBe(true); // 그래도 자동 적용 경로는 없음
  });

  it("실패 run → applicable=false + run_not_completed", () => {
    const handoff = buildRunnerPatchHandoff(result({ status: "failed", changedFiles: [], diffSummary: "" }), ctx);
    expect(handoff.applicable).toBe(false);
    expect(handoff.blockers).toEqual(expect.arrayContaining(["run_not_completed", "no_changes", "empty_diff"]));
  });

  it("변경 없음 → applicable=false + no_changes/empty_diff", () => {
    const handoff = buildRunnerPatchHandoff(result({ changedFiles: [], diffSummary: "" }), ctx);
    expect(handoff.applicable).toBe(false);
    expect(handoff.blockers).toEqual(expect.arrayContaining(["no_changes", "empty_diff"]));
  });

  it("테스트 실패 → 막진 않지만 warning (사람이 판단)", () => {
    const handoff = buildRunnerPatchHandoff(result({ testResult: { ran: true, passed: 10, failed: 2 } }), ctx);
    expect(handoff.applicable).toBe(true); // 하드 블록 아님
    expect(handoff.warnings).toContain("tests_failed");
  });
});

describe("summarizePatchHandoff", () => {
  it("적용 가능 → 파일/통계 + 승인 대기", () => {
    expect(summarizePatchHandoff(buildRunnerPatchHandoff(result(), ctx))).toContain("승인 대기");
  });
  it("막힘 → 사유 문자열", () => {
    const handoff = buildRunnerPatchHandoff(result({ observed: false }), ctx);
    expect(summarizePatchHandoff(handoff)).toContain("미관측");
  });
});

// Characterization tests (no behavior change) for the previously-unasserted reason map
// PATCH_BLOCKER_REASON. The summarize block above reads this map indirectly but never pins
// its completeness. Load-bearing contract: it is a TOTAL map over every PatchHandoffBlocker
// the builder can emit — every emitted blocker/warning resolves to a non-empty human string,
// so summarizePatchHandoff can never render "undefined". The emittable key set is derived
// from buildRunnerPatchHandoff itself (a single run that trips all four hard blockers AND
// the soft warning at once) so the coverage check stays self-consistent with the emitter.
describe("PATCH_BLOCKER_REASON", () => {
  // one run that trips every hard blocker (failed + unobserved + no files + empty diff)
  // and the soft warning (failed tests) simultaneously
  const allBlocked = buildRunnerPatchHandoff(
    result({
      status: "failed",
      observed: false,
      changedFiles: [],
      diffSummary: "",
      testResult: { ran: true, passed: 0, failed: 1 },
    }),
    ctx,
  );

  it("covers exactly the keys the builder can emit (no missing, no orphan reason)", () => {
    const emitted = new Set<PatchHandoffBlocker>([...allBlocked.blockers, ...allBlocked.warnings]);
    // sanity: this single run really exercises all five union members
    expect(emitted).toEqual(
      new Set(["run_not_completed", "not_observed", "no_changes", "empty_diff", "tests_failed"]),
    );
    // the map's keys match that emittable set exactly — both directions
    expect(new Set(Object.keys(PATCH_BLOCKER_REASON))).toEqual(emitted);
  });

  it("every reason is a non-empty human string", () => {
    for (const reason of Object.values(PATCH_BLOCKER_REASON)) {
      expect(reason.trim().length).toBeGreaterThan(0);
    }
  });

  it("summarize resolves each emitted blocker through the map (never 'undefined')", () => {
    const summary = summarizePatchHandoff(allBlocked);
    // blocked summary is exactly the blockers' reasons joined — driven from the map itself
    expect(summary).toBe(allBlocked.blockers.map((b) => PATCH_BLOCKER_REASON[b]).join(" · "));
    expect(summary).not.toContain("undefined");
  });
});
