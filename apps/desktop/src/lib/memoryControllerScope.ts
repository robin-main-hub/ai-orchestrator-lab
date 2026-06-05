import type { AgentChannelMemoryScope } from "./agentConversationChannels";

const defaultMemoryScopeKey = "session_desktop_001";

export function createMemoryControllerScopeKey(memoryScope?: AgentChannelMemoryScope): string {
  return memoryScope?.namespace ?? defaultMemoryScopeKey;
}

export function canCommitMemoryScopeResult({
  currentScopeKey,
  expectedScopeKey,
}: {
  currentScopeKey: string;
  expectedScopeKey: string;
}): boolean {
  return currentScopeKey === expectedScopeKey;
}
