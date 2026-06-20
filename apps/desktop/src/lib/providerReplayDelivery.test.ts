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

// Characterization tests for the previously-uncovered no-targetAgent (unguarded)
// path, content coercion/trim, conditional attachmentProcessingPlans metadata,
// and the memory-candidate agentId fallback (no behavior change). The existing
// suite exercises only the WITH-targetAgent happy path; these pin: that without
// a targetAgent the replayed content is left unguarded and agentName/guard flag
// reflect that, that a missing provider content coerces to "" and surrounding
// whitespace is trimmed, that attachmentProcessingPlans appear in metadata only
// when present while an approval without sourceItemId passes undefined through,
// and that the memory candidate falls back to pending.agentId as the speaker and
// omits scope/recall tags when no memoryScope is supplied. All pure, no network.
describe("providerReplayDelivery — unguarded path, coercion & memory-fallback characterization", () => {
  const baseInput = {
    approval: { id: "approval_provider_1", sourceItemId: "approval_provider_1" },
    createdAt: "2026-06-05T00:00:03.000Z",
    id: "message_agent_replay_1",
    pending: pendingRetry,
    result: replayResult,
  };

  it("leaves the replayed content unguarded and records no agent name without a targetAgent", () => {
    const message = createProviderReplayConversationMessage({ ...baseInput });

    expect(message.content).toBe("이름은 없다. 역할로 부르면 된다 — Orchestrator.");
    expect(message.metadata?.identityGuardApplied).toBe(false);
    expect(message.metadata?.agentName).toBeUndefined();
    expect(message.metadata?.agentId).toBe("agent_orchestrator");
    expect(message.metadata?.providerProfileId).toBe("provider_mimo_token_openai");
    expect(message.metadata?.endpoint).toBe("http://dgx-02:4317/api/providers/complete");
    expect(message.metadata?.route).toBe("server_proxy");
    expect(message.metadata?.realProviderCall).toBe(true);
    expect(message.metadata?.attachmentCount).toBe(0);
  });

  it("coerces a missing provider content to an empty string", () => {
    const message = createProviderReplayConversationMessage({
      ...baseInput,
      result: { ...replayResult, content: undefined },
    });
    expect(message.content).toBe("");
  });

  it("trims surrounding whitespace from the replayed content", () => {
    const message = createProviderReplayConversationMessage({
      ...baseInput,
      result: { ...replayResult, content: "  공백 응답  " },
    });
    expect(message.content).toBe("공백 응답");
  });

  it("includes attachmentProcessingPlans in metadata only when present and passes an absent sourceItemId through", () => {
    const plans = [
      {
        kind: "image" as const,
        name: "screen.png",
        processingMode: "vision_candidate" as const,
        size: 120_000,
        status: "accepted" as const,
        storage: "metadata_only" as const,
      },
    ];
    const withPlans = createProviderReplayConversationMessage({
      ...baseInput,
      approval: { id: "approval_provider_2" },
      pending: { ...pendingRetry, attachmentProcessingPlans: plans },
    });
    expect(withPlans.metadata?.attachmentProcessingPlans).toEqual(plans);
    expect(withPlans.metadata?.replayedSourceItemId).toBeUndefined();

    const withoutPlans = createProviderReplayConversationMessage({ ...baseInput });
    expect(withoutPlans.metadata?.attachmentProcessingPlans).toBeUndefined();
  });

  it("falls back to the pending agentId as the speaker when no targetAgent is given", () => {
    const message = createProviderReplayConversationMessage({ ...baseInput });
    const candidate = createProviderReplayMemoryCandidate({
      assistantMessage: message,
      createdAt: "2026-06-05T00:00:03.000Z",
      pending: pendingRetry,
    });

    expect(candidate.record.title).toBe("agent_orchestrator 대화 기억 후보");
    expect(candidate.record.content).toContain("agent_orchestrator: 이름은 없다");
    expect(candidate.record.trustLevel).toBe("limited");
  });

  it("omits scope/recall tags when no memoryScope is supplied", () => {
    const message = createProviderReplayConversationMessage({ ...baseInput });
    const candidate = createProviderReplayMemoryCandidate({
      assistantMessage: message,
      createdAt: "2026-06-05T00:00:03.000Z",
      pending: pendingRetry,
    });

    expect(candidate.record.tags).toEqual(
      expect.arrayContaining(["agent:agent_orchestrator", "provider:provider_mimo_token_openai"]),
    );
    expect((candidate.record.tags ?? []).some((tag) => tag.startsWith("recall:"))).toBe(false);
    expect((candidate.record.tags ?? []).some((tag) => tag.startsWith("scope:"))).toBe(false);
  });
});
