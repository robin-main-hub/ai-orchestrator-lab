import type { AgentProfile } from "@ai-orchestrator/protocol";

/**
 * Persona loader for the markdown-backed agent profile files under
 * `agents/<persona-name>/`. Each persona has up to two files:
 *
 *   SOUL.md    — voice, judgment style, long-term disposition
 *   AGENTS.md  — operational rules, permission boundaries, output format
 *
 * The loader is filesystem-agnostic: it takes a `PersonaFileSource` so
 * unit tests can inject in-memory fixtures and the Node implementation
 * (see `./node/nodeFileSource.ts`) can stay isolated from the rest of
 * the agents package. That keeps `@ai-orchestrator/agents` consumable in
 * non-Node environments (vitest's jsdom env, the desktop renderer,
 * future mobile) without leaking `node:fs` into the bundle.
 *
 * What the loader is NOT responsible for:
 *   - markdown parsing (returns raw content; caller decides whether to
 *     split into sections or pass through verbatim)
 *   - prompt-shape rendering policy (caller picks delimiters, role tags)
 *   - permission gating (F2 evaluator runs upstream of this layer)
 *   - secret detection (these files MUST NOT contain secrets per
 *     `agents/README.md` rule; F7 redaction would be a separate
 *     pre_persist gate if file writes go through the codebase)
 */

export type PersonaSourceMode = "soul_only" | "agents_only" | "soul_plus_agents" | "off";

export type PersonaFragmentSource = "soul" | "agents";

export type PersonaFragment = {
  source: PersonaFragmentSource;
  /** Path relative to the repo root, e.g. `agents/architect/SOUL.md`. */
  relativePath: string;
  content: string;
};

export type LoadedPersona = {
  /** Directory name under `agents/`, e.g. `architect`. */
  personaName: string;
  mode: PersonaSourceMode;
  /** In load order — SOUL first when both are loaded; empty when mode === "off". */
  fragments: PersonaFragment[];
};

export interface PersonaFileSource {
  /**
   * Read a markdown file. Implementations MUST resolve to `null` (not
   * throw) when the file is missing, so the loader can wrap it as a
   * typed `PersonaFragmentMissingError` with both persona name and
   * filename. Other I/O errors should still propagate so callers see
   * real filesystem problems (permission denied, etc.).
   */
  readMarkdown(relativePath: string): Promise<string | null>;
}

export class PersonaFragmentMissingError extends Error {
  constructor(
    public readonly personaName: string,
    public readonly relativePath: string,
  ) {
    super(`persona fragment not found: ${relativePath} (persona "${personaName}")`);
    this.name = "PersonaFragmentMissingError";
  }
}

const SOUL_FILENAME = "SOUL.md";
const AGENTS_FILENAME = "AGENTS.md";

/**
 * Translate the AgentProfile's `configSource` field into a load mode.
 * Centralizing this mapping prevents three different callers from each
 * picking a slightly different rule for the same enum value.
 *
 *   - "internal" → "off"          (use embedded persona text, not files)
 *   - "markdown" → "soul_plus_agents"
 *   - "off"      → "off"
 *
 * Callers that need a mode different from the profile's default can pass
 * a mode override directly to `loadPersona`.
 */
export function inferModeFromConfigSource(
  configSource: AgentProfile["configSource"],
): PersonaSourceMode {
  switch (configSource) {
    case "markdown":
      return "soul_plus_agents";
    case "internal":
    case "off":
    default:
      return "off";
  }
}

/**
 * The directory name for a profile. Defaults to a 1:1 mapping from
 * `role` to directory name (the 6+ built-in roles each have a
 * directory under `agents/`). When a profile carries an explicit
 * `personaName` field, that override wins — used when two profiles
 * share the same role but need different character files (e.g.
 * `agents/skeptic/` = Asuka, `agents/yohane/` = Yohane Idea Bank,
 * both `role: "skeptic"`).
 */
export function personaNameForProfile(profile: AgentProfile): string {
  return profile.personaName ?? profile.role;
}

export async function loadPersona(
  personaName: string,
  mode: PersonaSourceMode,
  source: PersonaFileSource,
): Promise<LoadedPersona> {
  if (mode === "off") {
    return { personaName, mode, fragments: [] };
  }
  const fragments: PersonaFragment[] = [];
  for (const need of fragmentsNeededForMode(mode)) {
    const relativePath = `agents/${personaName}/${need.filename}`;
    const content = await source.readMarkdown(relativePath);
    if (content === null) {
      throw new PersonaFragmentMissingError(personaName, relativePath);
    }
    fragments.push({ source: need.source, relativePath, content });
  }
  return { personaName, mode, fragments };
}

function fragmentsNeededForMode(
  mode: Exclude<PersonaSourceMode, "off">,
): Array<{ source: PersonaFragmentSource; filename: string }> {
  switch (mode) {
    case "soul_only":
      return [{ source: "soul", filename: SOUL_FILENAME }];
    case "agents_only":
      return [{ source: "agents", filename: AGENTS_FILENAME }];
    case "soul_plus_agents":
      return [
        { source: "soul", filename: SOUL_FILENAME },
        { source: "agents", filename: AGENTS_FILENAME },
      ];
  }
}

export type PersonaPromptOptions = {
  /** Optional header line inserted before the persona body (e.g. a role tag). */
  headerLine?: string;
  /** Wrap each fragment's body with a `## From <relativePath>` heading. Defaults to true. */
  includeFragmentHeadings?: boolean;
};

/**
 * Assemble the loaded persona into a single markdown blob suitable for
 * prompt injection. Returns empty string when `loaded.fragments` is empty
 * (which includes `mode === "off"`) — the caller decides whether to fall
 * back to embedded summary text or skip persona injection entirely.
 *
 * Output layout (default):
 *
 *   <headerLine?>
 *
 *   # Persona: <name>
 *
 *   ## From agents/<name>/SOUL.md
 *   <SOUL.md body, trimmed>
 *
 *   ## From agents/<name>/AGENTS.md
 *   <AGENTS.md body, trimmed>
 */
export function buildPersonaPromptFragment(
  loaded: LoadedPersona,
  options: PersonaPromptOptions = {},
): string {
  if (loaded.fragments.length === 0) return "";
  const { headerLine, includeFragmentHeadings = true } = options;
  const parts: string[] = [];
  if (headerLine) parts.push(headerLine);
  parts.push(`# Persona: ${loaded.personaName}`);
  for (const fragment of loaded.fragments) {
    if (includeFragmentHeadings) {
      parts.push(`## From ${fragment.relativePath}`);
    }
    parts.push(fragment.content.trim());
  }
  return parts.join("\n\n");
}

/**
 * In-memory `PersonaFileSource` for tests and for callers that want to
 * preload all persona files (e.g. the desktop renderer can bundle the
 * markdown at build time and avoid runtime fs access).
 */
export function createInMemoryPersonaSource(
  files: Record<string, string>,
): PersonaFileSource {
  return {
    async readMarkdown(relativePath: string) {
      return Object.prototype.hasOwnProperty.call(files, relativePath)
        ? files[relativePath]!
        : null;
    },
  };
}
