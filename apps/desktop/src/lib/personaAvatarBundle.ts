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

const SPRITE_KEY_RE = /^agents\/([^/]+)\/expressions\/([a-z_]+)\.(?:png|jpe?g|webp)$/i;

export type PersonaSpriteMap = Record<string, Record<string, string>>;

/** Map agents/<slug>/expressions/<expr>.* keys to { slug -> { expression -> url } }. */
export function spriteMapFromGlob(map: Record<string, string>): PersonaSpriteMap {
  const sprites: PersonaSpriteMap = {};
  for (const [key, url] of Object.entries(map)) {
    const match = SPRITE_KEY_RE.exec(key);
    if (!match) continue;
    const slug = match[1]!;
    const expression = match[2]!.toLowerCase();
    (sprites[slug] ??= {})[expression] = url;
  }
  return sprites;
}

/**
 * Resolve a persona's portrait for an expression, with fallback:
 * expression sprite -> neutral sprite -> base avatar -> undefined.
 */
export function resolvePersonaSprite(
  slug: string,
  expression: string,
  deps: { sprites?: PersonaSpriteMap; avatars?: Record<string, string> },
): string | undefined {
  const personaSprites = deps.sprites?.[slug];
  return personaSprites?.[expression] ?? personaSprites?.neutral ?? deps.avatars?.[slug];
}
