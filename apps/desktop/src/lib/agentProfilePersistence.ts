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
    providerProfileId: typeof value.providerProfileId === "string" ? value.providerProfileId : undefined,
    modelId: typeof value.modelId === "string" ? value.modelId : undefined,
    soulMode: isSoulMode(value.soulMode) ? value.soulMode : "summary",
    configSource: isConfigSource(value.configSource) ? value.configSource : "internal",
    enabled: value.enabled !== false,
    authBinding: value.authBinding,
  };
}

export function parseStoredAgentProfiles(value: unknown, seededAgents: WorkbenchAgent[]): WorkbenchAgent[] {
  if (!Array.isArray(value)) {
    return seededAgents;
  }

  const storedAgents = value.map(sanitizeStoredAgent).filter((agent): agent is WorkbenchAgent => Boolean(agent));
  if (storedAgents.length === 0) {
    return seededAgents;
  }

  const storedIds = new Set(storedAgents.map((agent) => agent.id));
  const missingSeeds = seededAgents.filter((agent) => !storedIds.has(agent.id));
  return [...storedAgents, ...missingSeeds];
}

export function parseStoredSelectedAgentId(value: unknown, agents: WorkbenchAgent[]): string {
  if (typeof value === "string" && agents.some((agent) => agent.id === value)) {
    return value;
  }

  return agents[0]?.id ?? "";
}
