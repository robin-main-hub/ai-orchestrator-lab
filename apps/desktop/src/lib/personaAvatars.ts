/// <reference types="vite/client" />

/**
 * Build-time avatar lookup for personas that drop a file at
 * `agents/<personaName>/avatar.{svg,png,jpg,jpeg,webp}` (or under
 * `agents/<role>/` for the canonical 1:1 case).
 *
 * Vite's `import.meta.glob` resolves the matching files at bundle time
 * and emits a hashed asset URL for each. At runtime we look up by
 * persona directory name — no fs access, no network roundtrip.
 *
 * Why not use packages/agents `loadPersona` here?
 *   - `loadPersona` is generic across Node + bundler environments; the
 *     desktop renderer is purely Vite, so we can lean on its asset
 *     pipeline directly and skip the abstraction.
 *   - This keeps the desktop bundle from importing `node:fs` indirectly.
 *
 * The persona's directory name is `personaName ?? role` per the loader
 * convention (R3.1 `personaName` override, e.g. Yohane → agents/yohane).
 */

// The glob pattern is relative to THIS file. From apps/desktop/src/lib/
// up four directories lands at the repo root, then descend into agents/.
// `{ eager: true, query: "?url" }` makes each match a string URL that
// Vite will hash + serve as a static asset.
const avatarModules = import.meta.glob(
  "../../../../agents/*/avatar.{svg,png,jpg,jpeg,webp}",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

const avatarByPersonaName: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(avatarModules)) {
    // path looks like "../../../../agents/chae_arin/avatar.svg" — pull
    // out the dir name between "agents/" and "/avatar".
    const match = path.match(/agents\/([^/]+)\/avatar\.[^/]+$/);
    if (!match) continue;
    const dir = match[1]!;
    // First-match wins, so the iteration order of `avatarModules`
    // determines extension precedence. Vite returns alphabetical keys,
    // which lands svg before png before jpg/jpeg/webp — matches the
    // priority humans usually want (vector first, then raster).
    if (!(dir in out)) {
      out[dir] = url;
    }
  }
  return out;
})();

/**
 * Looks up a persona's bundled avatar URL.
 *
 * Pass `personaName` for profiles that use the R3.1 override (e.g.
 * `chae_arin`, `yohane`), `role` otherwise. Returns `undefined` when no
 * `avatar.*` file exists for that directory — callers should fall back
 * to the user-uploaded `visual.avatarDataUrl` or to the initials
 * fallback rendered by `<AgentAvatar>`.
 */
export function getPersonaAvatarUrl(directoryName: string | undefined): string | undefined {
  if (!directoryName) return undefined;
  return avatarByPersonaName[directoryName];
}

/**
 * Exposed for diagnostics / tests — the full map of persona directory
 * names to their bundled URL. Mutating the returned object is forbidden
 * (it shares storage with the build-time index).
 */
export function listBundledPersonaAvatars(): Readonly<Record<string, string>> {
  return avatarByPersonaName;
}
