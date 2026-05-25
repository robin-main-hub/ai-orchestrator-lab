import type { AgentProfile } from "@ai-orchestrator/protocol";

/**
 * Persona loader for the markdown-backed agent profile files under
 * `agents/<persona-name>/`. Each persona has up to two mandatory files
 * plus optional extras:
 *
 *   SOUL.md      — voice, judgment style, long-term disposition (mandatory)
 *   AGENTS.md    — operational rules, permission boundaries, output format (mandatory)
 *   IDENTITY.md  — optional: deeper identity / immutable backstory that
 *                  the persona must always carry (loaded ahead of SOUL
 *                  so the character body sits inside identity context)
 *   USER.md      — optional: stable facts about the human user the
 *                  persona is addressing (오빠 호칭, 회사 컨텍스트, etc.).
 *                  Loaded at the tail so it's fresh in context.
 *
 * Optional files are detected by presence — drop them in agents/<name>/
 * and the loader picks them up automatically. Personas that don't have
 * them work unchanged.
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

export type PersonaFragmentSource = "soul" | "agents" | "identity" | "user";

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
  /**
   * In prompt-injection order. Layout when all fragments are present:
   *   IDENTITY (if file exists) → SOUL → AGENTS → USER (if file exists).
   * Empty when `mode === "off"`. Optional fragments (IDENTITY/USER) are
   * skipped without error when the corresponding file is absent.
   */
  fragments: PersonaFragment[];
  /**
   * Shared safety-boundary content read from the repo-root
   * `agents/SAFETY.md` file when present, or `null` when the file is
   * absent or the loader was given a `PersonaFileSource` that does not
   * carry it.
   *
   * Persona files (SOUL.md / AGENTS.md) hold character/voice only — the
   * universal safety rules (DGX-01 금기, secret 보호, permission gate
   * 의무, untrusted provider 격리, redaction stages, ...) live in
   * `agents/SAFETY.md` as a single source of truth, and the loader
   * surfaces them here so `buildPersonaPromptFragment` can auto-inject
   * them ahead of the character body.
   *
   * Always populated when the file exists, regardless of `mode` — even
   * `mode === "off"` callers want the safety rules to flow through.
   */
  safetyContent: string | null;
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
const IDENTITY_FILENAME = "IDENTITY.md";
const USER_FILENAME = "USER.md";
const SAFETY_RELATIVE_PATH = "agents/SAFETY.md";

/**
 * Optional persona files. Detected by presence — caller doesn't toggle
 * them via mode. If the file doesn't exist under `agents/<personaName>/`,
 * the loader silently skips it (no `PersonaFragmentMissingError`).
 *
 * Order here also defines slot position in the assembled prompt body:
 * IDENTITY sits before the SOUL+AGENTS character body (innermost
 * identity wraps the character), USER sits after it (the "who you're
 * addressing" context follows the character setup).
 */
const OPTIONAL_FRAGMENTS: Array<{
  source: PersonaFragmentSource;
  filename: string;
  slot: "before_character" | "after_character";
}> = [
  { source: "identity", filename: IDENTITY_FILENAME, slot: "before_character" },
  { source: "user", filename: USER_FILENAME, slot: "after_character" },
];

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
 * The directory name for a profile. Currently a 1:1 mapping from `role`
 * to directory name (the 6 built-in roles each have a directory). This
 * indirection lets us add aliases or per-profile overrides later without
 * touching every call site.
 */
export function personaNameForProfile(profile: AgentProfile): string {
  // `personaName` override (protocol R3.1) lets multiple profiles sharing
  // the same role load distinct character files — e.g. two skeptics, one
  // mapped to agents/skeptic/ (Asuka), the other to agents/yohane/
  // (Yohane Idea Bank). Falls back to the role name for the canonical
  // 1:1 case.
  return profile.personaName ?? profile.role;
}

export async function loadPersona(
  personaName: string,
  mode: PersonaSourceMode,
  source: PersonaFileSource,
): Promise<LoadedPersona> {
  // SAFETY.md is universal — loaded regardless of mode, since even an
  // `off` persona (no character text injected) should still inherit the
  // system safety rules when the caller assembles its prompt.
  const safetyContent = await source.readMarkdown(SAFETY_RELATIVE_PATH);

  if (mode === "off") {
    return { personaName, mode, fragments: [], safetyContent };
  }

  // Load mandatory (mode-driven) fragments first — these throw if missing.
  const characterFragments: PersonaFragment[] = [];
  for (const need of fragmentsNeededForMode(mode)) {
    const relativePath = `agents/${personaName}/${need.filename}`;
    const content = await source.readMarkdown(relativePath);
    if (content === null) {
      throw new PersonaFragmentMissingError(personaName, relativePath);
    }
    characterFragments.push({ source: need.source, relativePath, content });
  }

  // Probe optional fragments. Missing files are silently skipped — that's
  // how a persona opts out of IDENTITY/USER without any config flag.
  const optionalLoaded: Array<{ slot: "before_character" | "after_character"; fragment: PersonaFragment }> = [];
  for (const opt of OPTIONAL_FRAGMENTS) {
    const relativePath = `agents/${personaName}/${opt.filename}`;
    const content = await source.readMarkdown(relativePath);
    if (content === null) continue;
    optionalLoaded.push({
      slot: opt.slot,
      fragment: { source: opt.source, relativePath, content },
    });
  }

  // Assemble in semantic order: identity (before_character) → mandatory
  // character body → user (after_character). When multiple optionals
  // share a slot they keep the OPTIONAL_FRAGMENTS declaration order.
  const fragments: PersonaFragment[] = [
    ...optionalLoaded.filter((o) => o.slot === "before_character").map((o) => o.fragment),
    ...characterFragments,
    ...optionalLoaded.filter((o) => o.slot === "after_character").map((o) => o.fragment),
  ];

  return { personaName, mode, fragments, safetyContent };
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
  /**
   * Skip injecting the shared `agents/SAFETY.md` content at the top of
   * the assembled fragment. Defaults to `false` (safety IS injected).
   *
   * Operational callers should leave this `false` so character personas
   * always inherit the universal safety boundaries. Pass `true` only for
   * debug / prompt-size analysis / persona inspector UIs that want to
   * render the character body in isolation.
   */
  omitSafety?: boolean;
};

/**
 * Assemble the loaded persona into a single markdown blob suitable for
 * prompt injection. Returns empty string when neither the safety
 * content nor any character fragments are present — the caller decides
 * whether to fall back to embedded summary text or skip persona
 * injection entirely.
 *
 * Output layout (default, safety injected first because it has higher
 * precedence in conflict resolution — the character is a voice inside
 * these rules, not above them). Optional IDENTITY/USER fragments slot
 * in around the mandatory character body — see OPTIONAL_FRAGMENTS:
 *
 *   <headerLine?>
 *
 *   # System Safety Boundaries
 *   <SAFETY.md body, trimmed>
 *
 *   # Persona: <name>
 *
 *   ## From agents/<name>/IDENTITY.md  (if file exists)
 *   <IDENTITY.md body, trimmed>
 *
 *   ## From agents/<name>/SOUL.md
 *   <SOUL.md body, trimmed>
 *
 *   ## From agents/<name>/AGENTS.md
 *   <AGENTS.md body, trimmed>
 *
 *   ## From agents/<name>/USER.md  (if file exists)
 *   <USER.md body, trimmed>
 */
export function buildPersonaPromptFragment(
  loaded: LoadedPersona,
  options: PersonaPromptOptions = {},
): string {
  const { headerLine, includeFragmentHeadings = true, omitSafety = false } = options;
  const includeSafety = !omitSafety && loaded.safetyContent !== null;
  if (!includeSafety && loaded.fragments.length === 0) return "";

  const parts: string[] = [];
  if (headerLine) parts.push(headerLine);
  if (includeSafety) {
    parts.push("# System Safety Boundaries");
    parts.push(loaded.safetyContent!.trim());
  }
  if (loaded.fragments.length > 0) {
    parts.push(`# Persona: ${loaded.personaName}`);
    for (const fragment of loaded.fragments) {
      if (includeFragmentHeadings) {
        parts.push(`## From ${fragment.relativePath}`);
      }
      parts.push(fragment.content.trim());
    }
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
