import type { PersonaFileSource } from "@ai-orchestrator/agents";

/**
 * Pure helpers for turning a bundled map of persona markdown files into a
 * `PersonaFileSource` the agents loader can consume in the renderer (no fs).
 *
 * The map is keyed by repo-relative path, e.g.
 *   "agents/architect/SOUL.md", "agents/SAFETY.md".
 * `personaBundleSource.ts` builds that map from a Vite `import.meta.glob`; these
 * functions are kept separate and pure so they are unit-tested without Vite.
 */

/** Normalize glob-resolved keys (absolute or `../`-prefixed) to `agents/...`. */
export function normalizeGlobMap(rawMap: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, content] of Object.entries(rawMap)) {
    const marker = key.lastIndexOf("agents/");
    if (marker === -1) {
      continue;
    }
    normalized[key.slice(marker)] = content;
  }
  return normalized;
}

export function createPersonaFileSourceFromMap(map: Record<string, string>): PersonaFileSource {
  return {
    readMarkdown: async (relativePath: string) => map[relativePath] ?? null,
  };
}

/** Persona directory names that have a SOUL.md, sorted and de-duplicated. */
export function listPersonaNamesFromMap(map: Record<string, string>): string[] {
  const names = new Set<string>();
  for (const key of Object.keys(map)) {
    const match = /^agents\/([^/]+)\/SOUL\.md$/.exec(key);
    if (match) {
      names.add(match[1]!);
    }
  }
  return [...names].sort();
}
