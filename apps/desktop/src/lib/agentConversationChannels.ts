import type { ConversationMessage } from "@ai-orchestrator/protocol";

export type AgentChannelSeed = {
  id: string;
};

export type AgentConversationChannels = Record<string, ConversationMessage[]>;

export type AgentChannelMemoryScope = {
  agentId: string;
  providerProfileId: string;
  roomId?: string;
  roomLabel?: string;
  sessionId: string;
  namespace: string;
  recallTraceId: string;
};

export type AgentChannelMemoryInstallAudit = {
  totalAgents: number;
  installedCount: number;
  missingAgentIds: string[];
  duplicateNamespaceAgentIds: string[];
  duplicateRecallTraceAgentIds: string[];
  scopes: AgentChannelMemoryScope[];
};

export type AgentCompletionContextInput = {
  agent: {
    id: string;
    providerProfileId?: string;
  };
  channels: AgentConversationChannels;
  fallbackProviderProfileId: string;
  sessionId: string;
};

export type AgentCompletionContext = {
  memoryScope: AgentChannelMemoryScope;
  previousMessages: ConversationMessage[];
};

export function createInitialAgentConversationChannels(
  agents: AgentChannelSeed[],
  seedMessages: ConversationMessage[],
): AgentConversationChannels {
  return Object.fromEntries(
    agents.map((agent) => [
      agent.id,
      seedMessages.filter((message) => message.metadata?.agentId === agent.id),
    ]),
  );
}

export function getAgentChannelMessages(
  channels: AgentConversationChannels,
  agentId: string,
): ConversationMessage[] {
  return channels[agentId] ?? [];
}

/**
 * Merges replayed/cached messages back into existing per-agent channels while
 * preserving agent isolation: each message is routed into its own agent's
 * channel by `metadata.agentId`, not dumped into a single (currently selected)
 * channel. `mergeMessages` is injected (the replay layer owns dedupe/sort) to
 * keep this module free of runtime dependencies.
 *
 * Messages whose `agentId` matches no known agent are dropped, matching the
 * behavior of `createInitialAgentConversationChannels`.
 */
export function distributeReplayedMessagesIntoChannels(
  channels: AgentConversationChannels,
  agents: AgentChannelSeed[],
  replayedMessages: ConversationMessage[],
  mergeMessages: (
    existing: ConversationMessage[],
    incoming: ConversationMessage[],
  ) => ConversationMessage[],
): AgentConversationChannels {
  const next: AgentConversationChannels = { ...channels };
  for (const agent of agents) {
    const incoming = replayedMessages.filter((message) => message.metadata?.agentId === agent.id);
    next[agent.id] = mergeMessages(getAgentChannelMessages(channels, agent.id), incoming);
  }
  return next;
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
  const safeAgentId = sanitizeMemoryScopePart(agentId);
  const safeSessionId = sanitizeMemoryScopePart(sessionId);
  const safeProviderProfileId = sanitizeMemoryScopePart(providerProfileId);

  return {
    agentId: safeAgentId,
    providerProfileId: safeProviderProfileId,
    roomId: `room_${safeSessionId}_${safeAgentId}`,
    roomLabel: "에이전트 전용 방",
    sessionId: safeSessionId,
    namespace: `agent:${safeAgentId}/session:${safeSessionId}/provider:${safeProviderProfileId}`,
    recallTraceId: `recall_${safeAgentId}_${safeSessionId}_${safeProviderProfileId}`,
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

export function resolveAgentCompletionContext({
  agent,
  channels,
  fallbackProviderProfileId,
  sessionId,
}: AgentCompletionContextInput): AgentCompletionContext {
  const providerProfileId = agent.providerProfileId ?? fallbackProviderProfileId;
  return {
    memoryScope: createAgentChannelMemoryScope(agent.id || "agent_unassigned", sessionId, providerProfileId),
    previousMessages: getAgentChannelMessages(channels, agent.id),
  };
}

export function createAgentChannelMemoryInstallAudit(
  agents: AgentChannelSeed[],
  sessionId: string,
  providerProfileId: string,
): AgentChannelMemoryInstallAudit {
  const scopes = agents
    .filter((agent) => agent.id.trim().length > 0)
    .map((agent) => createAgentChannelMemoryScope(agent.id, sessionId, providerProfileId));
  const namespaceCounts = countBy(scopes, (scope) => scope.namespace);
  const recallTraceCounts = countBy(scopes, (scope) => scope.recallTraceId);
  const duplicateNamespaceAgentIds = scopes
    .filter((scope) => (namespaceCounts.get(scope.namespace) ?? 0) > 1)
    .map((scope) => scope.agentId);
  const duplicateRecallTraceAgentIds = scopes
    .filter((scope) => (recallTraceCounts.get(scope.recallTraceId) ?? 0) > 1)
    .map((scope) => scope.agentId);
  const missingAgentIds = agents
    .filter((agent) => agent.id.trim().length === 0)
    .map((agent) => agent.id);

  return {
    totalAgents: agents.length,
    installedCount: scopes.length - new Set([...duplicateNamespaceAgentIds, ...duplicateRecallTraceAgentIds]).size,
    missingAgentIds,
    duplicateNamespaceAgentIds,
    duplicateRecallTraceAgentIds,
    scopes,
  };
}

export function createAgentChannelMemoryInstallSummary(audit: AgentChannelMemoryInstallAudit): string {
  if (
    audit.missingAgentIds.length === 0 &&
    audit.duplicateNamespaceAgentIds.length === 0 &&
    audit.duplicateRecallTraceAgentIds.length === 0 &&
    audit.installedCount === audit.totalAgents
  ) {
    return `전원 기억 설치 완료 · ${audit.installedCount}/${audit.totalAgents}`;
  }
  return `기억 설치 확인 필요 · ${audit.installedCount}/${audit.totalAgents}`;
}

function sanitizeMemoryScopePart(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'`<>)]+/gi, "redacted_url")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, "Bearer redacted_token")
    .replace(/sk-[A-Za-z0-9_-]{8,}/gi, "redacted_key")
    .replace(/tp-[A-Za-z0-9_-]{8,}/gi, "redacted_token")
    .replace(/\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|KEY))\s*=\s*[^\s"'`<>)]+/gi, "$1=redacted")
    .replace(/\/Users\/[^\s"'`<>)]+/g, "redacted_path")
    .trim()
    .replace(/\s+/g, "_");
}

function countBy<T>(items: T[], getKey: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
