import { describe, expect, it } from "vitest";
import type { DesignIssueCard, VisualQaReport } from "@ai-orchestrator/protocol";
import type { VisualQaDiff } from "./visualQaDiff";
import {
  buildVisualEvidence,
  computePublishReadiness,
  extractConsoleSummary,
  extractScreenshotRef,
} from "./visualEvidence";

function issue(over: Partial<DesignIssueCard> = {}): DesignIssueCard {
  return {
    id: "issue_1",
    missionId: "m1",
    workspaceId: "w1",
    kind: "console_error",
    severity: "medium",
    summary: "Something logged",
    recommendation: "Look into it",
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

function diff(over: Partial<VisualQaDiff> = {}): VisualQaDiff {
  return {
    status: "improved",
    resolved: [],
    remaining: [],
    newIssues: [],
    counts: { before: 0, after: 0, resolved: 0, remaining: 0, new: 0 },
    summary: "stub",
    ...over,
  } as unknown as VisualQaDiff;
}

// Characterization tests for the Visual Evidence Card vertical (no behavior
// change). extractScreenshotRef pulls the first image-like evidenceRef,
// preferring checks over issues and refusing fakes; extractConsoleSummary
// severity-ranks console_error issues and caps the preview while reporting the
// true total; computePublishReadiness is an honesty-biased decision tree
// (verify-fail/no-preview/no-report/blocked → blocked, diff new/remaining →
// needs_fix, all-clear → ready, ambiguous → conservative needs_fix);
// buildVisualEvidence folds those into one card. All pure, no network/crypto.
describe("extractScreenshotRef", () => {
  it("returns undefined when there is no report or no image-like ref", () => {
    expect(extractScreenshotRef(undefined)).toBeUndefined();
    expect(
      extractScreenshotRef(report({ checks: [{ evidenceRef: "trace.txt" }] as unknown as VisualQaReport["checks"] })),
    ).toBeUndefined();
  });

  it("prefers a check evidenceRef over an issue one", () => {
    const result = extractScreenshotRef(
      report({
        checks: [{ evidenceRef: "shots/home.png" }] as unknown as VisualQaReport["checks"],
        issues: [issue({ evidenceRef: "other.webp" } as Partial<DesignIssueCard>)],
      }),
    );
    expect(result).toEqual({ ref: "shots/home.png", source: "check" });
  });

  it("falls back to an issue evidenceRef when no check has an image", () => {
    const result = extractScreenshotRef(
      report({ issues: [issue({ evidenceRef: "/snap/run1" } as Partial<DesignIssueCard>)] }),
    );
    expect(result).toEqual({ ref: "/snap/run1", source: "issue" });
  });

  it("recognizes keyword-style refs without an extension", () => {
    const result = extractScreenshotRef(
      report({ checks: [{ evidenceRef: "evidence-screenshot-001" }] as unknown as VisualQaReport["checks"] }),
    );
    expect(result).toEqual({ ref: "evidence-screenshot-001", source: "check" });
  });
});

describe("extractConsoleSummary", () => {
  it("returns an empty preview when there is no report", () => {
    expect(extractConsoleSummary(undefined)).toEqual({ preview: [], total: 0 });
  });

  it("keeps only console_error issues, ranks by severity, and reports the true total", () => {
    const result = extractConsoleSummary(
      report({
        issues: [
          issue({ id: "low", kind: "console_error", severity: "low" }),
          issue({ id: "contrast", kind: "contrast" }),
          issue({ id: "high", kind: "console_error", severity: "high" }),
          issue({ id: "med", kind: "console_error", severity: "medium" }),
        ],
      }),
    );
    expect(result.total).toBe(3);
    expect(result.preview.map((p) => p.id)).toEqual(["high", "med", "low"]);
  });

  it("caps the preview at the given limit while total stays uncapped", () => {
    const issues = Array.from({ length: 5 }, (_, i) =>
      issue({ id: `e${i}`, kind: "console_error", severity: "high" }),
    );
    const result = extractConsoleSummary(report({ issues }), 2);
    expect(result.preview).toHaveLength(2);
    expect(result.total).toBe(5);
  });
});

describe("computePublishReadiness", () => {
  it("blocks on verify-step failures before anything else", () => {
    expect(computePublishReadiness({ verifyFailedStep: "preview", previewUrl: "x" }).readiness).toBe("blocked");
    expect(computePublishReadiness({ verifyFailedStep: "qa", previewUrl: "x" }).readiness).toBe("blocked");
  });

  it("blocks when preview, report, or QA status are missing/blocked", () => {
    expect(computePublishReadiness({}).readiness).toBe("blocked");
    expect(computePublishReadiness({ previewUrl: "x" }).readiness).toBe("blocked");
    expect(computePublishReadiness({ previewUrl: "x", report: report({ status: "blocked" }) }).readiness).toBe("blocked");
  });

  it("uses the diff over the report when present", () => {
    const base = { previewUrl: "x", report: report({ status: "passed" }) };
    expect(computePublishReadiness({ ...base, diff: diff({ status: "blocked" }) }).readiness).toBe("blocked");
    expect(
      computePublishReadiness({
        ...base,
        diff: diff({ counts: { before: 1, after: 1, resolved: 0, remaining: 0, new: 1 } }),
      }).readiness,
    ).toBe("needs_fix");
    expect(
      computePublishReadiness({
        ...base,
        diff: diff({ counts: { before: 1, after: 1, resolved: 0, remaining: 1, new: 0 } }),
      }).readiness,
    ).toBe("needs_fix");
    expect(
      computePublishReadiness({
        ...base,
        diff: diff({ counts: { before: 1, after: 0, resolved: 1, remaining: 0, new: 0 } }),
      }).readiness,
    ).toBe("ready");
  });

  it("falls back to report status when there is no diff", () => {
    expect(
      computePublishReadiness({ previewUrl: "x", report: report({ status: "passed", issues: [] }) }).readiness,
    ).toBe("ready");
    expect(
      computePublishReadiness({ previewUrl: "x", report: report({ status: "failed", issues: [issue()] }) }).readiness,
    ).toBe("needs_fix");
    expect(
      computePublishReadiness({ previewUrl: "x", report: report({ status: "passed", issues: [issue()] }) }).readiness,
    ).toBe("needs_fix");
  });
});

describe("buildVisualEvidence", () => {
  it("folds readiness, console preview, and screenshot into one card", () => {
    const card = buildVisualEvidence({
      previewUrl: "http://localhost:5173",
      report: report({
        status: "passed",
        issues: [issue({ id: "e1", kind: "console_error", severity: "high" })],
        checks: [{ evidenceRef: "shots/a.png" }] as unknown as VisualQaReport["checks"],
      }),
    });
    expect(card.readiness).toBe("needs_fix");
    expect(card.summary).toContain("추가 수정 필요 —");
    expect(card.previewUrl).toBe("http://localhost:5173");
    expect(card.qaStatus).toBe("passed");
    expect(card.consoleTotal).toBe(1);
    expect(card.consolePreview.map((c) => c.id)).toEqual(["e1"]);
    expect(card.screenshot).toEqual({ ref: "shots/a.png", source: "check" });
  });

  it("prefixes the ready/blocked summary by readiness", () => {
    expect(
      buildVisualEvidence({ previewUrl: "x", report: report({ status: "passed", issues: [] }) }).summary,
    ).toContain("Publish 진행 가능 —");
    expect(buildVisualEvidence({}).summary).toContain("검증 차단 —");
  });
});
