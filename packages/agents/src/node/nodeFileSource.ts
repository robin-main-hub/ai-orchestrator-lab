import { readFile } from "node:fs/promises";
import * as path from "node:path";

import type { PersonaFileSource } from "../personaLoader.js";

/**
 * Filesystem-backed `PersonaFileSource`.
 *
 * Lives under `src/node/` because it imports `node:fs/promises` and we
 * don't want to drag that into bundles that target the browser / mobile.
 * Any non-Node consumer of `@ai-orchestrator/agents` should build its
 * own `PersonaFileSource` (preloaded markdown via Vite import,
 * `import.meta.glob`, asset bundling, etc.) instead of importing from
 * this subpath.
 *
 * Behavior contract:
 *   - missing files (ENOENT) resolve to `null` so the loader can wrap
 *     them as `PersonaFragmentMissingError`
 *   - all other I/O errors (EACCES, EISDIR, etc.) propagate untouched
 *     so the caller sees the real filesystem problem instead of a
 *     misleading "not found"
 *
 * `repoRoot` is the absolute path containing the top-level `agents/`
 * directory. Relative paths from the loader (e.g. `agents/architect/
 * SOUL.md`) are joined under this root.
 */
export function createNodeFileSource(repoRoot: string): PersonaFileSource {
  return {
    async readMarkdown(relativePath: string): Promise<string | null> {
      const absolutePath = path.join(repoRoot, relativePath);
      try {
        return await readFile(absolutePath, "utf8");
      } catch (error) {
        if (isFileNotFound(error)) return null;
        throw error;
      }
    },
  };
}

function isFileNotFound(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
