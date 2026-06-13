// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ApprovalQueueItem, PermissionMatrixSnapshot } from "@ai-orchestrator/protocol";
import { ControlQueueDrawer } from "./ControlQueueDrawer";

afterEach(cleanup);

const item = (over: Partial<ApprovalQueueItem>): ApprovalQueueItem => ({
  id: "q",
  sourceItemId: "s",
  summary: "승인 필요",
  requestedBy: "agent",
  permissions: ["run_safe_commands"],
  state: "required",
  createdAt: "2026-06-13T00:00:00.000Z",
  ...over,
});

// 안전(git status) 1건 + 위험(rm -rf) 1건 + 명령 없는 provider 1건
function mixedSnapshot(): PermissionMatrixSnapshot {
  return {
    id: "snap",
    sessionId: "sess",
    createdAt: "2026-06-13T00:00:00.000Z",
    items: [],
    queue: [
      item({ id: "q1", sourceItemId: "safe_1", action: "terminal_run", commandPreview: "git status" }),
      item({ id: "q2", sourceItemId: "risky_1", action: "terminal_run", commandPreview: "rm -rf build" }),
      item({ id: "q3", sourceItemId: "prov_1", action: "provider_completion", costEstimateTokens: 100 }),
    ],
    summary: { allowed: 0, approved: 0, denied: 0, pending: 3 },
  };
}

const baseProps = {
  onAsk: vi.fn(),
  onBlock: vi.fn(),
  onClose: vi.fn(),
  onDelegate: vi.fn(),
  onEdit: vi.fn(),
  onReject: vi.fn(),
  open: true as const,
};

describe("ControlQueueDrawer 안전 검증 항목 일괄 승인 (jsdom)", () => {
  it("안전 1 · 제외 2를 보여주고, 확인 후 안전 항목만 승인한다", () => {
    const onApprove = vi.fn();
    render(<ControlQueueDrawer {...baseProps} onApprove={onApprove} snapshot={mixedSnapshot()} />);

    expect(screen.getByLabelText("안전 검증 항목 일괄 승인")).toBeTruthy();
    expect(screen.getByText(/대상 1개/)).toBeTruthy();
    expect(screen.getByText(/제외 2개/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /안전 항목 승인/ }));
    fireEvent.click(screen.getByRole("button", { name: /1개 승인/ }));

    // 안전 항목만, 위험/명령없음은 제외
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith("safe_1");
  });

  it("onBulkApproveSafe가 있으면 fan-out 대신 한 번에 호출(단일 trace 가능)", () => {
    const onApprove = vi.fn();
    const onBulkApproveSafe = vi.fn();
    render(
      <ControlQueueDrawer
        {...baseProps}
        onApprove={onApprove}
        onBulkApproveSafe={onBulkApproveSafe}
        snapshot={mixedSnapshot()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /안전 항목 승인/ }));
    fireEvent.click(screen.getByRole("button", { name: /1개 승인/ }));
    expect(onBulkApproveSafe).toHaveBeenCalledWith(["safe_1"]);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("안전 항목이 없으면 일괄 승인 바를 숨긴다", () => {
    const noSafe: PermissionMatrixSnapshot = {
      ...mixedSnapshot(),
      queue: [item({ id: "q2", sourceItemId: "risky_1", action: "terminal_run", commandPreview: "rm -rf build" })],
      summary: { allowed: 0, approved: 0, denied: 0, pending: 1 },
    };
    render(<ControlQueueDrawer {...baseProps} onApprove={vi.fn()} snapshot={noSafe} />);
    expect(screen.queryByLabelText("안전 검증 항목 일괄 승인")).toBeNull();
  });
});
