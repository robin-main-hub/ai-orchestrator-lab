import { normalizeGlobMap } from "./personaFileBundle";
import { avatarMapFromGlob } from "./personaAvatarBundle";

/**
 * Build-time bundle of persona portraits (agents/<slug>/avatar.*) into asset
 * URLs the renderer can show. Empty until a persona has an avatar (e.g. after
 * importing a SillyTavern .png card). Thin Vite glue — the pure map helpers
 * (personaAvatarBundle / personaFileBundle) are unit-tested; this is verified
 * by the build.
 */
const rawAvatars = import.meta.glob("../../../../agents/**/avatar.{png,jpg,jpeg,webp}", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const personaAvatars = avatarMapFromGlob(normalizeGlobMap(rawAvatars));
