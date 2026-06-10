import { defaultAgentProfiles } from "@ai-orchestrator/agents";
import type { AgentProfile, AgentRole, TmuxPaneRole } from "@ai-orchestrator/protocol";

/**
 * Persona = an ATOMIC agent set. Injecting a different character is not a text
 * edit on whatever Hermes agent happens to live in the pane — the SOUL/AGENTS
 * files, the declared profile (role + permission level), and the backing
 * Hermes agent SLOT move together as one unit.
 *
 * Slots are sticky (see hermesSlotPool.ts): a persona reuses her own agent —
 * her history stays hers, with no reset and no discarded-session pile-up. A
 * reset boot step is dispatched only when a recycled slot is handed to a
 * DIFFERENT character, so nothing is inherited across characters. Boot steps
 * are ordinary dispatch strings — the runners send them through the same
 * permission/approval/redaction gate as everything else.
 */

/** All of the user's agents run as Hermes agents. */
export const AGENT_BACKEND = "hermes" as const;

/**
 * Default reset command for a Hermes agent CLI pane: `/new` discards the
 * previous character's context when a recycled slot changes hands. Override
 * per deployment if the pane's CLI uses a different reset command.
 */
export const DEFAULT_HERMES_RESET_COMMAND = "/new";

export type PersonaAgentSet = {
  personaName: string;
  backend: typeof AGENT_BACKEND;
  /** canonical profile (role + permission) when this persona is registered; soul/agents/role travel together */
  profile?: AgentProfile;
  /** pane role derived from the declared agent role */
  preferredPaneRole?: TmuxPaneRole;
  /** sticky Hermes slot this persona is bound to, when allocated from the pool */
  slotId?: string;
  /** boot/reset steps dispatched (gated) BEFORE identity injection — empty when the slot is reused or brand-new */
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
    /** boot/reset steps to dispatch before identity injection (default: none — slot reuse) */
    bootSteps?: ReadonlyArray<string>;
    /** sticky Hermes slot this persona occupies */
    slotId?: string;
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
    slotId: options?.slotId,
    bootSteps: [...(options?.bootSteps ?? [])],
  };
}

/**
 * Identity header announcing the whole set the agent embodies — persona, its
 * sticky Hermes slot, the declared role and permission level — not just prose.
 */
export function agentSetHeaderLine(set: PersonaAgentSet, paneRole: TmuxPaneRole): string {
  const slot = set.slotId ? ` (slot ${set.slotId})` : "";
  const freshness = set.bootSteps.length > 0 ? " on a freshly reset session" : "";
  const declared = set.profile
    ? ` Declared role: ${set.profile.role}${set.profile.permissionLevel ? ` (permission: ${set.profile.permissionLevel})` : ""}.`
    : "";
  return (
    `You are ${set.backend} agent${slot}${freshness}. You are now operating as "${set.personaName}" ` +
    `in the ${paneRole} pane.${declared} Adopt the identity below and stay in it.`
  );
}
