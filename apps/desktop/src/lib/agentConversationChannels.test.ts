import type { ConversationMessage } from "@ai-orchestrator/protocol";
import { describe, expect, it } from "vitest";
import {
  appendAgentChannelMessages,
  createAgentChannelMemoryInstallAudit,
  createAgentChannelMemoryInstallSummary,
  createAgentChannelMemoryScope,
  createAgentChannelRecallQuery,
  createInitialAgentConversationChannels,
  getAgentChannelMessages,
} from "./agentConversationChannels";
import { seededAgentProfiles } from "../seeds/agents";

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
    metadata: {
      agentId: "agent_orchestrator",
    },
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
  it("creates an isolated channel for every agent and only assigns explicitly scoped seed messages", () => {
    const channels = createInitialAgentConversationChannels(agents, seedMessages);

    expect(getAgentChannelMessages(channels, "agent_orchestrator")).toHaveLength(2);
    expect(getAgentChannelMessages(channels, "agent_reviewer")).toEqual([]);
    expect(getAgentChannelMessages(channels, "agent_executor")).toEqual([]);
  });

  it("does not route agentName-only assistant messages into the first agent channel", () => {
    const channels = createInitialAgentConversationChannels(agents, [
      {
        id: "message_agent_name_only",
        sessionId: "session_a",
        role: "assistant",
        content: "이름만 있는 과거 메시지",
        createdAt: "2026-06-05T00:00:03.000Z",
        metadata: {
          agentName: "마키마",
        },
      },
    ]);

    expect(getAgentChannelMessages(channels, "agent_orchestrator")).toEqual([]);
    expect(getAgentChannelMessages(channels, "agent_reviewer")).toEqual([]);
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

  it("builds recall queries that keep agent, session and provider scope visible to memory adapters", () => {
    const scope = createAgentChannelMemoryScope("agent_reviewer", "session_a", "provider_mimo_token_openai");

    expect(createAgentChannelRecallQuery(scope, "코딩 패킷 검토")).toBe(
      [
        "코딩 패킷 검토",
        "agent:agent_reviewer",
        "session:session_a",
        "provider:provider_mimo_token_openai",
      ].join("\n"),
    );
  });

  it("audits memory scope installation for every seeded agent", () => {
    const audit = createAgentChannelMemoryInstallAudit(
      seededAgentProfiles,
      "session_main",
      "provider_mimo_token_openai",
    );

    expect(audit.totalAgents).toBe(seededAgentProfiles.length);
    expect(audit.installedCount).toBe(seededAgentProfiles.length);
    expect(audit.missingAgentIds).toEqual([]);
    expect(audit.duplicateNamespaceAgentIds).toEqual([]);
    expect(audit.duplicateRecallTraceAgentIds).toEqual([]);
    expect(audit.scopes.map((scope) => scope.agentId).sort()).toEqual(
      seededAgentProfiles.map((agent) => agent.id).sort(),
    );
  });

  it("redacts secret-like provider values from memory namespaces and recall traces", () => {
    const audit = createAgentChannelMemoryInstallAudit(
      [{ id: "agent_executor" }],
      "session_main",
      "provider https://token-plan-sgp.xiaomimimo.com/v1 Bearer bearer-secret-value sk-secret-value tp-secret-value",
    );
    const serializedAudit = JSON.stringify(audit);

    expect(serializedAudit).not.toContain("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(serializedAudit).not.toContain("sk-secret-value");
    expect(serializedAudit).not.toContain("tp-secret-value");
    expect(audit.scopes[0]?.providerProfileId).toBe(
      "provider_redacted_url_Bearer_redacted_token_redacted_key_redacted_token",
    );
    expect(audit.scopes[0]?.namespace).not.toContain(" ");
    expect(audit.scopes[0]?.recallTraceId).not.toContain(" ");
  });

  it("summarizes memory installation in safe Korean operator language", () => {
    const audit = createAgentChannelMemoryInstallAudit(
      seededAgentProfiles,
      "session_main",
      "provider_mimo_token_openai",
    );

    expect(createAgentChannelMemoryInstallSummary(audit)).toBe(
      `전원 기억 설치 완료 · ${seededAgentProfiles.length}/${seededAgentProfiles.length}`,
    );
  });
});
