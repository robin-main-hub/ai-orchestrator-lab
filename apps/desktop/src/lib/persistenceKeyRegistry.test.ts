import { describe, expect, it } from "vitest";
import { agentSoulPresetStorageKey } from "./agentSoulPresetStorage";
import {
  agentVisualStorageKey,
  agentProfilesStorageKey,
  selectedAgentIdStorageKey,
  providerProfilesStorageKey,
  legacyProviderSessionSecretsStorageKey,
  providerDefaultCredentialsStorageKey,
  providerProfilesSeedVersionKey,
} from "./appConstants";
import { memoryCuratorLedgerStorageKey } from "./memoryCuratorRuntime";
import { CHAT_SIDE_PANEL_WIDTH_STORAGE_KEY } from "./chatSidePanelWidth";
import {
  CODING_APPROVAL_MODE_STORAGE_KEY,
  CODING_APPROVED_PREFIXES_STORAGE_KEY,
  CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY,
} from "./codingAutoApproval";
import { CODING_SESSIONS_STORAGE_KEY } from "./codingChatStore";
import { COMPOSER_INPUT_HEIGHT_STORAGE_KEY } from "./composerResize";
import { GITHUB_COMMENT_AUTOEXECUTE_ARMED_STORAGE_KEY } from "./githubCommentAutoExecute";
import { HERMES_POOL_STORAGE_KEY } from "./hermesPoolStore";
import { PROJECT_RECORDS_STORAGE_KEY } from "./projectRecord";
import { SIDEBAR_WIDTH_STORAGE_KEY } from "./sidebarResize";
import { VERTICAL_SPLIT_STORAGE_KEY } from "./verticalSplitResize";
import { MISSIONS_STORAGE_KEY } from "./workbenchMissions";

// Characterization tests (no behavior change) for a cross-module invariant that no
// existing per-module test can see: every exported localStorage persistence key in
// apps/desktop/src/lib shares ONE browser origin namespace, so any two modules that
// pick the same string would silently read/write each other's state and corrupt it.
// Each module's own suite (e.g. workbenchMissions.test.ts, githubCommentAutoExecute
// .test.ts, memoryCuratorRuntime.storageKey.test.ts) pins its single key in isolation;
// none asserts the keys are mutually distinct across the app. This registry pins that
// global contract plus basic key hygiene. NOTE: the versioning scheme is deliberately
// MIXED in the codebase (`.v1`/`.v2`/`:v1` and the suffix-less `seed-version` meta
// key, across four app prefixes), so we do NOT assert a uniform version suffix — only
// the invariants that actually hold: uniqueness, non-empty trimmed strings, and an
// app-scoped prefix (no bare global key that could collide with a third-party lib in
// the same origin). This file imports only the exported constants; inline string-literal
// keys, if any, are out of scope.
const PERSISTENCE_KEYS: ReadonlyArray<readonly [name: string, value: string]> = [
  ["agentSoulPresetStorageKey", agentSoulPresetStorageKey],
  ["agentVisualStorageKey", agentVisualStorageKey],
  ["agentProfilesStorageKey", agentProfilesStorageKey],
  ["selectedAgentIdStorageKey", selectedAgentIdStorageKey],
  ["providerProfilesStorageKey", providerProfilesStorageKey],
  ["legacyProviderSessionSecretsStorageKey", legacyProviderSessionSecretsStorageKey],
  ["providerDefaultCredentialsStorageKey", providerDefaultCredentialsStorageKey],
  ["providerProfilesSeedVersionKey", providerProfilesSeedVersionKey],
  ["memoryCuratorLedgerStorageKey", memoryCuratorLedgerStorageKey],
  ["CHAT_SIDE_PANEL_WIDTH_STORAGE_KEY", CHAT_SIDE_PANEL_WIDTH_STORAGE_KEY],
  ["CODING_APPROVAL_MODE_STORAGE_KEY", CODING_APPROVAL_MODE_STORAGE_KEY],
  ["CODING_APPROVED_PREFIXES_STORAGE_KEY", CODING_APPROVED_PREFIXES_STORAGE_KEY],
  ["CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY", CODING_AUTO_APPROVAL_ARMED_STORAGE_KEY],
  ["CODING_SESSIONS_STORAGE_KEY", CODING_SESSIONS_STORAGE_KEY],
  ["COMPOSER_INPUT_HEIGHT_STORAGE_KEY", COMPOSER_INPUT_HEIGHT_STORAGE_KEY],
  ["GITHUB_COMMENT_AUTOEXECUTE_ARMED_STORAGE_KEY", GITHUB_COMMENT_AUTOEXECUTE_ARMED_STORAGE_KEY],
  ["HERMES_POOL_STORAGE_KEY", HERMES_POOL_STORAGE_KEY],
  ["PROJECT_RECORDS_STORAGE_KEY", PROJECT_RECORDS_STORAGE_KEY],
  ["SIDEBAR_WIDTH_STORAGE_KEY", SIDEBAR_WIDTH_STORAGE_KEY],
  ["VERTICAL_SPLIT_STORAGE_KEY", VERTICAL_SPLIT_STORAGE_KEY],
  ["MISSIONS_STORAGE_KEY", MISSIONS_STORAGE_KEY],
];

// observed app namespaces (all four delimited forms currently in use)
const APP_PREFIXES = [
  "ai-orchestrator-lab:",
  "ai-orchestrator-lab.",
  "ai-orchestrator.",
  "ai-orch.",
  "orch.",
] as const;

describe("persistence key registry — cross-module localStorage namespace", () => {
  it("every exported persistence key is globally unique (no module clobbers another)", () => {
    const values = PERSISTENCE_KEYS.map(([, value]) => value);
    const unique = new Set(values);
    // surface the actual collision if this ever regresses
    const dupes = values.filter((v, i) => values.indexOf(v) !== i);
    expect(dupes).toEqual([]);
    expect(unique.size).toBe(values.length);
  });

  it("every key is a non-empty string with no surrounding whitespace", () => {
    for (const [name, value] of PERSISTENCE_KEYS) {
      expect(typeof value, name).toBe("string");
      expect(value.length, name).toBeGreaterThan(0);
      expect(value.trim(), name).toBe(value);
    }
  });

  it("every key is app-namespaced (no bare global key that could collide with a third-party lib)", () => {
    for (const [name, value] of PERSISTENCE_KEYS) {
      const hasAppPrefix = APP_PREFIXES.some((prefix) => value.startsWith(prefix));
      expect(hasAppPrefix, `${name} (${value}) must start with a known app prefix`).toBe(true);
    }
  });

  it("no key is a strict prefix of another (safe against prefix-scoped iteration/clear)", () => {
    const values = PERSISTENCE_KEYS.map(([, value]) => value);
    for (const a of values) {
      for (const b of values) {
        if (a === b) continue;
        // b starting with a + a delimiter would make `a` a namespace-prefix of `b`
        expect(b.startsWith(`${a}.`) || b.startsWith(`${a}:`), `${a} is a prefix of ${b}`).toBe(false);
      }
    }
  });
});
