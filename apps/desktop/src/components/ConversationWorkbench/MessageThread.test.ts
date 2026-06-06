import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@ai-orchestrator/protocol";
import {
  assistantPendingLabel,
  shouldShowAssistantPendingBubble,
} from "./MessageThread";

function message(role: ConversationMessage["role"]): ConversationMessage {
  return {
    id: `message_${role}`,
    role,
    content: role,
    createdAt: "2026-06-06T00:00:00.000Z",
    sessionId: "session_test",
  };
}

describe("MessageThread pending assistant state", () => {
  it("shows a pending assistant bubble after a user message while the selected agent is preparing or responding", () => {
    expect(shouldShowAssistantPendingBubble([message("user")], "preparing")).toBe(true);
    expect(shouldShowAssistantPendingBubble([message("user")], "responding")).toBe(true);
  });

  it("does not show a pending assistant bubble after an assistant message or while idle", () => {
    expect(shouldShowAssistantPendingBubble([message("assistant")], "preparing")).toBe(false);
    expect(shouldShowAssistantPendingBubble([message("user")], "idle")).toBe(false);
    expect(shouldShowAssistantPendingBubble([], "responding")).toBe(false);
  });

  it("uses Korean status copy for the visible waiting state", () => {
    expect(assistantPendingLabel("preparing")).toBe("생각을 정리하고 있어요");
    expect(assistantPendingLabel("responding")).toBe("답변을 정리하고 있어요");
  });
});
