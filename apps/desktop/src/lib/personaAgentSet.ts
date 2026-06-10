import { defaultAgentProfiles } from "@ai-orchestrator/agents";
import type { AgentProfile, AgentRole, TmuxPaneRole } from "@ai-orchestrator/protocol";

/**
 * Persona = an ATOMIC agent set. Injecting a different character is not a text
 * edit on whatever Hermes agent happens to live in the pane — the SOUL/AGENTS
 * files, the declared profile (role + permission level), and the backing
 * Hermes agent session move together as one unit:
 *
 *   boot a FRESH Hermes agent session (no inherited context from the previous
 *   character) -> inject the persona's identity -> work under its declared role.
 *
 * This module resolves that set from the canonical profile registry
 * (`defaultAgentProfiles`, keyed by personaName) and carries the fresh-session
 * boot steps. The boot steps are ordinary dispatch strings — the runners send
 * them through the same permission/approval/redaction gate as everything else.
 */

/** All of the user's agents run as Hermes agents. */
export const AGENT_BACKEND = "hermes" as const;

/**
 * Default fresh-session boot for a Hermes agent CLI pane: `/new` discards the
 * previous character's context so the incoming persona starts clean. Override
 * per deployment if the pane's CLI uses a different reset command.
 */
export const DEFAULT_HERMES_BOOT_STEPS: ReadonlyArray<string> = ["/new"];

export type PersonaAgentSet = {
  personaName: string;
  backend: typeof AGENT_BACKEND;
  /** canonical profile (role + permission) when this persona is registered; soul/agents/role travel together */
  profile?: AgentProfile;
  /** pane role derived from the declared agent role */
  preferredPaneRole?: TmuxPaneRole;
  /** fresh-agent boot steps dispatched (gated) BEFORE identity injection */
  bootSteps: string[];
};

/** Which pane workstation a declared agent role naturally occupies. */
export const AGENT_ROLE_TO_PANE_ROLE: Partial<Record<AgentRole, TmuxPaneRole>> = {
  orchestrator: "orchestrator",
  architect: "architect",
  builder: "code",
  executor: "code",
  reviewer: "qa",
  skeptic: "qa",
  verifier: "qa",
  auditor: "qa",
  memory_curator: "memory",
  researcher: "research",
  domain_expert: "research",
  watchdog: "status",
  // companion is the polymath/만능 secretary — she runs the show, not a single station
  companion: "orchestrator",
};

export function resolvePersonaAgentSet(
  personaName: string,
  options?: {
    /** override the fresh-session boot (empty array = reuse the pane's current agent session) */
    bootSteps?: ReadonlyArray<string>;
    /** profile registry override, for tests or imported personas */
    profiles?: ReadonlyArray<AgentProfile>;
  },
): PersonaAgentSet {
  const profiles = options?.profiles ?? defaultAgentProfiles;
  const profile = profiles.find((candidate) => candidate.personaName === personaName);
  const preferredPaneRole = profile ? AGENT_ROLE_TO_PANE_ROLE[profile.role] : undefined;
  return {
    personaName,
    backend: AGENT_BACKEND,
    profile,
    preferredPaneRole,
    bootSteps: [...(options?.bootSteps ?? DEFAULT_HERMES_BOOT_STEPS)],
  };
}

/**
 * Identity header for a freshly booted agent: announces the declared role and
 * permission level alongside the persona, so the new Hermes session knows the
 * whole set it embodies — not just the prose.
 */
export function agentSetHeaderLine(set: PersonaAgentSet, paneRole: TmuxPaneRole): string {
  const declared = set.profile
    ? ` Declared role: ${set.profile.role}${set.profile.permissionLevel ? ` (permission: ${set.profile.permissionLevel})` : ""}.`
    : "";
  return (
    `You are a fresh ${set.backend} agent session. You are now operating as "${set.personaName}" ` +
    `in the ${paneRole} pane.${declared} Adopt the identity below and stay in it.`
  );
}
