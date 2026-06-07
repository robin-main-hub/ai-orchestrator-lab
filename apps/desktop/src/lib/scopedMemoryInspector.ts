import type {
  CodingPacket,
  ConversationMessage,
  EventEnvelope,
  MemoryRecord,
  ProviderProfile,
} from "@ai-orchestrator/protocol";
import {
  createStage6MemoryInspector,
  type Stage6MemoryInspector,
} from "../runtime/stage6Memory";
import type { AgentChannelMemoryScope } from "./agentConversationChannels";
import { createMemoryControllerScopeKey } from "./memoryControllerScope";

export type ResolveScopedMemoryInspectorInput = {
  currentInspector: Stage6MemoryInspector;
  currentScope?: AgentChannelMemoryScope;
  targetScope: AgentChannelMemoryScope;
  recallRecords: (scope: AgentChannelMemoryScope) => Promise<MemoryRecord[]>;
  messages: ConversationMessage[];
  packet: CodingPacket;
  events: EventEnvelope[];
  provider?: ProviderProfile;
  createdAt: string;
};

export async function resolveScopedMemoryInspector({
  currentInspector,
  currentScope,
  targetScope,
  recallRecords,
  messages,
  packet,
  events,
  provider,
  createdAt,
}: ResolveScopedMemoryInspectorInput): Promise<Stage6MemoryInspector> {
  if (
    currentScope &&
    createMemoryControllerScopeKey(currentScope) === createMemoryControllerScopeKey(targetScope)
  ) {
    return currentInspector;
  }

  const records = await recallRecords(targetScope);
  return createStage6MemoryInspector({
    records,
    messages,
    packet,
    events,
    provider,
    sessionId: targetScope.sessionId,
    createdAt,
  });
}
