import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@ai-orchestrator/protocol";
import { createCompletionMemoryRecallMessages } from "./agentCompletionRecall";

function message(id: string, role: ConversationMessage["role"], content: string): ConversationMessage {
  return {
    content,
    createdAt: "2026-06-06T00:00:00.000Z",
    id,
    role,
    sessionId: "session_desktop_001",
  };
}

describe("createCompletionMemoryRecallMessages", () => {
  it("includes the current user turn when building the agent recall query context", () => {
    const previous = [
      message("message_old_user", "user", "이전 맥락"),
      message("message_old_assistant", "assistant", "이전 응답"),
    ];
    const current = message("message_current_user", "user", "방금 물어본 핵심 질문");

    const recallMessages = createCompletionMemoryRecallMessages(previous, current);

    expect(recallMessages.map((item) => item.id)).toEqual([
      "message_old_user",
      "message_old_assistant",
      "message_current_user",
    ]);
  });

  it("does not duplicate the current user turn if the channel already contains it", () => {
    const current = message("message_current_user", "user", "방금 물어본 핵심 질문");

    const recallMessages = createCompletionMemoryRecallMessages([current], current);

    expect(recallMessages.map((item) => item.id)).toEqual(["message_current_user"]);
  });
});
