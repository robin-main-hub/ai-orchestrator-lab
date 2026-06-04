import type { AgentAuthBinding, ProviderProfile } from "@ai-orchestrator/protocol";
import type { ModelCatalog, WorkbenchAgent } from "../types";

export type ApplyAgentProviderAssignmentInput = {
  agentId: string;
  agents: WorkbenchAgent[];
  createAuthBinding: (provider?: ProviderProfile) => AgentAuthBinding | undefined;
  modelCatalog: ModelCatalog;
  providerId: string;
  providerProfiles: ProviderProfile[];
};

export function applyAgentProviderAssignment({
  agentId,
  agents,
  createAuthBinding,
  modelCatalog,
  providerId,
  providerProfiles,
}: ApplyAgentProviderAssignmentInput): WorkbenchAgent[] {
  if (providerId === "") {
    return agents.map((agent) => {
      if (agent.id !== agentId) return agent;
      const { authBinding: _authBinding, modelId: _modelId, providerProfileId: _providerProfileId, ...rest } = agent;
      return rest;
    });
  }

  const provider = providerProfiles.find((profile) => profile.id === providerId);
  const isOccupied = agents.some(
    (agent) => agent.id !== agentId && agent.providerProfileId === providerId,
  );

  if (!provider || isOccupied) return agents;

  return agents.map((agent) =>
    agent.id === agentId
      ? {
          ...agent,
          providerProfileId: provider.id,
          modelId: modelCatalog[provider.id]?.[0]?.id ?? provider.defaultModel,
          authBinding: createAuthBinding(provider),
        }
      : agent,
  );
}
