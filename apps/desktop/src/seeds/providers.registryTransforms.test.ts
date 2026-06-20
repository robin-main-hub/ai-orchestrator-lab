import { describe, expect, it } from "vitest";
import type {
  ProviderProfile,
  ProviderRegistryEntry,
  ProviderRegistrySnapshot,
} from "@ai-orchestrator/protocol";
import {
  createModelDiscoveryFromRegistryEntry,
  mergeProviderProfilesFromRegistry,
} from "./providers";

// Characterization tests (no behavior change, pure, no network/secret/DB) for the
// two registry transforms, both 0-ref across the whole test tree. They turn a
// DGX-02 provider-registry snapshot into desktop-side discovery/profile state:
//   - createModelDiscoveryFromRegistryEntry: registry entry → ModelDiscoverySnapshot.
//   - mergeProviderProfilesFromRegistry: registry snapshot merged into the current
//     local profiles (registry is authoritative for connection metadata, but the
//     user's local enabled flag and tag additions must survive the merge).
// We build generic fixtures (provider_test_*) rather than the seeded company
// profiles, and derive expectations from the input entry (self-consistent).

const entry = (overrides: Partial<ProviderRegistryEntry> = {}): ProviderRegistryEntry => ({
  providerProfileId: "provider_test_alpha",
  name: "Test Alpha",
  kind: "openai",
  trustLevel: "limited",
  tags: ["test"],
  defaultModelIds: ["model-a", "model-b"],
  supportsModelList: true,
  authMode: "none",
  secretAvailability: "available",
  updatedAt: "2026-06-20T00:00:00.000Z",
  ...overrides,
});

const snapshot = (entries: ProviderRegistryEntry[]): ProviderRegistrySnapshot => ({
  id: "registry_test_1",
  authorityNodeId: "dgx-02",
  entries,
  summary: { total: entries.length, ready: 0, missingSecrets: 0, dgxVaultBacked: 0, oauthSessions: 0, noAuth: 0 },
  rawSecretPersisted: false,
  createdAt: "2026-06-20T00:00:00.000Z",
});

describe("createModelDiscoveryFromRegistryEntry", () => {
  it("maps default model ids into discovery models and derives id/source/createdAt from the entry", () => {
    const e = entry();
    const snap = createModelDiscoveryFromRegistryEntry(e);

    expect(snap.id).toBe(`model_discovery_registry_${e.providerProfileId}`);
    expect(snap.providerProfileId).toBe(e.providerProfileId);
    expect(snap.source).toBe("remote_probe");
    expect(snap.redactionApplied).toBe(true);
    expect(snap.createdAt).toBe(e.updatedAt);
    // one discovery model per declared default id; createModel keeps id verbatim.
    expect(snap.models.map((m) => m.id)).toEqual(e.defaultModelIds);
  });

  it("marks the snapshot succeeded only when the secret is available; otherwise failed & selectable-but-blocked", () => {
    const ok = createModelDiscoveryFromRegistryEntry(entry({ secretAvailability: "available" }));
    expect(ok.status).toBe("succeeded");
    expect(ok.warnings[0]).toContain("raw secrets stay on DGX-02");

    for (const availability of ["missing", "expired", "revoked"] as const) {
      const bad = createModelDiscoveryFromRegistryEntry(entry({ secretAvailability: availability }));
      expect(bad.status).toBe("failed");
      expect(bad.warnings[0]).toContain(availability);
      expect(bad.warnings[0]).toContain("block completion");
    }
  });

  it("honors an explicit selectedModelId, otherwise defaults to the first model", () => {
    const explicit = createModelDiscoveryFromRegistryEntry(entry({ selectedModelId: "model-b" }));
    expect(explicit.selectedModelId).toBe("model-b");

    const defaulted = createModelDiscoveryFromRegistryEntry(entry());
    expect(defaulted.selectedModelId).toBe("model-a");
  });
});

describe("mergeProviderProfilesFromRegistry", () => {
  const currentAlpha: ProviderProfile = {
    id: "provider_test_alpha",
    name: "Alpha (local)",
    kind: "openai",
    baseUrl: "http://local-alpha",
    defaultModel: "old-model",
    enabled: false,
    tags: ["keep", "shared"],
    trustLevel: "limited",
  };

  it("merges registry metadata into a matching profile but preserves the local enabled flag and unions tags", () => {
    const registry = snapshot([
      entry({
        providerProfileId: "provider_test_alpha",
        kind: "anthropic",
        baseUrl: "http://registry-alpha",
        tags: ["shared", "registry"],
        trustLevel: "trusted",
        defaultModelIds: ["reg-model"],
      }),
    ]);

    const merged = mergeProviderProfilesFromRegistry([currentAlpha], registry)[0]!;

    // registry is authoritative for connection metadata
    expect(merged.kind).toBe("anthropic");
    expect(merged.baseUrl).toBe("http://registry-alpha");
    expect(merged.trustLevel).toBe("trusted");
    expect(merged.defaultModel).toBe("reg-model");
    // ...but the user's local enabled flag must survive
    expect(merged.enabled).toBe(false);
    // tags are a deduped union of local + registry
    expect([...merged.tags].sort()).toEqual(["keep", "registry", "shared"]);
    expect(new Set(merged.tags).size).toBe(merged.tags.length);
  });

  it("passes through current profiles that have no registry match, unchanged", () => {
    const beta: ProviderProfile = {
      id: "provider_test_beta",
      name: "Beta",
      kind: "ollama",
      defaultModel: "beta-model",
      enabled: true,
      tags: ["beta"],
      trustLevel: "untrusted",
    };

    const result = mergeProviderProfilesFromRegistry([beta], snapshot([entry()]));
    const passthrough = result.find((p) => p.id === "provider_test_beta");
    expect(passthrough).toEqual(beta);
  });

  it("appends registry-only profiles after the merged current ones, in registry order", () => {
    const beta: ProviderProfile = {
      id: "provider_test_beta",
      name: "Beta",
      kind: "ollama",
      defaultModel: "beta-model",
      enabled: true,
      tags: ["beta"],
      trustLevel: "untrusted",
    };
    const registry = snapshot([
      entry({ providerProfileId: "provider_test_alpha" }),
      entry({ providerProfileId: "provider_test_gamma", name: "Gamma" }),
    ]);

    const result = mergeProviderProfilesFromRegistry([currentAlpha, beta], registry);

    expect(result.map((p) => p.id)).toEqual([
      "provider_test_alpha", // merged current
      "provider_test_beta", // untouched passthrough
      "provider_test_gamma", // new registry-only profile, appended last
    ]);
  });
});
