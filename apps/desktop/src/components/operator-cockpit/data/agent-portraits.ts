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

// Avatar-frame glow channel only (see styles.css `--persona-glow-*`, §6 T-13).
// Values live as CSS variables so the glow palette is a named token channel,
// kept separate from the single-accent UI-chrome rule. Colors unchanged.
export const roleGlowColors: Partial<Record<AgentRole, string>> = {
  architect: "var(--persona-glow-architect)",
  auditor: "var(--persona-glow-auditor)",
  builder: "var(--persona-glow-builder)",
  companion: "var(--persona-glow-companion)",
  domain_expert: "var(--persona-glow-domain_expert)",
  executor: "var(--persona-glow-executor)",
  memory_curator: "var(--persona-glow-memory_curator)",
  orchestrator: "var(--persona-glow-orchestrator)",
  reviewer: "var(--persona-glow-reviewer)",
  skeptic: "var(--persona-glow-skeptic)",
  verifier: "var(--persona-glow-verifier)",
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
