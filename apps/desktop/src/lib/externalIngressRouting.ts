import type { WorkbenchAgent } from "../types";

export function resolveExternalIngressTargetAgentId({
  agents,
  fallbackAgentId = "agent_unassigned",
}: {
  agents: Pick<WorkbenchAgent, "id" | "role">[];
  fallbackAgentId?: string;
}): string {
  return (
    agents.find((agent) => agent.role === "orchestrator")?.id ??
    agents[0]?.id ??
    fallbackAgentId
  );
}
