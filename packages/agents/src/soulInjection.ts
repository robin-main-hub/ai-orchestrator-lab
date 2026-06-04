/**
 * Soul injection utilities — issue #7.
 *
 * Bridges the protocol-level SoulInjectionMode ("full" | "summary" |
 * "retrieved" | "off") and the persona loader's PersonaSourceMode, adds
 * a token-cost estimator, and assembles the final agent system prompt
 * with an injection report so callers can log exactly what was injected.
 *
 * Injection mode semantics:
 *   full      — loads IDENTITY + SOUL + AGENTS + USER (all markdown files)
 *   summary   — loads SOUL only (compact character voice)
 *   retrieved — loads SOUL only as static fallback; caller performs
 *               dynamic memory recall separately and prepends the result
 *   off       — no character files loaded; only SAFETY.md if present
 *
 * Task instruction priority (rule from issue #7):
 *   SAFETY.md > task instruction > soul fragments
 * This is enforced by buildPersonaPromptFragment inserting safety first,
 * and by the caller prepending the task prompt ahead of soul text.
 */

import type { AgentProfile, SoulInjectionMode } from "@ai-orchestrator/protocol";
import {
  buildPersonaPromptFragment,
  loadPersona,
  personaNameForProfile,
  PersonaFragmentMissingError,
} from "./personaLoader.js";
import type {
  LoadedPersona,
  PersonaFileSource,
  PersonaPromptOptions,
  PersonaSourceMode,
} from "./personaLoader.js";

export type { PersonaSourceMode };

/**
 * Map SoulInjectionMode → PersonaSourceMode understood by the persona loader.
 * "retrieved" falls back to soul_only (static); dynamic retrieval is
 * the caller's responsibility (query the MemoryAdapter, prepend results).
 */
export function soulModeToPersonaSourceMode(mode: SoulInjectionMode): PersonaSourceMode {
  switch (mode) {
    case "full":
      return "soul_plus_agents";
    case "summary":
      return "soul_only";
    case "retrieved":
      // Static soul text is injected; caller augments with dynamic recall.
      return "soul_only";
    case "off":
      return "off";
  }
}

/**
 * Rough token estimate (≈ 1 token per 4 chars, mixed Korean/English).
 * Good enough for cost display; not a billing-accurate count.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Records exactly what was injected into the system prompt so the
 * execution log can surface it to the user (issue #7 completion criterion).
 */
export type SoulInjectionReport = {
  personaName: string;
  mode: SoulInjectionMode;
  /** Relative paths of persona fragments injected, in prompt order. */
  fragmentsInjected: string[];
  safetyInjected: boolean;
  /** Rough token cost of the assembled soul section. */
  estimatedTokens: number;
  /** The assembled text — pass to the LLM as the system prompt prefix. */
  promptText: string;
};

/**
 * Load the persona for  and assemble the system-prompt fragment,
 * returning an injection report for logging.
 *
 * Callers should prepend the returned  to the task instruction
 * rather than append — the character voice wraps the task, not the other
 * way around. Safety boundaries (SAFETY.md) are injected first by
 * buildPersonaPromptFragment and thus have the highest effective priority.
 */
export async function buildAgentSystemPrompt(
  profile: AgentProfile,
  source: PersonaFileSource,
  options?: PersonaPromptOptions,
): Promise<SoulInjectionReport> {
  let loaded: LoadedPersona;
  let personaName = personaNameForProfile(profile);
  let mode = profile.soulMode;

  try {
    const sourceMode = soulModeToPersonaSourceMode(mode);
    loaded = await loadPersona(personaName, sourceMode, source);
  } catch (err) {
    if (err instanceof PersonaFragmentMissingError) {
      try {
        personaName = canonicalPersonaNameForRole(profile.role);
        mode = getCanonicalSoulMode(profile.role);
        const sourceMode = soulModeToPersonaSourceMode(mode);
        loaded = await loadPersona(personaName, sourceMode, source);
      } catch (fallbackErr) {
        if (!(fallbackErr instanceof PersonaFragmentMissingError)) {
          throw fallbackErr;
        }
        mode = "off";
        loaded = await loadPersona(personaName, "off", source);
      }
    } else {
      throw err;
    }
  }

  const promptText = buildPersonaPromptFragment(loaded, options);

  return {
    personaName,
    mode,
    fragmentsInjected: loaded.fragments.map((f) => f.relativePath),
    safetyInjected: loaded.safetyContent !== null && !(options?.omitSafety ?? false),
    estimatedTokens: estimateTokens(promptText),
    promptText,
  };
}

function canonicalPersonaNameForRole(role: string): string {
  if (role === "companion") return "chae_arin";
  return role;
}

function getCanonicalSoulMode(role: string): SoulInjectionMode {
  switch (role) {
    case "companion":
      return "full";
    case "reviewer":
    case "external":
    case "auditor":
    case "researcher":
    case "domain_expert":
      return "retrieved";
    case "executor":
      return "off";
    default:
      return "summary";
  }
}
