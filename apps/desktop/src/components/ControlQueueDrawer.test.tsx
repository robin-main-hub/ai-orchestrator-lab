import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ApprovalQueueItem, PermissionMatrixSnapshot } from "@ai-orchestrator/protocol";
import { ControlQueueDrawer } from "./ControlQueueDrawer";

const approval: ApprovalQueueItem = {
  action: "terminal_run",
  createdAt: "2026-06-06T00:00:00.000Z",
  id: "approval_1",
  permissions: ["run_dangerous_commands"],
  reason: "터미널 실행 전 확인",
  requestedBy: "agent",
  sourceItemId: "terminal_run_1",
  sourceTrust: "trusted",
  state: "required",
  summary: "터미널 실행 승인 필요",
};

const snapshot: PermissionMatrixSnapshot = {
  createdAt: "2026-06-06T00:00:00.000Z",
  id: "permission_snapshot_1",
  items: [],
  queue: [approval],
  sessionId: "session_desktop_001",
  summary: {
    allowed: 4,
    approved: 2,
    denied: 1,
    pending: 1,
  },
};

describe("ControlQueueDrawer", () => {
  it("작업 큐 상단에 처리 요약과 다음 행동을 한국어로 보여준다", () => {
    const html = renderToStaticMarkup(
      <ControlQueueDrawer
        onAsk={vi.fn()}
        onApprove={vi.fn()}
        onBlock={vi.fn()}
        onClose={vi.fn()}
        onDelegate={vi.fn()}
        onEdit={vi.fn()}
        onReject={vi.fn()}
        open
        snapshot={snapshot}
      />,
    );

    expect(html).toContain("작업 큐");
    expect(html).toContain("처리 지휘판");
    expect(html).toContain("승인 대기 1건");
    expect(html).toContain("질문·수정·위임으로 흐름 정리");
    expect(html).toContain("터미널 실행 승인 필요");
    expect(html).toContain("6개 동작 · 작업 항목 연결됨");
    expect(html).not.toContain("비활성화됨");
    expect(html).not.toContain("Control Queue");
  });

  it("승인 직후 재전송이 막히면 그 이유를 드로어 안에서 바로 보여준다", () => {
    // 승인 클릭 → 서버 게이트(blocked)인데 드로어에 아무것도 안 떠서
    // "승인했는데 아무 일도 안 일어남"으로 보이던 회귀 케이스
    const html = renderToStaticMarkup(
      <ControlQueueDrawer
        onAsk={vi.fn()}
        onApprove={vi.fn()}
        onBlock={vi.fn()}
        onClose={vi.fn()}
        onDelegate={vi.fn()}
        onEdit={vi.fn()}
        onReject={vi.fn()}
        open
        redispatchOutcomes={[
          {
            approvalId: "approval_1",
            createdAt: "2026-06-13T00:00:00.000Z",
            reason: "ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS is not enabled on this server",
            role: "code",
            status: "blocked",
          },
        ]}
        snapshot={snapshot}
      />,
    );

    expect(html).toContain("승인 후 재전송 결과");
    expect(html).toContain("차단");
    expect(html).toContain("ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS is not enabled on this server");
  });
});
