import type { AgentRole } from "@ai-orchestrator/protocol";
import type { AgentExpression, AgentPortraitSet } from "../types/agent-expressions";
import { resolvePersonaPortraitUrl } from "../../../lib/personaPortrait";

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
  const registered = agentPortraitRegistry.find((portrait) => portrait.agentId === agentId);
  if (registered) {
    return registered;
  }

  // Resolve the bundled character art the same way tmux does (persona key → role)
  // so the cockpit shows real portraits instead of always falling back to initials.
  const bundledUrl = resolvePersonaPortraitUrl(agentId, role);
  if (bundledUrl) {
    const portraits = expressions.reduce(
      (paths, expression) => ({ ...paths, [expression]: bundledUrl }),
      {} as Record<AgentExpression, string>,
    );
    return {
      agentId,
      defaultExpression: "neutral",
      glowColor: roleGlowColors[role] ?? "#71717a",
      imageAssetsAvailable: true,
      name: displayName,
      portraits,
    } satisfies AgentPortraitSet;
  }

  return createFallbackPortraitSet({
    agentId,
    glowColor: roleGlowColors[role] ?? "#71717a",
    name: displayName,
  });
}
