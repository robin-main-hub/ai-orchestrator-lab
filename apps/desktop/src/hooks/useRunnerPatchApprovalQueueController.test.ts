// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRunnerPatchApprovalQueueController } from "./useRunnerPatchApprovalQueueController";
import type { RunnerPatchHandoff } from "../lib/runnerPatchHandoff";
import type { TestResultSummary } from "../lib/codingRunner";

function makeHandoff(overrides: Partial<RunnerPatchHandoff> = {}): RunnerPatchHandoff {
  return {
    id: "patch_m1_t",
    missionId: "m1",
    repoRoot: "/tmp/repo",
    runnerId: "opencode",
    createdAt: "2026-06-16T00:00:00Z",
    files: [
      {
        path: "apps/desktop/src/A.tsx",
        change: "modified",
        additions: 1,
        deletions: 0,
        diff: "+++ b/apps/desktop/src/A.tsx\n+const X = 42;",
      },
    ],
    unifiedDiff: "+++ b/apps/desktop/src/A.tsx\n+const X = 42;",
    stats: { files: 1, additions: 1, deletions: 0 },
    testResult: { ran: true, passed: 12, failed: 0 },
    applicable: true,
    requiresApproval: true,
    blockers: [],
    warnings: [],
    ...overrides,
  };
}
const passingTests: TestResultSummary = { ran: true, passed: 12, failed: 0 };

function clock(start: string) {
  let counter = 0;
  const base = new Date(start).getTime();
  return () => new Date(base + counter++ * 1000).toISOString();
}

describe("useRunnerPatchApprovalQueueController", () => {
  it("(H1) starts empty", () => {
    const { result } = renderHook(() =>
      useRunnerPatchApprovalQueueController({ now: () => "2026-06-16T00:00:00Z" }),
    );
    expect(result.current.items).toEqual([]);
  });

  it("(H2) enqueue 후 pending 항목 1개", () => {
    const { result } = renderHook(() =>
      useRunnerPatchApprovalQueueController({ now: clock("2026-06-16T01:00:00Z") }),
    );
    act(() => {
      result.current.enqueue({
        handoff: makeHandoff(),
        result: { testResult: passingTests },
        pathPolicy: { allow: ["apps/desktop/"] },
      });
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]!.state).toBe("pending");
  });

  it("(H3) approve()는 pending → approved_for_apply 전이, apply 호출 0", () => {
    const { result } = renderHook(() =>
      useRunnerPatchApprovalQueueController({ now: clock("2026-06-16T01:00:00Z") }),
    );
    act(() => {
      result.current.enqueue({
        handoff: makeHandoff(),
        result: { testResult: passingTests },
        pathPolicy: { allow: ["apps/desktop/"] },
      });
    });
    const itemId = result.current.items[0]!.id;
    let ok = false;
    act(() => {
      ok = result.current.approve(itemId);
    });
    expect(ok).toBe(true);
    expect(result.current.items[0]!.state).toBe("approved_for_apply");
    // hook은 apply 함수를 노출하지 않는다 — 인터페이스 자체에서 자동 적용 차단.
    expect(Object.keys(result.current)).not.toContain("apply");
  });

  it("(H4) safety blocked 항목은 approve()가 false 리턴", () => {
    const fakeKey = ["sk", "live", "abcdefghijklmnop"].join("-");
    const handoff = makeHandoff({
      files: [
        {
          path: "src/c.ts",
          change: "added",
          additions: 1,
          deletions: 0,
          diff: `+++ b/src/c.ts\n+const K = "${fakeKey}";`,
        },
      ],
    });
    const { result } = renderHook(() =>
      useRunnerPatchApprovalQueueController({ now: clock("2026-06-16T01:00:00Z") }),
    );
    act(() => {
      result.current.enqueue({ handoff, result: { testResult: passingTests } });
    });
    expect(result.current.items[0]!.state).toBe("blocked");
    let ok = true;
    act(() => {
      ok = result.current.approve(result.current.items[0]!.id);
    });
    expect(ok).toBe(false);
    expect(result.current.items[0]!.state).toBe("blocked");
  });

  it("(H5) reject 후 사유 보존, 재거절 false", () => {
    const { result } = renderHook(() =>
      useRunnerPatchApprovalQueueController({ now: clock("2026-06-16T01:00:00Z") }),
    );
    act(() => {
      result.current.enqueue({
        handoff: makeHandoff(),
        result: { testResult: passingTests },
        pathPolicy: { allow: ["apps/desktop/"] },
      });
    });
    const id = result.current.items[0]!.id;
    let ok = false;
    act(() => {
      ok = result.current.reject(id, "looks wrong");
    });
    expect(ok).toBe(true);
    expect(result.current.items[0]!.state).toBe("rejected");
    expect(result.current.items[0]!.rejectionReason).toBe("looks wrong");
    let secondOk = true;
    act(() => {
      secondOk = result.current.reject(id, "again");
    });
    expect(secondOk).toBe(false);
  });

  it("(H6) 동일 handoff id 중복 enqueue 무시", () => {
    const { result } = renderHook(() =>
      useRunnerPatchApprovalQueueController({ now: clock("2026-06-16T01:00:00Z") }),
    );
    act(() => {
      result.current.enqueue({
        handoff: makeHandoff(),
        result: { testResult: passingTests },
        pathPolicy: { allow: ["apps/desktop/"] },
      });
      result.current.enqueue({
        handoff: makeHandoff(),
        result: { testResult: passingTests },
        pathPolicy: { allow: ["apps/desktop/"] },
      });
    });
    expect(result.current.items).toHaveLength(1);
  });
});
