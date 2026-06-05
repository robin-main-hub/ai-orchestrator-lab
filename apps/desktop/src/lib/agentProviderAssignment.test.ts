import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import type { WorkbenchAgent } from "../types";
import { createProviderCompletionProxyRequest } from "../runtime/stage12DgxProvider";
import { applyAgentProviderAssignment } from "./agentProviderAssignment";

const baseAgent: WorkbenchAgent = {
  id: "agent_architect",
  name: "Architect",
  kind: "virtual",
  role: "architect",
  providerProfileId: "provider_codex",
  modelId: "gpt-5-codex",
  soulMode: "summary",
  configSource: "internal",
  enabled: true,
  authBinding: {
    mode: "oauth",
    label: "OAuth/API profile",
    providerProfileId: "provider_codex",
    oauthRef: "oauth_pending",
  },
};

const provider: ProviderProfile = {
  id: "provider_openai",
  name: "OpenAI",
  kind: "openai",
  baseUrl: "https://api.openai.com/v1",
  defaultModel: "gpt-4.1",
  enabled: true,
  tags: [],
  trustLevel: "trusted",
};

const createAuthBinding = (profile?: ProviderProfile): WorkbenchAgent["authBinding"] =>
  profile
    ? {
        mode: "provider_profile",
        label: "API secretRef",
        providerProfileId: profile.id,
      }
    : undefined;

describe("applyAgentProviderAssignment", () => {
  it("clears provider, model, and auth binding when provider id is empty", () => {
    const nextAgents = applyAgentProviderAssignment({
      agents: [baseAgent],
      agentId: baseAgent.id,
      providerId: "",
      providerProfiles: [provider],
      modelCatalog: {
        [provider.id]: [
          {
            id: provider.defaultModel ?? "gpt-4.1",
            name: provider.defaultModel ?? "gpt-4.1",
            providerProfileId: provider.id,
            supportsStreaming: true,
            supportsTools: false,
            tags: [],
          },
        ],
      },
      createAuthBinding,
    });

    expect(nextAgents[0]?.id).toBe(baseAgent.id);
    expect(nextAgents[0]).not.toHaveProperty("providerProfileId");
    expect(nextAgents[0]).not.toHaveProperty("modelId");
    expect(nextAgents[0]).not.toHaveProperty("authBinding");
  });

  it("assigns the requested available provider and first discovered model", () => {
    const nextAgents = applyAgentProviderAssignment({
      agents: [baseAgent],
      agentId: baseAgent.id,
      providerId: provider.id,
      providerProfiles: [provider],
      modelCatalog: {
        [provider.id]: [
          {
            id: "gpt-4.1-mini",
            name: "gpt-4.1-mini",
            providerProfileId: provider.id,
            supportsStreaming: true,
            supportsTools: false,
            tags: [],
          },
        ],
      },
      createAuthBinding,
    });

    expect(nextAgents[0]).toMatchObject({
      providerProfileId: provider.id,
      modelId: "gpt-4.1-mini",
      authBinding: {
        mode: "provider_profile",
        label: "API secretRef",
        providerProfileId: provider.id,
      },
    });
  });

  it("preserves the assigned provider and model in the server proxy completion request", () => {
    const nextAgents = applyAgentProviderAssignment({
      agents: [baseAgent],
      agentId: baseAgent.id,
      providerId: provider.id,
      providerProfiles: [provider],
      modelCatalog: {
        [provider.id]: [
          {
            id: "gpt-4.1-mini",
            name: "gpt-4.1-mini",
            providerProfileId: provider.id,
            supportsStreaming: true,
            supportsTools: false,
            tags: [],
          },
        ],
      },
      createAuthBinding,
    });
    const assignedAgent = nextAgents[0];
    expect(assignedAgent?.providerProfileId).toBe(provider.id);
    expect(assignedAgent?.modelId).toBe("gpt-4.1-mini");

    const request = createProviderCompletionProxyRequest(provider, assignedAgent?.modelId ?? provider.defaultModel ?? "model pending", [
      {
        id: "message_1",
        sessionId: "session_provider_assignment",
        role: "user",
        content: "Run with the assigned model.",
        createdAt: "2026-06-05T00:00:00.000Z",
      },
    ]);

    expect(request.providerProfileId).toBe(provider.id);
    expect(request.modelId).toBe("gpt-4.1-mini");
    expect(request.sessionId).toBe("session_provider_assignment");
    expect(JSON.stringify(request)).not.toContain("API secretRef");
    expect(JSON.stringify(request)).not.toContain("oauth_pending");
  });

  it("keeps current agents when the provider is already occupied by another agent", () => {
    const occupiedAgent: WorkbenchAgent = {
      ...baseAgent,
      id: "agent_reviewer",
      providerProfileId: provider.id,
    };

    const nextAgents = applyAgentProviderAssignment({
      agents: [baseAgent, occupiedAgent],
      agentId: baseAgent.id,
      providerId: provider.id,
      providerProfiles: [provider],
      modelCatalog: {},
      createAuthBinding,
    });

    expect(nextAgents).toEqual([baseAgent, occupiedAgent]);
  });
});
