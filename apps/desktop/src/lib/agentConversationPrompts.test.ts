import { describe, expect, it } from "vitest";
import { createAgentConversationPromptSuggestions } from "./agentConversationPrompts";

describe("createAgentConversationPromptSuggestions", () => {
  it("에이전트 답변이 아직 없으면 바로 물어보기 제안을 만들지 않는다", () => {
    expect(
      createAgentConversationPromptSuggestions({
        activity: "idle",
        displayName: "마키마",
        memoryRecordCount: 4,
        messageCount: 2,
        pendingApprovalCount: 1,
        role: "orchestrator",
      }),
    ).toEqual([]);
  });

  it("마지막 답변 맥락을 기준으로 후속 질문을 만든다", () => {
    expect(
      createAgentConversationPromptSuggestions({
        activity: "idle",
        displayName: "마키마",
        lastAssistantMessageContent: "MiMo Token Plan 직접 경로로 이어서 응답했고 원래 서버 프록시는 DGX 복구 뒤 복귀할 수 있어.",
        memoryRecordCount: 4,
        messageCount: 2,
        pendingApprovalCount: 1,
        role: "orchestrator",
      }),
    ).toEqual([
      "마키마, 방금 답변 기준으로 다음 큰 바위와 즉시 할 일을 분리해줘.",
      "마키마, 승인 대기 1건을 먼저 처리해야 하는지 판단해줘.",
      "마키마, 지난 기억 4개를 참고해서 이어서 할 일을 제안해줘.",
    ]);
  });

  it("실행자는 명령과 승인 경계를 먼저 묻도록 제안한다", () => {
    const suggestions = createAgentConversationPromptSuggestions({
      activity: "waiting_approval",
      displayName: "렘",
      lastAssistantMessageContent: "터미널 실행 전 승인과 되돌림 계획이 필요합니다.",
      memoryRecordCount: 0,
      messageCount: 0,
      pendingApprovalCount: 2,
      role: "executor",
    });

    expect(suggestions[0]).toBe("렘, 방금 답변 기준으로 지금 승인해야 할 항목과 미뤄도 되는 항목을 나눠줘.");
    expect(suggestions).toContain("렘, 승인 대기 2건을 먼저 처리해야 하는지 판단해줘.");
  });
});
