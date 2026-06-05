import { describe, expect, it } from "vitest";
import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";
import {
  createControlQueueAskItem,
  createControlQueueBlockItem,
  createControlQueueDelegateHandoff,
  createControlQueueEditDraft,
} from "./controlQueueWorkItems";

const baseApproval: ApprovalQueueItem = {
  id: "approval_terminal_1",
  sourceItemId: "terminal_run_1",
  summary: "터미널 실행 전 운영자 승인이 필요합니다.",
  requestedBy: "agent",
  action: "terminal_run",
  reason: "위험한 명령 실행 전 확인 필요",
  sourceTrust: "trusted",
  permissions: ["run_dangerous_commands", "remote_workspace"],
  state: "required",
  createdAt: "2026-06-05T08:00:00.000Z",
};

const unsafeApproval: ApprovalQueueItem = {
  ...baseApproval,
  sourceItemId: "terminal_run_unsafe",
  summary:
    "tool input {\"command\":\"deploy\"} Bearer abc123 https://internal.example.test /Users/robin/project sk-live-secret",
  reason: "API_KEY=value tp-slmvllbti6z4gmjnj5srk2r9nqdbhj5hteonqwswxks2o6ge",
};

describe("controlQueueWorkItems", () => {
  it("ask 버튼은 누락 정보가 있는 질문 lane WorkItem을 만든다", () => {
    const item = createControlQueueAskItem(baseApproval, {
      createdAt: "2026-06-05T08:01:00.000Z",
      sessionId: "session_main",
    });

    expect(item.lane).toBe("ask");
    expect(item.status).toBe("waiting_input");
    expect(item.surface).toBe("conversation");
    expect(item.missingInfo).toEqual([
      expect.objectContaining({
        label: "운영자 보충 답변",
        required: true,
        status: "missing",
      }),
    ]);
    expect(item.evidenceRefs[0]).toEqual(
      expect.objectContaining({
        reference: "permission://terminal_run_1",
      }),
    );
  });

  it("edit 버튼은 수정 초안과 검토 lane WorkItem을 함께 만든다", () => {
    const { draft, workItem } = createControlQueueEditDraft(baseApproval, {
      createdAt: "2026-06-05T08:02:00.000Z",
      sessionId: "session_main",
    });

    expect(workItem.lane).toBe("check");
    expect(workItem.status).toBe("drafted");
    expect(draft.workItemId).toBe(workItem.id);
    expect(draft.status).toBe("draft");
    expect(draft.targetSurface).toBe("conversation");
    expect(draft.body).toContain(baseApproval.summary);
  });

  it("delegate 버튼은 실행 슬롯 handoff와 승인 lane WorkItem을 만든다", () => {
    const { handoff, workItem } = createControlQueueDelegateHandoff(baseApproval, {
      createdAt: "2026-06-05T08:03:00.000Z",
      sessionId: "session_main",
    });

    expect(workItem.lane).toBe("approve");
    expect(workItem.status).toBe("waiting_approval");
    expect(handoff.workItemId).toBe(workItem.id);
    expect(handoff.targetSurface).toBe("execution_slot");
    expect(handoff.approvalState).toBe("required");
    expect(handoff.missingInfo).toHaveLength(0);
  });

  it("block 버튼은 실행 슬롯에 차단 lane WorkItem을 남긴다", () => {
    const item = createControlQueueBlockItem(baseApproval, {
      createdAt: "2026-06-05T08:04:00.000Z",
      sessionId: "session_main",
    });

    expect(item.lane).toBe("blocked");
    expect(item.status).toBe("blocked");
    expect(item.surface).toBe("execution_slot");
    expect(item.priority).toBe("high");
    expect(item.title).toContain("차단됨");
    expect(item.evidenceRefs[0]?.reference).toBe("permission://terminal_run_1");
  });

  it("WorkItem과 draft에 원문 tool input, token, URL, local path를 저장하지 않는다", () => {
    const askItem = createControlQueueAskItem(unsafeApproval, {
      createdAt: "2026-06-05T08:05:00.000Z",
      sessionId: "session_main",
    });
    const { draft, workItem } = createControlQueueEditDraft(unsafeApproval, {
      createdAt: "2026-06-05T08:06:00.000Z",
      sessionId: "session_main",
    });

    const combined = [
      askItem.title,
      askItem.summary,
      askItem.evidenceRefs[0]?.summary,
      workItem.title,
      workItem.summary,
      draft.body,
    ].join("\n");

    expect(combined).toContain("도구 입력 [redacted]");
    expect(combined).not.toContain("Bearer abc123");
    expect(combined).not.toContain("https://internal.example.test");
    expect(combined).not.toContain("/Users/robin");
    expect(combined).not.toContain("sk-live-secret");
    expect(combined).not.toContain("tp-slmvllbti");
    expect(combined).not.toContain("API_KEY=value");
  });
});
