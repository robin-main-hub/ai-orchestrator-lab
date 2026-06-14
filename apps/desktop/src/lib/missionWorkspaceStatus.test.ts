import { describe, expect, it } from "vitest";
import { computeMissionWorkspaceStatus } from "./missionWorkspaceStatus";
import type { VisualQaReport } from "@ai-orchestrator/protocol";
import type { VisualQaDiff } from "./visualQaDiff";

function report(over: Partial<VisualQaReport> = {}): VisualQaReport {
  return {
    id: "r", missionId: "m", workspaceId: "w", previewUrl: "http://x",
    checks: [], issues: [], status: "passed", truthStatus: "observed",
    createdAt: "t",
    ...over,
  };
}

function diff(over: Partial<VisualQaDiff> = {}): VisualQaDiff {
  return {
    status: "passed",
    resolved: [], remaining: [], newIssues: [],
    counts: { before: 0, after: 0, resolved: 0, remaining: 0, new: 0 },
    summary: "",
    ...over,
  };
}

describe("computeMissionWorkspaceStatus", () => {
  it("scaffold 없음 → blocked_no_scaffold", () => {
    expect(computeMissionWorkspaceStatus({ hasScaffoldFiles: false, previewObserved: false, fixApplied: false }).phase).toBe("blocked_no_scaffold");
  });
  it("scaffold만 있음 → build_ready (recommend preview)", () => {
    const s = computeMissionWorkspaceStatus({ hasScaffoldFiles: true, previewObserved: false, fixApplied: false });
    expect(s.phase).toBe("build_ready");
    expect(s.recommendedAction).toBe("preview");
  });
  it("preview observed → preview_running (recommend qa)", () => {
    const s = computeMissionWorkspaceStatus({ hasScaffoldFiles: true, previewObserved: true, fixApplied: false });
    expect(s.phase).toBe("preview_running");
    expect(s.recommendedAction).toBe("qa");
  });
  it("QA passed + issues=0 → publish_ready", () => {
    const s = computeMissionWorkspaceStatus({
      hasScaffoldFiles: true, previewObserved: true, fixApplied: false,
      qaReport: report({ status: "passed", issues: [] }),
    });
    expect(s.phase).toBe("publish_ready");
    expect(s.recommendedAction).toBe("publish");
  });
  it("QA failed + issues>0 → qa_issues_found (recommend fix)", () => {
    const s = computeMissionWorkspaceStatus({
      hasScaffoldFiles: true, previewObserved: true, fixApplied: false,
      qaReport: report({ status: "failed", issues: [{ id: "x" } as any] }),
    });
    expect(s.phase).toBe("qa_issues_found");
    expect(s.recommendedAction).toBe("fix");
  });
  it("fix applied → fix_applied_verification_needed (recommend fix)", () => {
    const s = computeMissionWorkspaceStatus({
      hasScaffoldFiles: true, previewObserved: true, fixApplied: true,
      qaReport: report({ status: "failed", issues: [{ id: "x" } as any] }),
    });
    expect(s.phase).toBe("fix_applied_verification_needed");
    expect(s.recommendedAction).toBe("fix");
  });
  it("verify diff passed → publish_ready", () => {
    const s = computeMissionWorkspaceStatus({
      hasScaffoldFiles: true, previewObserved: true, fixApplied: true,
      verifyDiff: diff({ status: "passed" }),
    });
    expect(s.phase).toBe("publish_ready");
    expect(s.recommendedAction).toBe("publish");
  });
  it("verify diff regressed → verify_needs_fix", () => {
    const s = computeMissionWorkspaceStatus({
      hasScaffoldFiles: true, previewObserved: true, fixApplied: true,
      verifyDiff: diff({ status: "regressed", counts: { before: 1, after: 2, resolved: 0, remaining: 1, new: 1 } }),
    });
    expect(s.phase).toBe("verify_needs_fix");
    expect(s.recommendedAction).toBe("fix");
  });
  it("verifyFailedStep=preview → preview_failed (가장 위에)", () => {
    const s = computeMissionWorkspaceStatus({
      hasScaffoldFiles: true, previewObserved: true, fixApplied: true,
      verifyDiff: diff({ status: "passed" }), // 더 좋은 신호 있어도 fail이 우선.
      verifyFailedStep: "preview",
    });
    expect(s.phase).toBe("preview_failed");
    expect(s.recommendedAction).toBe("preview");
  });
  it("verifyFailedStep=qa → qa_failed", () => {
    const s = computeMissionWorkspaceStatus({
      hasScaffoldFiles: true, previewObserved: true, fixApplied: true,
      verifyFailedStep: "qa",
    });
    expect(s.phase).toBe("qa_failed");
    expect(s.recommendedAction).toBe("qa");
  });
  it("QA blocked → qa_blocked (recommend preview)", () => {
    const s = computeMissionWorkspaceStatus({
      hasScaffoldFiles: true, previewObserved: false, fixApplied: false,
      qaReport: report({ status: "blocked", issues: [] }),
    });
    expect(s.phase).toBe("qa_blocked");
    expect(s.recommendedAction).toBe("preview");
  });
});
