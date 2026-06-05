import type { AgentRole } from "@ai-orchestrator/protocol";
import type { AgentExpression, AgentPortraitSet } from "../types/agent-expressions";

const expressions: AgentExpression[] = [
  "neutral",
  "thinking",
  "speaking",
  "agreeing",
  "disagreeing",
  "surprised",
  "focused",
  "idle",
  "error",
  "success",
];

export const roleGlowColors: Partial<Record<AgentRole, string>> = {
  architect: "#a78bfa",
  auditor: "#fb7185",
  builder: "#60a5fa",
  companion: "#38bdf8",
  domain_expert: "#c084fc",
  executor: "#fbbf24",
  memory_curator: "#c084fc",
  orchestrator: "#22d3ee",
  reviewer: "#fb7185",
  skeptic: "#34d399",
  verifier: "#a3e635",
};

function portraitPaths(agentId: string): Record<AgentExpression, string> {
  return expressions.reduce(
    (paths, expression) => ({
      ...paths,
      [expression]: `/portraits/${agentId}/${expression}.png`,
    }),
    {} as Record<AgentExpression, string>,
  );
}

export function createFallbackPortraitSet({
  agentId,
  glowColor,
  name,
}: {
  agentId: string;
  glowColor: string;
  name: string;
}): AgentPortraitSet {
  return {
    agentId,
    defaultExpression: "neutral",
    glowColor,
    imageAssetsAvailable: false,
    name,
    portraits: portraitPaths(agentId),
  };
}

export const agentPortraitRegistry: AgentPortraitSet[] = [];

export function getAgentPortraitSet(agentId: string, role: AgentRole, displayName = agentId) {
  return (
    agentPortraitRegistry.find((portrait) => portrait.agentId === agentId) ??
    createFallbackPortraitSet({
      agentId,
      glowColor: roleGlowColors[role] ?? "#71717a",
      name: displayName,
    })
  );
}
