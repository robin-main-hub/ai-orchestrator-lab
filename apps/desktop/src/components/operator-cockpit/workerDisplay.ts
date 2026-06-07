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
    tools: getAgentToolBadgeLabels(role).map(operatorToolLabel),
  };
}

function operatorToolLabel(label: string) {
  if (label === "Tmux 계획") return "터미널 계획";
  return label;
}
