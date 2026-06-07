import { describe, expect, it } from "vitest";
import type { ProviderCompletionResponse } from "@ai-orchestrator/protocol";
import type { PendingProviderRetry, WorkbenchAgent } from "../types";
import { seededAgentProfiles } from "../seeds/agents";
import {
  createProviderReplayConversationMessage,
  createProviderReplayMemoryCandidate,
} from "./providerReplayDelivery";

const agent = {
  ...seededAgentProfiles[0]!,
  id: "agent_orchestrator",
  name: "Orchestrator",
  role: "orchestrator",
  providerProfileId: "provider_mimo_token_openai",
  modelId: "mimo-v2.5-pro",
} satisfies WorkbenchAgent;

const pendingRetry: PendingProviderRetry = {
  permissionItemId: "approval_provider_1",
  sessionId: "session_original",
  providerProfileId: "provider_mimo_token_openai",
  agentId: "agent_orchestrator",
  modelId: "mimo-v2.5-pro",
  content: "네 이름은 뭔데",
  attachments: [],
  attachmentProcessingPlans: [],
  createdAt: "2026-06-05T00:00:01.000Z",
};

const replayResult: ProviderCompletionResponse = {
  id: "provider_completion_response_1",
  requestId: "provider_completion_request_1",
  providerProfileId: "provider_mimo_token_openai",
  modelId: "mimo-v2.5-pro",
  route: "server_proxy",
  status: "succeeded",
  endpoint: "http://dgx-02:4317/api/providers/complete",
  content: "이름은 없다. 역할로 부르면 된다 — Orchestrator.",
  createdAt: "2026-06-05T00:00:02.000Z",
};

describe("createProviderReplayConversationMessage", () => {
  it("승인 후 서버 replay 응답도 선택 에이전트 이름 계약으로 보정한다", () => {
    const message = createProviderReplayConversationMessage({
      approval: { id: "approval_provider_1", sourceItemId: "approval_provider_1" },
      createdAt: "2026-06-05T00:00:03.000Z",
      id: "message_agent_replay_1",
      pending: pendingRetry,
      result: replayResult,
      targetAgent: agent,
    });

    expect(message.content).toContain("마키마");
    expect(message.content).not.toContain("이름은 없다");
    expect(message.metadata?.identityGuardApplied).toBe(true);
    expect(message.metadata?.agentName).toBe("마키마");
    expect(message.metadata?.replayedApprovalId).toBe("approval_provider_1");
  });

  it("승인 후 서버 replay 응답을 에이전트별 장기 기억 후보로 남긴다", () => {
    const message = createProviderReplayConversationMessage({
      approval: { id: "approval_provider_1", sourceItemId: "approval_provider_1" },
      createdAt: "2026-06-05T00:00:03.000Z",
      id: "message_agent_replay_1",
      pending: pendingRetry,
      result: replayResult,
      targetAgent: agent,
    });
    const candidate = createProviderReplayMemoryCandidate({
      assistantMessage: message,
      createdAt: "2026-06-05T00:00:03.000Z",
      memoryScope: {
        namespace: "agent:agent_orchestrator/session:session_original/provider:provider_mimo_token_openai",
        recallTraceId: "recall_agent_orchestrator_session_original_provider_mimo_token_openai",
      },
      pending: pendingRetry,
      targetAgent: agent,
      trustLevel: "limited",
    });

    expect(candidate.record.title).toBe("마키마 대화 기억 후보");
    expect(candidate.record.content).toContain("사용자: 네 이름은 뭔데");
    expect(candidate.record.content).toContain("마키마: 나는 마키마야");
    expect(candidate.record.tags).toEqual(
      expect.arrayContaining([
        "agent:agent_orchestrator",
        "provider:provider_mimo_token_openai",
        "recall:recall_agent_orchestrator_session_original_provider_mimo_token_openai",
      ]),
    );
  });
});
