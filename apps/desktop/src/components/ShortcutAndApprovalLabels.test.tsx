import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ApprovalQueueItem, ConversationMessage } from "@ai-orchestrator/protocol";
import { SHORTCUTS } from "./CheatSheetOverlay";
import { InboxApprovalStrip } from "./ConversationWorkbench/ApprovalQueue";
import { MessageThread } from "./ConversationWorkbench/MessageThread";
import type { WorkbenchAgent } from "../types";

const approval: ApprovalQueueItem = {
  action: "terminal_run",
  createdAt: "2026-06-06T00:00:00.000Z",
  id: "approval_1",
  permissions: ["run_dangerous_commands"],
  reason: "위험 명령 실행 전 확인",
  requestedBy: "agent",
  sourceItemId: "terminal_run_1",
  sourceTrust: "trusted",
  state: "required",
  summary: "터미널 실행 전 승인이 필요합니다.",
};

const agent: WorkbenchAgent = {
  configSource: "internal",
  enabled: true,
  id: "agent_orchestrator",
  kind: "virtual",
  name: "마키마",
  permissionLevel: "read_only",
  role: "orchestrator",
  soulMode: "summary",
};

const messages: ConversationMessage[] = [
  {
    content: "상태 확인",
    createdAt: "2026-06-06T00:00:00.000Z",
    id: "message_1",
    role: "user",
    sessionId: "session_desktop_001",
  },
];

describe("shortcut and approval labels", () => {
  it("uses Korean-only visible labels in the shortcut overlay", () => {
    const labels = SHORTCUTS.map((shortcut) => shortcut.label).join("\n");

    expect(labels).toContain("대화 모드 전환");
    expect(labels).toContain("토론 모드 전환");
    expect(labels).toContain("작업 대기열 열기 / 닫기");
    expect(labels).toContain("오버레이 닫기 / 포커스 복원");
    expect(labels).not.toContain("Conversation 모드 전환");
    expect(labels).not.toContain("Debate 모드 전환");
    expect(labels).not.toContain("Control Queue");
    expect(labels).not.toContain("focus reset");
  });

  it("uses Korean labels in the conversation approval strips", () => {
    const html = renderToStaticMarkup(
      <>
        <InboxApprovalStrip queue={[approval]} />
        <MessageThread
          agentChatContinuity={{
            detail: "기억이 연결되어 있습니다.",
            memoryQualityLabel: "기억 양호",
            memoryQualityTone: "ready",
            placeholder: "마키마에게 말 걸기",
            title: "마키마와 이어서 대화",
          }}
          agentActivityById={{}}
          agentVisualsById={{}}
          agents={[agent]}
          messages={messages}
          onApprovePermission={vi.fn()}
          onRejectPermission={vi.fn()}
          pendingProviderRetry={undefined}
          permissionSnapshotQueue={[approval]}
          selectedAgent={agent}
          workbenchVisibility={{ showInlineApprovalQueue: true, showInlineDelegation: false }}
        />
      </>,
    );

    expect(html).toContain("어시스턴트 수신함");
    expect(html).toContain("작업 1건 / 대기 1건");
    expect(html).toContain("1건 대기");
    expect(html).not.toContain("Assistant Inbox");
    expect(html).not.toContain("tasks");
    expect(html).not.toContain("pending");
  });
});
