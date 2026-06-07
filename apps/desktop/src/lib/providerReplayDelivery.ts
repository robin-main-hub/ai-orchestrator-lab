import type { ConversationMessage, ProviderCompletionResponse, SourceTrust } from "@ai-orchestrator/protocol";
import type { PendingProviderRetry, WorkbenchAgent } from "../types";
import { applyAgentIdentityResponseGuard } from "./agentIdentityResponseGuard";
import { agentPrimaryDisplayName } from "./agentDisplay";
import {
  createConversationTurnMemoryCandidate,
  type MemoryCuratorLedgerEntry,
} from "./memoryCuratorRuntime";

export type ProviderReplayDeliveryApproval = {
  id: string;
  sourceItemId?: string;
};

export type CreateProviderReplayConversationMessageInput = {
  approval: ProviderReplayDeliveryApproval;
  createdAt: string;
  id: string;
  pending: PendingProviderRetry;
  result: ProviderCompletionResponse;
  targetAgent?: WorkbenchAgent;
};

export type ProviderReplayMemoryScope = {
  namespace?: string;
  recallTraceId?: string;
};

export type CreateProviderReplayMemoryCandidateInput = {
  assistantMessage: ConversationMessage;
  createdAt: string;
  memoryScope?: ProviderReplayMemoryScope;
  pending: PendingProviderRetry;
  targetAgent?: WorkbenchAgent;
  trustLevel?: SourceTrust;
};

export function createProviderReplayConversationMessage({
  approval,
  createdAt,
  id,
  pending,
  result,
  targetAgent,
}: CreateProviderReplayConversationMessageInput): ConversationMessage {
  const replayedContent = result.content?.trim() ?? "";
  const guardedReply = targetAgent
    ? applyAgentIdentityResponseGuard({
        agent: targetAgent,
        content: replayedContent,
        userContent: pending.content,
      })
    : { content: replayedContent, guardApplied: false };

  return {
    id,
    sessionId: pending.sessionId,
    role: "assistant",
    content: guardedReply.content,
    createdAt,
    metadata: {
      agentId: pending.agentId,
      agentName: targetAgent?.name,
      providerProfileId: result.providerProfileId,
      modelId: result.modelId,
      endpoint: result.endpoint,
      route: result.route,
      usage: result.usage,
      realProviderCall: true,
      replayedApprovalId: approval.id,
      replayedSourceItemId: approval.sourceItemId,
      attachmentCount: pending.attachments.length,
      identityGuardApplied: guardedReply.guardApplied,
      ...(pending.attachmentProcessingPlans.length > 0
        ? { attachmentProcessingPlans: pending.attachmentProcessingPlans }
        : {}),
    },
  };
}

export function createProviderReplayMemoryCandidate({
  assistantMessage,
  createdAt,
  memoryScope,
  pending,
  targetAgent,
  trustLevel = "limited",
}: CreateProviderReplayMemoryCandidateInput): MemoryCuratorLedgerEntry["candidate"] {
  const agentName = targetAgent ? agentPrimaryDisplayName(targetAgent) : pending.agentId;
  return createConversationTurnMemoryCandidate({
    agentId: pending.agentId,
    agentName,
    assistantMessage,
    attachmentProcessingPlans: pending.attachmentProcessingPlans,
    createdAt,
    memoryScopeNamespace: memoryScope?.namespace,
    providerProfileId: pending.providerProfileId,
    recallTraceId: memoryScope?.recallTraceId,
    trustLevel,
    userMessage: {
      id: `message_user_pending_${pending.permissionItemId}`,
      sessionId: pending.sessionId,
      role: "user",
      content: pending.content,
      createdAt: pending.createdAt,
    },
  });
}
