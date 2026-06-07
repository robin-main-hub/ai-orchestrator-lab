import type { AgentRole } from "@ai-orchestrator/protocol";
import {
  getAgentToolBadgeLabels,
  getAgentToolProfileSummary,
} from "../../lib/agentToolProfiles";
export {
  normalizeOperatorWorkerPersonaKey as normalizeWorkerPersonaKey,
  resolveOperatorWorkerDisplay,
} from "../../lib/operatorWorkerDisplay";

export function resolveOperatorWorkerSkillDisplay(role: AgentRole) {
  const summary = getAgentToolProfileSummary(role);
  return {
    boundaryLabel: summary.runtime.boundaryLabel,
    label: summary.label,
    tools: getAgentToolBadgeLabels(role),
  };
}
