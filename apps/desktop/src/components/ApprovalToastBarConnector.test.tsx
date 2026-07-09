// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";
import { ApprovalToastBarConnector } from "./ApprovalToastBarConnector";

function requiredItem(overrides: Partial<ApprovalQueueItem> = {}): ApprovalQueueItem {
  return {
    id: "approval_1",
    sourceItemId: "source_1",
    summary: "원격 작업공간 승인 요청 · 에이전트",
    requestedBy: "agent",
    permissions: ["remote_workspace"],
    state: "required",
    createdAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("ApprovalToastBarConnector (full-auto 이후)", () => {
  it("대기 승인이 큐에 있어도 전역 팝업을 렌더하지 않는다(null)", () => {
    const html = renderToStaticMarkup(
      <ApprovalToastBarConnector
        queue={[requiredItem(), requiredItem({ id: "approval_2", sourceItemId: "source_2" })]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onOpenHistory={vi.fn()}
      />,
    );
    // 죽은 사람용 크롬 제거: 허용/거절/승인 요약이 어디에도 노출되지 않는다.
    expect(html).toBe("");
    expect(html).not.toContain("허용");
    expect(html).not.toContain("거절");
    expect(html).not.toContain("원격 작업공간");
  });

  it("빈 큐에서도 당연히 null", () => {
    const html = renderToStaticMarkup(
      <ApprovalToastBarConnector queue={[]} onApprove={vi.fn()} onReject={vi.fn()} />,
    );
    expect(html).toBe("");
  });
});
