import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@ai-orchestrator/protocol";
import type { WorkbenchAgent } from "../types";
import { messageLabel } from "./uiLabels";

const orchestrator = {
  id: "agent_orchestrator",
  name: "Orchestrator",
  kind: "virtual",
  role: "orchestrator",
  soulMode: "summary",
  configSource: "internal",
  enabled: true,
  permissionLevel: "read_only",
} as WorkbenchAgent;

function assistantMessage(metadata?: ConversationMessage["metadata"]): ConversationMessage {
  return {
    id: "message_assistant",
    role: "assistant",
    content: "응답",
    createdAt: "2026-06-06T00:00:00.000Z",
    sessionId: "session_test",
    metadata,
  };
}

describe("messageLabel", () => {
  it("uses selected agent Korean character name instead of raw role name", () => {
    expect(messageLabel(assistantMessage(), orchestrator)).toBe("마키마");
  });

  it("resolves metadata agent ids to Korean character names", () => {
    expect(
      messageLabel(
        assistantMessage({ agentId: "agent_orchestrator", agentName: "Orchestrator" }),
        undefined,
        [orchestrator],
      ),
    ).toBe("마키마");
  });
});
