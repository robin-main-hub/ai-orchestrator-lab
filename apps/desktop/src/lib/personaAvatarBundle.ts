/**
 * Pure helper for the persona avatar bundle. A persona may carry a portrait at
 * `agents/<slug>/avatar.(png|jpg|jpeg|webp)` — typically the original
 * SillyTavern card image saved on import. Vite bundles these as asset URLs;
 * this maps the glob keys to `{ slug -> url }`. Pure, so it is unit-tested
 * without Vite. The `agents/...` key normalization is shared with the markdown
 * bundle (see personaFileBundle.normalizeGlobMap).
 */

const AVATAR_KEY_RE = /^agents\/([^/]+)\/avatar\.(?:png|jpe?g|webp)$/i;

export function avatarMapFromGlob(map: Record<string, string>): Record<string, string> {
  const avatars: Record<string, string> = {};
  for (const [key, url] of Object.entries(map)) {
    const match = AVATAR_KEY_RE.exec(key);
    if (match && !avatars[match[1]!]) {
      avatars[match[1]!] = url;
    }
  }
  return avatars;
}
