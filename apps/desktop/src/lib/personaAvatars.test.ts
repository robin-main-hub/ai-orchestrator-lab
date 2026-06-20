import { describe, expect, it } from "vitest";
import { getPersonaAvatarUrl, listBundledPersonaAvatars } from "./personaAvatars";

// Characterization tests (no behavior change) for personaAvatars.ts, which has no
// dedicated test file. getPersonaAvatarUrl is exercised only indirectly by the
// helpers visual-settings suites (which assert the avatar resolver downstream);
// listBundledPersonaAvatars is entirely unasserted.
//
// The module builds a build-time index from Vite's import.meta.glob over
// agents/<dir>/avatar.{svg,png,jpg,jpeg,webp} — extracting the directory name
// between "agents/" and "/avatar", first-match-wins so one URL per directory.
// The load-bearing invariants: the falsy guard (undefined/"" → undefined), an
// absent directory → undefined, and that getPersonaAvatarUrl is exactly a lookup
// into the shared listBundledPersonaAvatars() index (same value, shared storage).
// Expected values are derived from the index itself so the test stays
// self-consistent with whatever avatars the repo bundles.

describe("personaAvatars", () => {
  const index = listBundledPersonaAvatars();
  const keys = Object.keys(index);

  it("guard: a falsy directory name resolves to undefined without touching the index", () => {
    expect(getPersonaAvatarUrl(undefined)).toBeUndefined();
    expect(getPersonaAvatarUrl("")).toBeUndefined();
  });

  it("returns undefined for a directory that ships no avatar.* file", () => {
    expect(getPersonaAvatarUrl("__no_such_persona_dir__")).toBeUndefined();
  });

  it("bundles at least one persona avatar, each keyed by a bare directory name → non-empty URL", () => {
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      // the dir name is extracted between agents/ and /avatar — never a path segment
      expect(key).not.toContain("/");
      expect(key).not.toContain("avatar");
      expect(typeof index[key]).toBe("string");
      expect(index[key]!.length).toBeGreaterThan(0);
    }
  });

  it("getPersonaAvatarUrl is exactly a lookup into the bundled index", () => {
    for (const key of keys) {
      expect(getPersonaAvatarUrl(key)).toBe(index[key]);
    }
  });

  it("listBundledPersonaAvatars returns the shared build-time index (same reference each call)", () => {
    expect(listBundledPersonaAvatars()).toBe(index);
  });
});
