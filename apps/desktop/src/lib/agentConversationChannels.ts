import type { ConversationMessage } from "@ai-orchestrator/protocol";

export type AgentChannelSeed = {
  id: string;
};

export type AgentConversationChannels = Record<string, ConversationMessage[]>;

export type AgentChannelMemoryScope = {
  agentId: string;
  providerProfileId: string;
  sessionId: string;
  namespace: string;
  recallTraceId: string;
};

export function createInitialAgentConversationChannels(
  agents: AgentChannelSeed[],
  seedMessages: ConversationMessage[],
): AgentConversationChannels {
  const defaultAgentId = agents[0]?.id ?? "agent_unassigned";
  return Object.fromEntries(
    agents.map((agent) => [
      agent.id,
      seedMessages.filter((message) => (message.metadata?.agentId ?? defaultAgentId) === agent.id),
    ]),
  );
}

export function getAgentChannelMessages(
  channels: AgentConversationChannels,
  agentId: string,
): ConversationMessage[] {
  return channels[agentId] ?? [];
}

export function appendAgentChannelMessages(
  channels: AgentConversationChannels,
  agentId: string,
  messages: ConversationMessage[],
): AgentConversationChannels {
  return {
    ...channels,
    [agentId]: [...getAgentChannelMessages(channels, agentId), ...messages],
  };
}

export function updateAgentChannelMessages(
  channels: AgentConversationChannels,
  agentId: string,
  updater: ConversationMessage[] | ((messages: ConversationMessage[]) => ConversationMessage[]),
): AgentConversationChannels {
  const currentMessages = getAgentChannelMessages(channels, agentId);
  const nextMessages = typeof updater === "function" ? updater(currentMessages) : updater;
  return {
    ...channels,
    [agentId]: nextMessages,
  };
}

export function createAgentChannelMemoryScope(
  agentId: string,
  sessionId: string,
  providerProfileId: string,
): AgentChannelMemoryScope {
  return {
    agentId,
    providerProfileId,
    sessionId,
    namespace: `agent:${agentId}/session:${sessionId}/provider:${providerProfileId}`,
    recallTraceId: `recall_${agentId}_${sessionId}_${providerProfileId}`,
  };
}

export function createAgentChannelRecallQuery(scope: AgentChannelMemoryScope, goal: string): string {
  return [
    goal.trim() || "agent channel memory recall",
    `agent:${scope.agentId}`,
    `session:${scope.sessionId}`,
    `provider:${scope.providerProfileId}`,
  ].join("\n");
}
