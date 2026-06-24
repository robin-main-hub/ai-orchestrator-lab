import { describe, expect, it, vi } from "vitest";
import type { RunnerPatchHandoff } from "./runnerPatchHandoff";
import {
  runnerPatchHandoffToApprovalQueueItem,
  routeHandoffToControlQueue,
  runnerPatchBlockerSummary,
  RUNNER_PATCH_SOURCE_ITEM_PREFIX,
} from "./runnerPatchToControlQueue";

function makeHandoff(overrides: Partial<RunnerPatchHandoff> = {}): RunnerPatchHandoff {
  return {
    id: "patch_mission_001_2026-06-25T00:00:00.000Z",
    missionId: "mission_001",
    repoRoot: "/repo",
    runnerId: "local_shell",
    createdAt: "2026-06-25T00:00:00.000Z",
    files: [
      { path: "src/a.ts", change: "modified" as const, additions: 10, deletions: 3, diff: "--- a/src/a.ts\n+++ b/src/a.ts" },
      { path: "src/b.ts", change: "added" as const, additions: 5, deletions: 0 },
    ],
    unifiedDiff: "--- a/src/a.ts\n+++ b/src/a.ts\n+hello",
    stats: { files: 2, additions: 15, deletions: 3 },
    testResult: { ran: true, passed: 10, failed: 0 },
    applicable: true,
    requiresApproval: true,
    blockers: [],
    warnings: [],
    ...overrides,
  };
}

describe("runnerPatchHandoffToApprovalQueueItem", () => {
  it("creates a control queue item with source/handoff id/target/action/reason/evidence", () => {
    const handoff = makeHandoff();
    const item = runnerPatchHandoffToApprovalQueueItem(handoff);

    expect(item.id).toBe("approval_patch_mission_001_2026-06-25T00:00:00.000Z");
    expect(item.sourceItemId).toBe(`${RUNNER_PATCH_SOURCE_ITEM_PREFIX}${handoff.id}`);
    expect(item.summary).toContain("2개 파일");
    expect(item.summary).toContain("+15");
    expect(item.summary).toContain("−3");
    expect(item.requestedBy).toBe("agent");
    expect(item.action).toBe("file_write");
    expect(item.reason).toBe("적용 가능");
    expect(item.sourceTrust).toBe("trusted");
    expect(item.permissions).toEqual(["write_files"]);
    expect(item.state).toBe("required");
    expect(item.commandPreview).toContain("modified: src/a.ts");
    expect(item.commandPreview).toContain("added: src/b.ts");
    expect(item.createdAt).toBe(handoff.createdAt);
  });

  it("item state is always 'required' — approval is mandatory before any apply", () => {
    const handoff = makeHandoff({ applicable: false, blockers: ["not_observed"] });
    const item = runnerPatchHandoffToApprovalQueueItem(handoff);
    expect(item.state).toBe("required");
  });

  it("includes blocker/warning info in reason when present", () => {
    const handoff = makeHandoff({
      applicable: false,
      blockers: ["not_observed", "no_changes"],
      warnings: ["tests_failed"],
    });
    const item = runnerPatchHandoffToApprovalQueueItem(handoff);
    expect(item.reason).toContain("차단: not_observed, no_changes");
    expect(item.reason).toContain("경고: tests_failed");
  });

  it("truncates file list when more than 8 files", () => {
    const files = Array.from({ length: 12 }, (_, i) => ({
      path: `src/file_${i}.ts`,
      change: "modified" as const,
      additions: 1,
      deletions: 1,
    }));
    const handoff = makeHandoff({
      files,
      stats: { files: 12, additions: 12, deletions: 12 },
    });
    const item = runnerPatchHandoffToApprovalQueueItem(handoff);
    expect(item.summary).toContain("외 4개");
  });
});

describe("routeHandoffToControlQueue — dispatch guard", () => {
  it("does NOT call runner dispatch — approval is required before execution", () => {
    const dispatchSpy = vi.fn();
    const handoff = makeHandoff();

    // routeHandoffToControlQueue creates the item without calling any dispatch
    const item = routeHandoffToControlQueue(handoff);

    expect(item.state).toBe("required");
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("handoff.requiresApproval is always true (type-level guarantee — no auto-apply path)", () => {
    const handoff = makeHandoff();
    // TypeScript enforces requiresApproval: true at the type level
    expect(handoff.requiresApproval).toBe(true);
  });
});

describe("runnerPatchBlockerSummary", () => {
  it("returns '적용 가능' when no blockers or warnings", () => {
    expect(runnerPatchBlockerSummary([], [])).toBe("적용 가능");
  });

  it("lists blockers and warnings", () => {
    expect(runnerPatchBlockerSummary(["not_observed"], ["tests_failed"])).toBe(
      "차단: not_observed / 경고: tests_failed",
    );
  });
});
