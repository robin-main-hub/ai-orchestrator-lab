import { describe, expect, it } from "vitest";
import type { DesignIssueCard, DesignIssueKind, VisualQaReport } from "@ai-orchestrator/protocol";
import {
  type AppFixDraft,
  buildAppFixDraftFromVisualQa,
  buildAppFixPatches,
  DESIGN_ISSUE_KIND_LABEL,
} from "./appFixDraft";

function issue(over: Partial<DesignIssueCard> = {}): DesignIssueCard {
  return {
    id: "issue_1",
    missionId: "m1",
    workspaceId: "w1",
    kind: "contrast",
    severity: "medium",
    summary: "Low contrast",
    recommendation: "Raise contrast to AA",
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
    status: "failed",
    truthStatus: "observed",
    createdAt: "2026-06-20T00:00:00.000Z",
    ...over,
  } as unknown as VisualQaReport;
}

// Characterization tests for the Visual-QA → AppFix draft/patch vertical (no
// behavior change). buildAppFixDraftFromVisualQa deterministically maps issue
// kinds to react_vite scaffold files (blocked/no_issues short-circuits,
// per-file grouping with alphabetical sort, sorted kindHints, joined what/why,
// honest unmapped bucket); buildAppFixPatches folds that draft + current file
// contents into per-file regex patches (missing/empty file → applied=false,
// rule match → applied with notes). All pure, no LLM/network.
describe("buildAppFixDraftFromVisualQa", () => {
  it("short-circuits to blocked when the report is blocked", () => {
    const draft = buildAppFixDraftFromVisualQa(report({ status: "blocked", issues: [issue()] }));
    expect(draft.status).toBe("blocked");
    expect(draft.fileSuggestions).toEqual([]);
    expect(draft.counts).toEqual({ totalIssues: 0, mappedIssues: 0, unmappedIssues: 0, suggestionGroups: 0 });
  });

  it("returns no_issues when passed or when there are no issues", () => {
    expect(buildAppFixDraftFromVisualQa(report({ status: "passed", issues: [issue()] })).status).toBe("no_issues");
    expect(buildAppFixDraftFromVisualQa(report({ status: "warning", issues: [] })).status).toBe("no_issues");
  });

  it("groups issues by mapped file in alphabetical order with sorted kindHints", () => {
    const draft = buildAppFixDraftFromVisualQa(
      report({
        status: "failed",
        issues: [
          issue({ id: "e1", kind: "console_error" }), // src/main.tsx
          issue({ id: "c1", kind: "mobile_break" }), // src/styles.css
          issue({ id: "c2", kind: "contrast" }), // src/styles.css
        ],
      }),
    );
    expect(draft.status).toBe("has_fixes");
    expect(draft.fileSuggestions.map((s) => s.file)).toEqual(["src/main.tsx", "src/styles.css"]);
    const styles = draft.fileSuggestions.find((s) => s.file === "src/styles.css")!;
    expect(styles.kindHints).toEqual(["contrast", "mobile_break"]); // sorted
    expect(styles.evidenceIssueIds.sort()).toEqual(["c1", "c2"]);
    // primary kind's "what" leads; extra kind appended with its Korean label
    expect(styles.what).toContain(`(+ ${DESIGN_ISSUE_KIND_LABEL.mobile_break}:`);
    expect(draft.counts).toEqual({ totalIssues: 3, mappedIssues: 3, unmappedIssues: 0, suggestionGroups: 2 });
  });

  it("derives why from recommendations, falling back to summaries then a default", () => {
    const recDraft = buildAppFixDraftFromVisualQa(
      report({ status: "failed", issues: [issue({ kind: "contrast", recommendation: "Fix it", summary: "S" })] }),
    );
    expect(recDraft.fileSuggestions[0]!.why).toBe("Fix it");

    const sumDraft = buildAppFixDraftFromVisualQa(
      report({ status: "failed", issues: [issue({ kind: "contrast", recommendation: "", summary: "Only summary" })] }),
    );
    expect(sumDraft.fileSuggestions[0]!.why).toBe("Only summary");

    const noneDraft = buildAppFixDraftFromVisualQa(
      report({ status: "failed", issues: [issue({ kind: "contrast", recommendation: "", summary: "" })] }),
    );
    expect(noneDraft.fileSuggestions[0]!.why).toBe("Visual QA에서 관측된 이슈");
  });

  it("puts kinds with no file mapping into the honest unmapped bucket", () => {
    const draft = buildAppFixDraftFromVisualQa(
      report({
        status: "failed",
        issues: [
          issue({ id: "u1", kind: "totally_unknown" as DesignIssueKind, severity: "high" }),
          issue({ id: "m1", kind: "contrast" }),
        ],
      }),
    );
    expect(draft.unmappedIssues.map((u) => u.id)).toEqual(["u1"]);
    expect(draft.counts).toEqual({ totalIssues: 2, mappedIssues: 1, unmappedIssues: 1, suggestionGroups: 1 });
    expect(draft.summary).toContain("1개 분류 불가");
  });
});

function hasFixesDraft(file: string, kindHints: DesignIssueKind[]): AppFixDraft {
  return {
    status: "has_fixes",
    summary: "stub",
    fileSuggestions: [{ file, what: "w", why: "y", kindHints, evidenceIssueIds: ["x"] }],
    unmappedIssues: [],
    counts: { totalIssues: 1, mappedIssues: 1, unmappedIssues: 0, suggestionGroups: 1 },
  };
}

describe("buildAppFixPatches", () => {
  it("returns no patches unless the draft has fixes", () => {
    const draft: AppFixDraft = { ...hasFixesDraft("src/styles.css", ["mobile_break"]), status: "no_issues", fileSuggestions: [] };
    expect(buildAppFixPatches(draft, [{ path: "src/styles.css", content: "x" }])).toEqual([]);
  });

  it("marks a suggestion unapplied when the scaffold has no such file", () => {
    const patches = buildAppFixPatches(hasFixesDraft("src/styles.css", ["mobile_break"]), [
      { path: "src/App.tsx", content: "x" },
    ]);
    expect(patches).toHaveLength(1);
    expect(patches[0]!.applied).toBe(false);
    expect(patches[0]!.note).toContain("이 파일이 없어");
    expect(patches[0]!.oldContent).toBe("");
  });

  it("appends a mobile media query for mobile_break and reports it applied", () => {
    const css = ".app-screens { display: grid; }\n";
    const patches = buildAppFixPatches(hasFixesDraft("src/styles.css", ["mobile_break"]), [
      { path: "src/styles.css", content: css },
    ]);
    expect(patches[0]!.applied).toBe(true);
    expect(patches[0]!.newContent).toContain("@media (max-width: 640px)");
    expect(patches[0]!.note).toContain("mobile_break");
  });

  it("leaves console_error in main.tsx unapplied (no auto-fix without cause)", () => {
    const patches = buildAppFixPatches(hasFixesDraft("src/main.tsx", ["console_error"]), [
      { path: "src/main.tsx", content: "import App from './App';\n" },
    ]);
    expect(patches[0]!.applied).toBe(false);
    expect(patches[0]!.newContent).toBe(patches[0]!.oldContent);
    expect(patches[0]!.note).toContain("자동 적용 가능한 규칙이 없습니다");
  });

  it("reports empty original content as unapplied", () => {
    const patches = buildAppFixPatches(hasFixesDraft("src/styles.css", ["mobile_break"]), [
      { path: "src/styles.css", content: "" },
    ]);
    expect(patches[0]!.applied).toBe(false);
    expect(patches[0]!.note).toContain("원본 파일 content가 비어 있어");
  });
});
