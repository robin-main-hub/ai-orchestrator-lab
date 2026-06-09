import type { WorkbenchAgent } from "../types";

function isAgentRole(value: unknown): value is WorkbenchAgent["role"] {
  return (
    value === "orchestrator" ||
    value === "architect" ||
    value === "builder" ||
    value === "reviewer" ||
    value === "skeptic" ||
    value === "verifier" ||
    value === "memory_curator" ||
    value === "executor" ||
    value === "external" ||
    value === "auditor"
  );
}

function isSoulMode(value: unknown): value is WorkbenchAgent["soulMode"] {
  return value === "full" || value === "summary" || value === "retrieved" || value === "off";
}

function isConfigSource(value: unknown): value is WorkbenchAgent["configSource"] {
  return value === "internal" || value === "markdown" || value === "off";
}

function sanitizeStoredAgent(candidate: unknown): WorkbenchAgent | undefined {
  if (!candidate || typeof candidate !== "object") return undefined;
  const value = candidate as Partial<WorkbenchAgent>;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !isAgentRole(value.role) ||
    (value.kind !== "real" && value.kind !== "virtual")
  ) {
    return undefined;
  }

  return {
    id: value.id,
    name: value.name,
    kind: value.kind,
    role: value.role,
    providerProfileId:
      typeof value.providerProfileId === "string" && !isMockProviderId(value.providerProfileId)
        ? value.providerProfileId
        : undefined,
    modelId: typeof value.modelId === "string" && !isMockModelId(value.modelId) ? value.modelId : undefined,
    soulMode: isSoulMode(value.soulMode) ? value.soulMode : "summary",
    configSource: isConfigSource(value.configSource) ? value.configSource : "internal",
    enabled: value.enabled !== false,
    authBinding:
      value.authBinding?.providerProfileId && isMockProviderId(value.authBinding.providerProfileId)
        ? undefined
        : value.authBinding,
  };
}

function mergeSeedDefaults(storedAgent: WorkbenchAgent, seededAgent?: WorkbenchAgent): WorkbenchAgent {
  if (!seededAgent) return storedAgent;

  const providerProfileId = storedAgent.providerProfileId ?? seededAgent.providerProfileId;
  const modelId = storedAgent.modelId ?? seededAgent.modelId;
  const authBinding =
    storedAgent.authBinding ??
    (providerProfileId === seededAgent.providerProfileId ? seededAgent.authBinding : undefined);

  return {
    ...storedAgent,
    providerProfileId,
    modelId,
    authBinding,
  };
}

function isMockProviderId(providerProfileId?: string): boolean {
  return providerProfileId === "provider_mock_local" || providerProfileId?.startsWith("provider_mock_") === true;
}

function isMockModelId(modelId?: string): boolean {
  return modelId?.startsWith("mock-") === true;
}

export function parseStoredAgentProfiles(value: unknown, seededAgents: WorkbenchAgent[]): WorkbenchAgent[] {
  if (!Array.isArray(value)) {
    return seededAgents;
  }

  const storedAgents = value.map(sanitizeStoredAgent).filter((agent): agent is WorkbenchAgent => Boolean(agent));
  if (storedAgents.length === 0) {
    return seededAgents;
  }

  const seededAgentById = new Map(seededAgents.map((agent) => [agent.id, agent]));
  const restoredAgents = storedAgents.map((agent) => mergeSeedDefaults(agent, seededAgentById.get(agent.id)));
  const storedIds = new Set(restoredAgents.map((agent) => agent.id));
  const missingSeeds = seededAgents.filter((agent) => !storedIds.has(agent.id));
  return [...restoredAgents, ...missingSeeds];
}

export function parseStoredSelectedAgentId(value: unknown, agents: WorkbenchAgent[]): string {
  if (typeof value === "string" && agents.some((agent) => agent.id === value)) {
    return value;
  }

  return agents[0]?.id ?? "";
}
