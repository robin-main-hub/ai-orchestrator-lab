import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ApprovalQueueItem, ConversationMessage } from "@ai-orchestrator/protocol";
import type { WorkbenchAgent } from "../../types";
import { createAgentChatContinuitySummary } from "../../lib/agentChatContinuity";
import { MessageThread, readMessageToolCalls } from "./MessageThread";

const agent: WorkbenchAgent = {
  id: "agent_orchestrator",
  enabled: true,
  kind: "virtual",
  name: "Orchestrator",
  role: "orchestrator",
  modelId: "mimo-v2.5-pro",
  providerProfileId: "provider_mimo_token_openai",
  configSource: "internal",
  soulMode: "summary",
};

const continuity = createAgentChatContinuitySummary({
  adapterStatus: "ready",
  agentName: "Orchestrator",
  memoryRecordCount: 0,
  messageCount: 1,
  toolLabels: [],
});

function message(id: string, role: "user" | "assistant", metadata?: Record<string, unknown>): ConversationMessage {
  return {
    id,
    sessionId: "session_test",
    role,
    content: `${id} 내용`,
    createdAt: "2026-06-11T00:00:00.000Z",
    metadata,
  };
}

function renderThread(overrides: Partial<Parameters<typeof MessageThread>[0]> = {}) {
  return renderToStaticMarkup(
    <MessageThread
      agentChatContinuity={continuity}
      messages={[message("m_user", "user"), message("m_assistant", "assistant")]}
      selectedAgent={agent}
      workbenchVisibility={{ showInlineApprovalQueue: false, showInlineDelegation: false }}
      permissionSnapshotQueue={[]}
      onApprovePermission={() => {}}
      onRejectPermission={() => {}}
      agents={[agent]}
      {...overrides}
    />,
  );
}

describe("MessageThread — OpenCode 메커니즘", () => {
  it("스트리밍 중에는 프로그레시브 드래프트 버블을 렌더한다 (항목 1)", () => {
    const html = renderThread({
      streamingPreview: { agentId: agent.id, text: "안녕하세요, 지금 답변을" },
    });
    expect(html).toContain("streaming-draft-bubble");
    expect(html).toContain("안녕하세요, 지금 답변을");
    expect(html).toContain("작성 중");
  });

  it("다른 에이전트의 스트림은 현재 채널에 그리지 않는다", () => {
    const html = renderThread({
      streamingPreview: { agentId: "agent_other", text: "다른 채널 스트림" },
    });
    expect(html).not.toContain("다른 채널 스트림");
  });

  it("assistant metadata.toolCalls를 도구 칩으로 렌더한다 (항목 2)", () => {
    const html = renderThread({
      messages: [
        message("m_user", "user"),
        message("m_assistant", "assistant", {
          toolCalls: [
            { id: "t1", tool: "bash", title: "bash: ls src", status: "completed", output: "lib\nruntime" },
            { id: "t2", tool: "write", title: "write: a.ts", status: "denied" },
          ],
        }),
      ],
    });
    expect(html).toContain("bash: ls src");
    expect(html).toContain("완료");
    expect(html).toContain("write: a.ts");
    expect(html).toContain("차단");
  });

  it("onRollbackTurn이 있으면 어시스턴트 턴에 되돌리기 버튼을 단다 (항목 9)", () => {
    const withRollback = renderThread({ onRollbackTurn: () => {} });
    expect(withRollback).toContain("되돌리기");

    const withoutRollback = renderThread();
    expect(withoutRollback).not.toContain("되돌리기");
  });

  it("승인 대기열에 '계열 허용' 버튼을 노출한다 (항목 10)", () => {
    const queueItem: ApprovalQueueItem = {
      id: "approval_1",
      sourceItemId: "item_1",
      summary: "git status --short",
      requestedBy: "agent",
      permissions: ["run_dangerous_commands"],
      state: "required",
      createdAt: "2026-06-11T00:00:00.000Z",
    };
    const html = renderThread({
      workbenchVisibility: { showInlineApprovalQueue: true, showInlineDelegation: false },
      permissionSnapshotQueue: [queueItem],
      onApproveCommandPattern: () => {},
    });
    expect(html).toContain("계열 허용");

    const withoutPattern = renderThread({
      workbenchVisibility: { showInlineApprovalQueue: true, showInlineDelegation: false },
      permissionSnapshotQueue: [queueItem],
    });
    expect(withoutPattern).not.toContain("계열 허용");
  });
});

describe("readMessageToolCalls", () => {
  it("metadata.toolCalls를 방어적으로 파싱한다", () => {
    const parsed = readMessageToolCalls(
      message("m", "assistant", { toolCalls: [{ id: "t1", tool: "bash", title: "x", status: "completed" }, null, "junk"] }),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ id: "t1", tool: "bash" });
    expect(readMessageToolCalls(message("m2", "assistant"))).toEqual([]);
  });
});
