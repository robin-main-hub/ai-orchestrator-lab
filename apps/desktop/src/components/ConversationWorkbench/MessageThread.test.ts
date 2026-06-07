import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@ai-orchestrator/protocol";
import {
  assistantPendingLabel,
  resolveAssistantMessageStatusSummary,
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

  it("keeps provider failure status visible on assistant messages without leaking raw URLs", () => {
    const summary = resolveAssistantMessageStatusSummary({
      ...message("assistant"),
      metadata: {
        error: "http://dgx-02:4317: Failed to fetch",
        realProviderCall: false,
      },
    });

    expect(summary).toEqual({
      detail: "[redacted:url] Failed to fetch",
      label: "호출 실패",
      variant: "danger",
    });
  });

  it("keeps provider approval status visible on assistant messages", () => {
    const summary = resolveAssistantMessageStatusSummary({
      ...message("assistant"),
      metadata: {
        providerProfileId: "provider_mimo_token_openai",
        requiresServerApproval: true,
      },
    });

    expect(summary).toEqual({
      detail: "승인 후 같은 요청을 이어 붙일 수 있습니다.",
      label: "승인 필요",
      variant: "warning",
    });
  });
});
