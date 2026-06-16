import { describe, expect, it } from "vitest";
import {
  approveRunnerPatch,
  EMPTY_RUNNER_PATCH_APPROVAL_QUEUE,
  enqueueRunnerPatchApproval,
  isApprovableState,
  rejectRunnerPatch,
  type RunnerPatchApprovalQueue,
} from "./runnerPatchApprovalQueue";
import type { RunnerPatchHandoff } from "./runnerPatchHandoff";
import type { TestResultSummary } from "./codingRunner";

function makeHandoff(overrides: Partial<RunnerPatchHandoff> = {}): RunnerPatchHandoff {
  return {
    id: "patch_m1_2026-06-16T00:00:00Z",
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

describe("enqueueRunnerPatchApproval — safety-gated", () => {
  it("(E1) safety pass + policy 설정 → state='pending', approvable", () => {
    const now = clock("2026-06-16T01:00:00Z");
    const queue = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
      handoff: makeHandoff(),
      result: { testResult: passingTests },
      pathPolicy: { allow: ["apps/desktop/"] },
      actualVerification: { status: "passed", command: "pnpm test", ranAt: "t" },
      now,
    });
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]!.state).toBe("pending");
    expect(queue.items[0]!.handoff.safety.status).toBe("pass");
    expect(queue.items[0]!.handoff.applicable).toBe(true);
    expect(queue.items[0]!.handoff.requiresApproval).toBe(true);
    expect(isApprovableState(queue.items[0]!.state)).toBe(true);
  });

  it("(E2) safety warning(정책 미설정) → state='pending', approvable + safetyWarnings 보존", () => {
    const now = clock("2026-06-16T01:00:00Z");
    const queue = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
      handoff: makeHandoff(),
      result: { testResult: passingTests },
      now,
    });
    expect(queue.items[0]!.state).toBe("pending");
    expect(queue.items[0]!.handoff.safety.status).toBe("warning");
    expect(queue.items[0]!.handoff.safetyWarnings).toContain("path_policy_unset");
    expect(isApprovableState(queue.items[0]!.state)).toBe(true);
  });

  it("(E3) safety blocked(secret) → state='blocked', NOT approvable, applicable=false", () => {
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
    const now = clock("2026-06-16T01:00:00Z");
    const queue = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
      handoff,
      result: { testResult: passingTests },
      now,
    });
    expect(queue.items[0]!.state).toBe("blocked");
    expect(queue.items[0]!.handoff.applicable).toBe(false);
    expect(queue.items[0]!.handoff.safetyBlockers).toContain("secret_in_patch");
    expect(isApprovableState(queue.items[0]!.state)).toBe(false);
  });

  it("(E4) safety blocked(path policy) → state='blocked'", () => {
    const handoff = makeHandoff({
      files: [{ path: "infra/secrets.tf", change: "modified", additions: 1, deletions: 0 }],
    });
    const now = clock("2026-06-16T01:00:00Z");
    const queue = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
      handoff,
      result: { testResult: passingTests },
      pathPolicy: { allow: ["apps/desktop/"] },
      now,
    });
    expect(queue.items[0]!.state).toBe("blocked");
    expect(queue.items[0]!.handoff.safetyBlockers).toContain("path_policy_violation");
  });

  it("(E5) 같은 handoff.id 재등록 → 무시(중복 enqueue 안 함)", () => {
    const now = clock("2026-06-16T01:00:00Z");
    const after1 = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
      handoff: makeHandoff(),
      result: { testResult: passingTests },
      pathPolicy: { allow: ["apps/desktop/"] },
      now,
    });
    const after2 = enqueueRunnerPatchApproval(after1, {
      handoff: makeHandoff(),
      result: { testResult: passingTests },
      pathPolicy: { allow: ["apps/desktop/"] },
      now,
    });
    expect(after2.items).toHaveLength(1);
    expect(after2).toBe(after1); // 같은 reference 반환 (변경 없음)
  });

  it("(E6) item.id는 호출자 now()에서만 결정 — Date.now 같은 부수효과 없음", () => {
    const queue1 = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
      handoff: makeHandoff(),
      result: { testResult: passingTests },
      pathPolicy: { allow: ["apps/desktop/"] },
      now: () => "2026-06-16T10:00:00Z",
    });
    const queue2 = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
      handoff: makeHandoff(),
      result: { testResult: passingTests },
      pathPolicy: { allow: ["apps/desktop/"] },
      now: () => "2026-06-16T10:00:00Z",
    });
    expect(queue1.items[0]!.id).toBe(queue2.items[0]!.id);
    expect(queue1.items[0]!.createdAt).toBe("2026-06-16T10:00:00Z");
  });

  it("(E7) verification mismatch → warning, 여전히 approvable", () => {
    const queue = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
      handoff: makeHandoff(),
      result: { testResult: passingTests }, // runner claimed pass
      pathPolicy: { allow: ["apps/desktop/"] },
      actualVerification: { status: "failed", command: "pnpm test", ranAt: "t" }, // actual fail
      now: clock("2026-06-16T01:00:00Z"),
    });
    expect(queue.items[0]!.state).toBe("pending");
    expect(queue.items[0]!.handoff.safety.status).toBe("warning");
    expect(queue.items[0]!.handoff.safetyWarnings).toContain("verification_mismatch");
  });
});

describe("approveRunnerPatch — apply 호출 안 함, 상태만", () => {
  function seed(): { queue: RunnerPatchApprovalQueue; itemId: string } {
    const queue = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
      handoff: makeHandoff(),
      result: { testResult: passingTests },
      pathPolicy: { allow: ["apps/desktop/"] },
      now: clock("2026-06-16T01:00:00Z"),
    });
    return { queue, itemId: queue.items[0]!.id };
  }

  it("(A1) pending → approved_for_apply 로 전이 + resolvedAt 기록", () => {
    const { queue, itemId } = seed();
    const res = approveRunnerPatch(queue, itemId, () => "2026-06-16T02:00:00Z");
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unexpected");
    const item = res.queue.items[0]!;
    expect(item.state).toBe("approved_for_apply");
    expect(item.resolvedAt).toBe("2026-06-16T02:00:00Z");
    // handoff 본문은 변경 안 함 — reference 같아야 함
    expect(item.handoff).toBe(queue.items[0]!.handoff);
  });

  it("(A2) safety blocked → approve 거부 (blocked_by_safety)", () => {
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
    const queue = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
      handoff,
      result: { testResult: passingTests },
      now: () => "2026-06-16T01:00:00Z",
    });
    const itemId = queue.items[0]!.id;
    const res = approveRunnerPatch(queue, itemId, () => "2026-06-16T02:00:00Z");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unexpected");
    expect(res.reason).toBe("blocked_by_safety");
  });

  it("(A3) 이미 approved 항목 재승인 거부 (already_resolved)", () => {
    const { queue, itemId } = seed();
    const first = approveRunnerPatch(queue, itemId, () => "2026-06-16T02:00:00Z");
    if (!first.ok) throw new Error("expected ok");
    const second = approveRunnerPatch(first.queue, itemId, () => "2026-06-16T03:00:00Z");
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("unexpected");
    expect(second.reason).toBe("already_resolved");
  });

  it("(A4) 없는 id 거부 (not_found)", () => {
    const { queue } = seed();
    const res = approveRunnerPatch(queue, "approval_does_not_exist", () => "t");
    expect(res.ok).toBe(false);
  });
});

describe("rejectRunnerPatch", () => {
  function seed() {
    const queue = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
      handoff: makeHandoff(),
      result: { testResult: passingTests },
      pathPolicy: { allow: ["apps/desktop/"] },
      now: () => "2026-06-16T01:00:00Z",
    });
    return { queue, itemId: queue.items[0]!.id };
  }

  it("(R1) pending → rejected + 사유 보존", () => {
    const { queue, itemId } = seed();
    const res = rejectRunnerPatch(queue, itemId, "looks wrong", () => "2026-06-16T02:00:00Z");
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unexpected");
    const item = res.queue.items[0]!;
    expect(item.state).toBe("rejected");
    expect(item.rejectionReason).toBe("looks wrong");
  });

  it("(R2) safety blocked 항목도 reject 할 수 있다 (해소 의도)", () => {
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
    const queue = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
      handoff,
      result: { testResult: passingTests },
      now: () => "2026-06-16T01:00:00Z",
    });
    const res = rejectRunnerPatch(queue, queue.items[0]!.id, "blocked", () => "t");
    expect(res.ok).toBe(true);
  });

  it("(R3) 이미 결재된 항목 재거절 거부", () => {
    const { queue, itemId } = seed();
    const first = rejectRunnerPatch(queue, itemId, "no", () => "t");
    if (!first.ok) throw new Error("expected ok");
    const second = rejectRunnerPatch(first.queue, itemId, "no", () => "t");
    expect(second.ok).toBe(false);
  });

  it("(R4) 빈 사유는 undefined로 정규화", () => {
    const { queue, itemId } = seed();
    const res = rejectRunnerPatch(queue, itemId, "   ", () => "t");
    if (!res.ok) throw new Error("unexpected");
    expect(res.queue.items[0]!.rejectionReason).toBeUndefined();
  });
});

describe("immutability + apply 호출 0 가드", () => {
  it("(I1) approve/reject는 queue를 새로 만든다 — 원본 reference 유지", () => {
    const queue = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
      handoff: makeHandoff(),
      result: { testResult: passingTests },
      pathPolicy: { allow: ["apps/desktop/"] },
      now: () => "2026-06-16T01:00:00Z",
    });
    const original = queue.items[0]!;
    const res = approveRunnerPatch(queue, original.id, () => "2026-06-16T02:00:00Z");
    if (!res.ok) throw new Error("unexpected");
    expect(res.queue).not.toBe(queue);
    expect(res.queue.items[0]).not.toBe(original);
    // 원본 item은 변하지 않음
    expect(original.state).toBe("pending");
  });

  it("(I2) approve된 항목도 handoff 객체 자체는 그대로 (apply 시도 0)", () => {
    const queue = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
      handoff: makeHandoff(),
      result: { testResult: passingTests },
      pathPolicy: { allow: ["apps/desktop/"] },
      now: () => "2026-06-16T01:00:00Z",
    });
    const originalHandoff = queue.items[0]!.handoff;
    const res = approveRunnerPatch(queue, queue.items[0]!.id, () => "2026-06-16T02:00:00Z");
    if (!res.ok) throw new Error("unexpected");
    expect(res.queue.items[0]!.handoff).toBe(originalHandoff);
    expect(res.queue.items[0]!.handoff.requiresApproval).toBe(true);
  });
});
