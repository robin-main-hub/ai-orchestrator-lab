import { describe, expect, it } from "vitest";
import { agentRoleSchema } from "@ai-orchestrator/protocol";
import {
  agentProfilesStorageKey,
  agentRoleOptions,
  agentVisualStorageKey,
  defaultObsidianVaultRoot,
  legacyProviderSessionSecretsStorageKey,
  maxDraftAttachments,
  modelWindowSize,
  now,
  providerDefaultCredentialsStorageKey,
  providerProfilesSeedVersion,
  providerProfilesSeedVersionKey,
  providerProfilesStorageKey,
  selectedAgentIdStorageKey,
} from "./appConstants";
import { defaultObsidianVaultRoot as backupModuleVaultRoot } from "../runtime/stage7Backup";

// Characterization tests (no behavior change) for appConstants.ts, a module with
// no test file. It is mostly literal app-wide constants, but two clusters carry
// load-bearing invariants that nothing currently guards:
//   1. The localStorage keys. Every persisted slice (visuals, profiles, selected
//      agent, provider profiles/secrets/credentials, seed version) keys off its
//      own string. If any two collided, one feature would silently clobber the
//      other's persisted state on save. We pin that they are mutually DISTINCT and
//      all live under the shared "ai-orchestrator-lab." namespace prefix (so they
//      can't collide with unrelated localStorage either).
//   2. agentRoleOptions — the role dropdown's option list. Every entry must be a
//      real protocol AgentRole (an invalid one would offer a role the system can't
//      route) and the list must be duplicate-free.
// We also pin the numeric window/cap constants and that `now` is a valid ISO
// instant. Display-only literals (vault root, seed version string) are checked
// only for shape, not verbatim.

const STORAGE_KEYS = [
  agentVisualStorageKey,
  agentProfilesStorageKey,
  selectedAgentIdStorageKey,
  providerProfilesStorageKey,
  legacyProviderSessionSecretsStorageKey,
  providerDefaultCredentialsStorageKey,
  providerProfilesSeedVersionKey,
];

describe("appConstants", () => {
  it("keeps every localStorage key mutually distinct (a collision would clobber persisted state)", () => {
    expect(new Set(STORAGE_KEYS).size).toBe(STORAGE_KEYS.length);
  });

  it("namespaces every localStorage key under the shared app prefix", () => {
    for (const key of STORAGE_KEYS) {
      expect(key.startsWith("ai-orchestrator-lab.")).toBe(true);
    }
  });

  it("offers only valid, duplicate-free protocol AgentRoles in the role dropdown", () => {
    expect(agentRoleOptions.length).toBeGreaterThan(0);
    expect(new Set(agentRoleOptions).size).toBe(agentRoleOptions.length);
    for (const role of agentRoleOptions) {
      expect(agentRoleSchema.safeParse(role).success).toBe(true);
    }
  });

  it("pins the window/cap constants as positive integers", () => {
    for (const value of [modelWindowSize, maxDraftAttachments]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
    expect(modelWindowSize).toBe(8);
    expect(maxDraftAttachments).toBe(5);
  });

  it("exposes a non-empty seed version and a valid ISO `now` instant", () => {
    expect(providerProfilesSeedVersion.length).toBeGreaterThan(0);
    // `now` round-trips through Date — it is a real parseable ISO instant
    expect(Number.isNaN(Date.parse(now))).toBe(false);
    expect(new Date(now).toISOString()).toBe(now);
  });
});

// Characterization tests for defaultObsidianVaultRoot — the one appConstants
// export the suite above leaves untouched (the header note deliberately checked
// the vault root "only for shape, not verbatim", and the const was in fact 0-ref).
// The load-bearing invariant is NOT the literal path but the silent-drift risk:
// stage7Backup.ts defines its OWN second copy of defaultObsidianVaultRoot and uses
// it as the default vault root when building Obsidian backup destinations. If the
// two independent literals ever diverge, the app-wide constant and the backup
// destination root would disagree with nothing to catch it. We pin that the two
// copies stay equal, plus the shape (a non-empty, drive-rooted path with no
// trailing separator) so it remains a valid root the destination builder can join.
describe("appConstants — obsidian vault root cross-module consistency", () => {
  it("matches the stage7 backup module's independent copy (drift would split the root)", () => {
    expect(defaultObsidianVaultRoot).toBe(backupModuleVaultRoot);
    expect(defaultObsidianVaultRoot.length).toBeGreaterThan(0);
  });

  it("is a drive-rooted path with no trailing separator", () => {
    // drive-letter prefix (e.g. "F:/…") — a stable absolute root.
    expect(defaultObsidianVaultRoot).toMatch(/^[A-Za-z]:\//);
    // no trailing slash/backslash, so the destination builder's join is clean.
    expect(/[\\/]$/.test(defaultObsidianVaultRoot)).toBe(false);
  });
});
