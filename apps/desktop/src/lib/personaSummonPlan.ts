import { buildPersonaPromptFragment, type LoadedPersona } from "@ai-orchestrator/agents";
import type { AgentSession, TmuxPaneRole } from "@ai-orchestrator/protocol";
import { agentSetHeaderLine, type PersonaAgentSet } from "./personaAgentSet";

/**
 * Turn a summoned AgentSession + its loaded persona into the concrete dispatch
 * steps that bind that identity into the pane and (optionally) hand it a first
 * task.
 *
 * This is the bridge between three pieces that already exist:
 *   - personaSummon  -> which pane the persona occupies (AgentSession)
 *   - @ai-orchestrator/agents.buildPersonaPromptFragment -> the identity blob
 *     (SAFETY.md boundaries + IDENTITY/SOUL/AGENTS/USER fragments)
 *   - the tmux dispatch path -> how text reaches the pane worker
 *
 * The returned `steps` are ordinary command strings; the caller dispatches them
 * through the same gated /tmux/dispatch + /approvals/replay path as any other
 * command (e.g. via the closed-loop runtime adapter), so persona injection is
 * gated and audited like everything else. This module performs no I/O.
 */

export type PersonaInjectionPlan = {
  agentId: string;
  paneId: string;
  role: TmuxPaneRole;
  /** fresh-agent boot steps (from the persona's agent set), dispatched before the identity */
  bootSteps: string[];
  /** identity preamble (safety boundaries + persona fragments) to send first */
  injectionText: string;
  /** ordered dispatch steps: agent boot, identity injection, then the optional kickoff task */
  steps: string[];
};

export function buildPersonaInjectionPlan(input: {
  session: AgentSession;
  persona: LoadedPersona;
  kickoffTask?: string;
  /** override the default header line placed atop the identity blob */
  headerLine?: string;
  /**
   * The persona's atomic agent set (SOUL/AGENTS + declared role/permission +
   * backing agent session). When present, its boot steps are prepended so the
   * pane gets a FRESH Hermes agent session — the new character never inherits
   * the previous character's context — and the header announces the declared
   * role so soul, agents, and role land as one unit.
   */
  agentSet?: PersonaAgentSet;
  /**
   * OPTIONAL lorebook/world-info fragment (built via @ai-orchestrator/agents
   * scanLorebooks + buildLorebookFragment). Appended after the identity so the
   * persona reads matched lore as part of its briefing. Empty/absent = no-op.
   */
  worldInfo?: string;
}): PersonaInjectionPlan {
  const { session, persona, kickoffTask, agentSet } = input;
  if (!session.paneId) {
    throw new Error(`cannot build injection plan: session ${session.id} has no pane bound`);
  }

  const agentId = session.agentId ?? persona.personaName;
  const headerLine =
    input.headerLine ??
    (agentSet
      ? agentSetHeaderLine(agentSet, session.role)
      : `You are now operating as "${agentId}" in the ${session.role} pane. Adopt the identity below and stay in it.`);

  const fragment = buildPersonaPromptFragment(persona, { headerLine });
  // Even when a persona has no SOUL/AGENTS files, give the worker at least the
  // header so the pane has an explicit identity tag.
  const identityText = fragment.trim().length > 0 ? fragment : headerLine;
  const worldInfo = input.worldInfo?.trim();
  const injectionText = worldInfo ? `${identityText}\n\n${worldInfo}` : identityText;

  const bootSteps = agentSet ? [...agentSet.bootSteps] : [];
  const kickoff = kickoffTask?.trim();
  const steps = kickoff ? [...bootSteps, injectionText, kickoff] : [...bootSteps, injectionText];

  return {
    agentId,
    paneId: session.paneId,
    role: session.role,
    bootSteps,
    injectionText,
    steps,
  };
}
