import { buildPersonaPromptFragment, type LoadedPersona } from "@ai-orchestrator/agents";
import type { AgentSession, TmuxPaneRole } from "@ai-orchestrator/protocol";

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
  /** identity preamble (safety boundaries + persona fragments) to send first */
  injectionText: string;
  /** ordered dispatch steps: identity injection, then the optional kickoff task */
  steps: string[];
};

export function buildPersonaInjectionPlan(input: {
  session: AgentSession;
  persona: LoadedPersona;
  kickoffTask?: string;
  /** override the default header line placed atop the identity blob */
  headerLine?: string;
}): PersonaInjectionPlan {
  const { session, persona, kickoffTask } = input;
  if (!session.paneId) {
    throw new Error(`cannot build injection plan: session ${session.id} has no pane bound`);
  }

  const agentId = session.agentId ?? persona.personaName;
  const headerLine =
    input.headerLine ??
    `You are now operating as "${agentId}" in the ${session.role} pane. Adopt the identity below and stay in it.`;

  const fragment = buildPersonaPromptFragment(persona, { headerLine });
  // Even when a persona has no SOUL/AGENTS files, give the worker at least the
  // header so the pane has an explicit identity tag.
  const injectionText = fragment.trim().length > 0 ? fragment : headerLine;

  const kickoff = kickoffTask?.trim();
  const steps = kickoff ? [injectionText, kickoff] : [injectionText];

  return {
    agentId,
    paneId: session.paneId,
    role: session.role,
    injectionText,
    steps,
  };
}
