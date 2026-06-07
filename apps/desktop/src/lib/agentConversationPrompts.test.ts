import { describe, expect, it } from "vitest";
import { createAgentConversationPromptSuggestions } from "./agentConversationPrompts";

describe("createAgentConversationPromptSuggestions", () => {
  it("역할과 현재 상태에 맞는 대화 시작 제안을 만든다", () => {
    expect(
      createAgentConversationPromptSuggestions({
        activity: "idle",
        displayName: "마키마",
        memoryRecordCount: 4,
        messageCount: 2,
        pendingApprovalCount: 1,
        role: "orchestrator",
      }),
    ).toEqual([
      "마키마, 지금 막힌 일과 다음 큰 바위부터 순서대로 정리해줘.",
      "마키마, 승인 대기 1건을 먼저 처리해야 하는지 판단해줘.",
      "마키마, 지난 기억 4개를 참고해서 이어서 할 일을 제안해줘.",
    ]);
  });

  it("실행자는 명령과 승인 경계를 먼저 묻도록 제안한다", () => {
    const suggestions = createAgentConversationPromptSuggestions({
      activity: "waiting_approval",
      displayName: "렘",
      memoryRecordCount: 0,
      messageCount: 0,
      pendingApprovalCount: 2,
      role: "executor",
    });

    expect(suggestions[0]).toBe("렘, 지금 실행할 명령과 승인 경계를 먼저 보여줘.");
    expect(suggestions).toContain("렘, 승인 대기 2건을 먼저 처리해야 하는지 판단해줘.");
  });
});
