import { describe, expect, it } from "vitest";
import type { DesignIssueCard, VisualQaReport } from "@ai-orchestrator/protocol";
import { buildVisualQaDiff, issueKey } from "./visualQaDiff";

function issue(over: Partial<DesignIssueCard> = {}): DesignIssueCard {
  return {
    id: "issue_1",
    missionId: "m1",
    workspaceId: "w1",
    kind: "contrast",
    severity: "medium",
    summary: "Low contrast on primary button",
    recommendation: "Increase contrast ratio",
    truthStatus: "observed",
    createdAt: "2026-06-20T00:00:00.000Z",
    ...over,
  } as unknown as DesignIssueCard;
}

function report(over: Partial<VisualQaReport> = {}): VisualQaReport {
  return {
    id: "report_1",
    missionId: "m1",
    workspaceId: "w1",
    previewUrl: "http://localhost:5173",
    checks: [],
    issues: [],
    status: "passed",
    truthStatus: "observed",
    createdAt: "2026-06-20T00:00:00.000Z",
    ...over,
  } as unknown as VisualQaReport;
}

// Characterization tests for the Fix Verification Loop visual-QA diff (no
// behavior change). issueKey makes a deterministic kind::normalized-summary key;
// buildVisualQaDiff folds two before/after reports into resolved/remaining/new
// buckets and an honesty-biased status (blocked short-circuit, passed when after
// has no issues, regressed the moment any new issue appears, improved vs
// no_change by whether anything was resolved). These pin the key normalization
// and each status/summary branch. All pure, no network/LLM.
describe("issueKey", () => {
  it("combines kind with a normalized summary (trim/lowercase/collapse/cap)", () => {
    expect(issueKey(issue({ kind: "contrast", summary: "  Low   Contrast  " }))).toBe(
      "contrast::low contrast",
    );
  });

  it("caps the summary at 200 chars and keys distinct kinds apart", () => {
    const long = "a".repeat(250);
    expect(issueKey(issue({ kind: "hierarchy", summary: long }))).toBe(`hierarchy::${"a".repeat(200)}`);
    expect(issueKey(issue({ kind: "contrast", summary: "x" }))).not.toBe(
      issueKey(issue({ kind: "hierarchy", summary: "x" })),
    );
  });

  it("treats a missing summary as empty", () => {
    expect(issueKey(issue({ kind: "console_error", summary: undefined as unknown as string }))).toBe(
      "console_error::",
    );
  });
});

describe("buildVisualQaDiff", () => {
  it("short-circuits to blocked when either report is blocked", () => {
    const blocked = buildVisualQaDiff(report({ status: "blocked", issues: [issue()] }), report());
    expect(blocked.status).toBe("blocked");
    expect(blocked.resolved).toEqual([]);
    expect(blocked.counts).toEqual({ before: 1, after: 0, resolved: 0, remaining: 0, new: 0 });

    const afterBlocked = buildVisualQaDiff(report(), report({ status: "blocked" }));
    expect(afterBlocked.status).toBe("blocked");
  });

  it("reports passed when after has no issues", () => {
    const diff = buildVisualQaDiff(
      report({ issues: [issue({ id: "a", kind: "contrast", summary: "x" })] }),
      report({ issues: [] }),
    );
    expect(diff.status).toBe("passed");
    expect(diff.resolved).toHaveLength(1);
    expect(diff.remaining).toHaveLength(0);
    expect(diff.summary).toBe("통과 — 1개 해결, 남은 이슈 없음");
  });

  it("does NOT report passed when after has zero issues but its own status is not a clean pass (fake-green guard)", () => {
    // analyzeVisualQa downgrades an observed-but-not-clean report to warning/failed with
    // no issue cards (e.g. empty body → empty_state warning; HTML load failure → failed).
    // buildVisualQaDiff must respect that status instead of re-inflating it to "passed".
    for (const afterStatus of ["warning", "failed"] as const) {
      const diff = buildVisualQaDiff(
        report({ status: "failed", issues: [issue({ id: "b1", kind: "contrast", summary: "x" })] }),
        report({ status: afterStatus, issues: [] }),
      );
      expect(diff.status).toBe("blocked");
      expect(diff.resolved).toHaveLength(1); // before issue still counted as resolved
      expect(diff.remaining).toHaveLength(0);
      expect(diff.newIssues).toHaveLength(0);
      expect(diff.summary).toContain(`status=${afterStatus}`);
    }
  });

  it("matches issues by key so same kind+summary counts as remaining, not resolved", () => {
    const before = report({
      status: "failed",
      issues: [issue({ id: "b1", kind: "contrast", summary: "Same" })],
    });
    const after = report({
      status: "failed",
      issues: [issue({ id: "a1", kind: "contrast", summary: "same" })], // normalized-equal
    });
    const diff = buildVisualQaDiff(before, after);
    expect(diff.status).toBe("no_change");
    expect(diff.remaining.map((i) => i.id)).toEqual(["a1"]); // after's card exposed
    expect(diff.resolved).toHaveLength(0);
    expect(diff.summary).toBe("변화 없음 — 1개 그대로");
  });

  it("reports improved when some resolved and some remain", () => {
    const before = report({
      status: "failed",
      issues: [
        issue({ id: "r1", kind: "contrast", summary: "gone" }),
        issue({ id: "k1", kind: "hierarchy", summary: "stay" }),
      ],
    });
    const after = report({
      status: "warning",
      issues: [issue({ id: "k2", kind: "hierarchy", summary: "stay" })],
    });
    const diff = buildVisualQaDiff(before, after);
    expect(diff.status).toBe("improved");
    expect(diff.resolved.map((i) => i.id)).toEqual(["r1"]);
    expect(diff.remaining.map((i) => i.id)).toEqual(["k2"]);
    expect(diff.summary).toBe("개선 — 1개 해결, 1개 남음");
  });

  it("reports regressed the moment a new issue appears, even alongside resolved ones", () => {
    const before = report({
      status: "failed",
      issues: [issue({ id: "r1", kind: "contrast", summary: "old" })],
    });
    const after = report({
      status: "failed",
      issues: [issue({ id: "n1", kind: "mobile_break", summary: "new" })],
    });
    const diff = buildVisualQaDiff(before, after);
    expect(diff.status).toBe("regressed");
    expect(diff.newIssues.map((i) => i.id)).toEqual(["n1"]);
    expect(diff.resolved.map((i) => i.id)).toEqual(["r1"]);
    expect(diff.counts).toEqual({ before: 1, after: 1, resolved: 1, remaining: 0, new: 1 });
    expect(diff.summary).toBe("악화 — 1개 새로 생김, 0개 남음");
  });
});
