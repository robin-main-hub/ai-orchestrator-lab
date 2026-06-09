import {
  createPersonaFileSourceFromMap,
  listPersonaNamesFromMap,
  normalizeGlobMap,
} from "./personaFileBundle";

/**
 * Build-time bundle of the repo's persona markdown (agents/<name>/*.md +
 * agents/SAFETY.md) into an in-memory PersonaFileSource for the renderer, so a
 * summoned persona carries its real SOUL.md/AGENTS.md identity without runtime
 * fs access.
 *
 * Vite inlines the file contents at build time via import.meta.glob. The pure
 * map/source helpers live in `personaFileBundle.ts` (unit-tested); this module
 * is the thin Vite-specific glue and is verified by the production build.
 */
const rawBundle = import.meta.glob("../../../../agents/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const personaBundleMap = normalizeGlobMap(rawBundle);
export const personaFileSource = createPersonaFileSourceFromMap(personaBundleMap);
export const bundledPersonaNames = listPersonaNamesFromMap(personaBundleMap);
