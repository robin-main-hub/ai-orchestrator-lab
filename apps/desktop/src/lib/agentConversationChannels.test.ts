import type { ConversationMessage } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import {
  appendAgentChannelMessages,
  createAgentChannelMemoryScope,
  createInitialAgentConversationChannels,
  getAgentChannelMessages,
} from "./agentConversationChannels";

const agents = [
  { id: "agent_orchestrator" },
  { id: "agent_reviewer" },
  { id: "agent_executor" },
];

const seedMessages: ConversationMessage[] = [
  {
    id: "message_user",
    sessionId: "session_a",
    role: "user",
    content: "첫 질문",
    createdAt: "2026-06-05T00:00:00.000Z",
  },
  {
    id: "message_assistant",
    sessionId: "session_a",
    role: "assistant",
    content: "첫 답변",
    createdAt: "2026-06-05T00:00:01.000Z",
    metadata: {
      agentId: "agent_orchestrator",
    },
  },
];

describe("agentConversationChannels", () => {
  it("creates an isolated channel for every agent and assigns seed messages to the default agent", () => {
    const channels = createInitialAgentConversationChannels(agents, seedMessages);

    expect(getAgentChannelMessages(channels, "agent_orchestrator")).toHaveLength(2);
    expect(getAgentChannelMessages(channels, "agent_reviewer")).toEqual([]);
    expect(getAgentChannelMessages(channels, "agent_executor")).toEqual([]);
  });

  it("appends messages only to the selected agent channel", () => {
    const channels = createInitialAgentConversationChannels(agents, seedMessages);
    const nextMessage: ConversationMessage = {
      id: "message_reviewer",
      sessionId: "session_a",
      role: "user",
      content: "리뷰어에게만 묻기",
      createdAt: "2026-06-05T00:00:02.000Z",
    };

    const nextChannels = appendAgentChannelMessages(channels, "agent_reviewer", [nextMessage]);

    expect(getAgentChannelMessages(nextChannels, "agent_orchestrator")).toHaveLength(2);
    expect(getAgentChannelMessages(nextChannels, "agent_reviewer")).toEqual([nextMessage]);
  });

  it("creates stable memory scopes per agent and session", () => {
    expect(createAgentChannelMemoryScope("agent_reviewer", "session_a", "provider_mimo_token_openai")).toEqual({
      agentId: "agent_reviewer",
      providerProfileId: "provider_mimo_token_openai",
      sessionId: "session_a",
      namespace: "agent:agent_reviewer/session:session_a/provider:provider_mimo_token_openai",
      recallTraceId: "recall_agent_reviewer_session_a_provider_mimo_token_openai",
    });
  });
});
