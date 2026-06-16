// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RunnerPatchApprovalPanel } from "./RunnerPatchApprovalPanel";
import {
  EMPTY_RUNNER_PATCH_APPROVAL_QUEUE,
  enqueueRunnerPatchApproval,
  type RunnerPatchApprovalItem,
} from "../lib/runnerPatchApprovalQueue";
import type { RunnerPatchHandoff } from "../lib/runnerPatchHandoff";
import type { TestResultSummary } from "../lib/codingRunner";

afterEach(() => cleanup());

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

function makePendingItem(): RunnerPatchApprovalItem {
  const q = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
    handoff: makeHandoff({ id: "patch_pending" }),
    result: { testResult: passingTests },
    pathPolicy: { allow: ["apps/desktop/"] },
    now: () => "2026-06-16T01:00:00Z",
  });
  return q.items[0]!;
}

function makeBlockedItem(): RunnerPatchApprovalItem {
  const fakeKey = ["sk", "live", "abcdefghijklmnop"].join("-");
  const handoff = makeHandoff({
    id: "patch_blocked",
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
  const q = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
    handoff,
    result: { testResult: passingTests },
    now: () => "2026-06-16T01:00:00Z",
  });
  return q.items[0]!;
}

function makeWarningItem(): RunnerPatchApprovalItem {
  const q = enqueueRunnerPatchApproval(EMPTY_RUNNER_PATCH_APPROVAL_QUEUE, {
    handoff: makeHandoff({ id: "patch_warning" }),
    result: { testResult: passingTests },
    // No pathPolicy → path_policy_unset warning
    now: () => "2026-06-16T01:00:00Z",
  });
  return q.items[0]!;
}

describe("RunnerPatchApprovalPanel", () => {
  it("(P1) empty state — no list, hint shown", () => {
    render(<RunnerPatchApprovalPanel items={[]} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByTestId("runner-patch-approval-empty")).toBeTruthy();
    expect(screen.queryByTestId("runner-patch-approval-list")).toBeNull();
  });

  it("(P2) pending(pass) item — approve enabled + safety badge pass + runner/mission shown", () => {
    const item = makePendingItem();
    const onApprove = vi.fn();
    render(<RunnerPatchApprovalPanel items={[item]} onApprove={onApprove} onReject={vi.fn()} />);

    const safety = screen.getByTestId(`runner-patch-approval-safety-${item.id}`);
    expect(safety.getAttribute("data-safety")).toBe("pass");

    const state = screen.getByTestId(`runner-patch-approval-state-${item.id}`);
    expect(state.getAttribute("data-state")).toBe("pending");

    expect(screen.getByTestId(`runner-patch-approval-runner-${item.id}`).textContent).toContain("opencode");
    expect(screen.getByTestId(`runner-patch-approval-mission-${item.id}`).textContent).toContain("m1");

    const approveBtn = screen.getByTestId(`runner-patch-approval-approve-${item.id}`) as HTMLButtonElement;
    expect(approveBtn.disabled).toBe(false);
    fireEvent.click(approveBtn);
    expect(onApprove).toHaveBeenCalledWith(item.id);
  });

  it("(P3) blocked item — approve DISABLED, blockers list shown, safety badge blocked", () => {
    const item = makeBlockedItem();
    render(<RunnerPatchApprovalPanel items={[item]} onApprove={vi.fn()} onReject={vi.fn()} />);

    const safety = screen.getByTestId(`runner-patch-approval-safety-${item.id}`);
    expect(safety.getAttribute("data-safety")).toBe("blocked");

    const state = screen.getByTestId(`runner-patch-approval-state-${item.id}`);
    expect(state.getAttribute("data-state")).toBe("blocked");

    const approveBtn = screen.getByTestId(`runner-patch-approval-approve-${item.id}`) as HTMLButtonElement;
    expect(approveBtn.disabled).toBe(true);

    const blockers = screen.getByTestId(`runner-patch-approval-blockers-${item.id}`);
    expect(blockers.textContent).toContain("시크릿");
  });

  it("(P4) warning item — approve ENABLED + warning badge + warnings list shown", () => {
    const item = makeWarningItem();
    render(<RunnerPatchApprovalPanel items={[item]} onApprove={vi.fn()} onReject={vi.fn()} />);

    const safety = screen.getByTestId(`runner-patch-approval-safety-${item.id}`);
    expect(safety.getAttribute("data-safety")).toBe("warning");

    const approveBtn = screen.getByTestId(`runner-patch-approval-approve-${item.id}`) as HTMLButtonElement;
    expect(approveBtn.disabled).toBe(false);

    const warnings = screen.getByTestId(`runner-patch-approval-warnings-${item.id}`);
    expect(warnings.textContent).toContain("정책 미설정");
  });

  it("(P5) runner-claimed vs actual verification split is visible", () => {
    const item = makePendingItem();
    render(<RunnerPatchApprovalPanel items={[item]} onApprove={vi.fn()} onReject={vi.fn()} />);

    const claimed = screen.getByTestId(`runner-patch-approval-claimed-${item.id}`);
    expect(claimed.textContent).toContain("Runner-claimed tests");
    expect(claimed.textContent).toContain("12 passed");

    const actual = screen.getByTestId(`runner-patch-approval-actual-${item.id}`);
    expect(actual.textContent).toContain("Actual verification");
    expect(actual.textContent).toContain("not run");
  });

  it("(P6) reject flow — opens form, confirms with reason, calls onReject", () => {
    const item = makePendingItem();
    const onReject = vi.fn();
    render(<RunnerPatchApprovalPanel items={[item]} onApprove={vi.fn()} onReject={onReject} />);

    // form not yet open
    expect(screen.queryByTestId(`runner-patch-approval-reject-form-${item.id}`)).toBeNull();

    fireEvent.click(screen.getByTestId(`runner-patch-approval-reject-${item.id}`));
    const input = screen.getByTestId(`runner-patch-approval-reject-reason-${item.id}`) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "looks wrong" } });
    fireEvent.click(screen.getByTestId(`runner-patch-approval-reject-confirm-${item.id}`));

    expect(onReject).toHaveBeenCalledWith(item.id, "looks wrong");
  });

  it("(P7) total badge reflects number of items", () => {
    const a = makePendingItem();
    const b = { ...makeBlockedItem(), id: "approval_other" };
    render(<RunnerPatchApprovalPanel items={[a, b]} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByTestId("runner-patch-approval-total").textContent).toContain("2");
  });
});
