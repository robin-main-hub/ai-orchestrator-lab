import type { ConversationMessage, SourceTrust, MemoryRecord } from "@ai-orchestrator/protocol";
import {
  createMemoryCuratorCandidate,
  type MemoryCuratorCandidate,
} from "./memoryCuratorApproval";

export type MemoryCuratorPersistencePlan = {
  activateRecordIds: string[];
  changedRecordIds: string[];
  forgetRecordIds: string[];
  quarantineRecordIds: string[];
};

export type ConversationTurnMemoryCandidateInput = {
  agentId: string;
  agentName: string;
  assistantMessage: Pick<ConversationMessage, "content" | "createdAt" | "id" | "role" | "sessionId">;
  createdAt: string;
  memoryScopeNamespace?: string;
  projectId?: string;
  providerProfileId?: string;
  recallTraceId?: string;
  trustLevel?: SourceTrust;
  userMessage: Pick<ConversationMessage, "content" | "createdAt" | "id" | "role" | "sessionId">;
};

const defaultProjectId = "project_ai_orchestrator_lab";

export function createMemoryCuratorPersistencePlan(
  beforeRecords: MemoryRecord[],
  afterRecords: MemoryRecord[],
): MemoryCuratorPersistencePlan {
  const beforeById = new Map(beforeRecords.map((record) => [record.id, record]));
  const activateRecordIds: string[] = [];
  const changedRecordIds: string[] = [];
  const forgetRecordIds: string[] = [];
  const quarantineRecordIds: string[] = [];

  for (const after of afterRecords) {
    const before = beforeById.get(after.id);
    if (!before) continue;

    const becameTombstoned = !before.tombstonedAt && Boolean(after.tombstonedAt);
    const activationChanged = before.activationState !== after.activationState;
    const updated = before.updatedAt !== after.updatedAt;

    if (becameTombstoned) {
      forgetRecordIds.push(after.id);
    }
    if (after.activationState === "active" && before.activationState !== "active" && !after.tombstonedAt) {
      activateRecordIds.push(after.id);
    }
    if (after.activationState === "quarantined" && before.activationState !== "quarantined" && !after.tombstonedAt) {
      quarantineRecordIds.push(after.id);
    }
    if (becameTombstoned || activationChanged || updated) {
      changedRecordIds.push(after.id);
    }
  }

  return {
    activateRecordIds,
    changedRecordIds,
    forgetRecordIds,
    quarantineRecordIds,
  };
}

export function createConversationTurnMemoryCandidate({
  agentId,
  agentName,
  assistantMessage,
  createdAt,
  memoryScopeNamespace,
  projectId = defaultProjectId,
  providerProfileId,
  recallTraceId,
  trustLevel = "limited",
  userMessage,
}: ConversationTurnMemoryCandidateInput): MemoryCuratorCandidate {
  const record: MemoryRecord = {
    id: `memory_conversation_turn_${stableId(`${agentId}:${userMessage.id}:${assistantMessage.id}`)}`,
    activationState: "suggested",
    content: compactMemoryText(`사용자: ${userMessage.content}\n${agentName}: ${assistantMessage.content}`),
    createdAt,
    entityReinforcement: 0,
    importance: 0.55,
    kind: "workflow",
    keywords: uniqueWords(`${userMessage.content} ${assistantMessage.content} ${agentName}`).slice(0, 12),
    layer: "episode",
    losslessRestatement: compactMemoryText(
      `${createdAt} ${agentName} 대화에서 사용자는 ${userMessage.content} 라고 말했고 에이전트는 ${assistantMessage.content} 라고 답했다.`,
    ),
    pinned: false,
    projectId,
    scope: "session",
    sessionId: userMessage.sessionId,
    sourceChannel: "agent",
    tags: [
      "conversation",
      "curator-candidate",
      `agent:${agentId}`,
      providerProfileId ? `provider:${providerProfileId}` : undefined,
      recallTraceId ? `recall:${recallTraceId}` : undefined,
      memoryScopeNamespace ? `scope:${memoryScopeNamespace}` : undefined,
    ].filter((value): value is string => Boolean(value)),
    title: `${agentName} 대화 기억 후보`,
    topic: "Agent conversation continuity",
    trustLevel,
  };

  return createMemoryCuratorCandidate({
    agentId,
    createdAt,
    reason: "에이전트별 대화 연속성 유지",
    record,
  });
}

function compactMemoryText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 900);
}

function uniqueWords(value: string): string[] {
  const seen = new Set<string>();
  const words = value
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
  for (const word of words) {
    seen.add(word);
  }
  return Array.from(seen);
}

function stableId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
