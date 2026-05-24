import { describe, expect, it } from "vitest";
import {
  createProviderProfileFromCredentialInput,
  createProviderRuntimeReadiness,
  createSecretVaultSnapshot,
  discoverModelsForProfile,
  parseProviderCredentialInput,
} from "./index";

const createdAt = "2026-05-24T01:00:00.000Z";

describe("provider credential parsing and model discovery", () => {
  it("parses Claude Code reseller shell env without returning raw secrets", () => {
    const parsed = parseProviderCredentialInput(
      [
        'export ANTHROPIC_BASE_URL="https://api.apikey.fun"',
        'export ANTHROPIC_AUTH_TOKEN="sk-bf59d514ae041fbaece4a5cc8f07a996e6bfe97ec394cc0a856b2339cd0a42f0"',
        "export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1",
      ].join("\n"),
      createdAt,
    );

    expect(parsed.format).toBe("anthropic_env");
    expect(parsed.providerKind).toBe("anthropic");
    expect(parsed.baseUrl).toBe("https://api.apikey.fun");
    expect(parsed.trustLevel).toBe("untrusted");
    expect(parsed.secretRef?.redactedPreview).toBe("sk-...42f0");
    expect(JSON.stringify(parsed)).not.toContain("bf59d514");
  });

  it("parses VSCode Claude Code JSON env into a secretRef profile", () => {
    const { profile, parse } = createProviderProfileFromCredentialInput({
      id: "provider_from_json",
      rawInput: JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: "https://api.apikey.fun",
          ANTHROPIC_AUTH_TOKEN: "sk-json-secret-1234567890",
          CLAUDE_CODE_ATTRIBUTION_HEADER: "0",
        },
      }),
      createdAt,
    });

    expect(parse.format).toBe("claude_code_settings_json");
    expect(profile.secretRef?.redactedPreview).toBe("sk-...7890");
    expect(profile.modelDiscoveryEndpoint).toBe("https://api.apikey.fun/models");
    expect(JSON.stringify(profile)).not.toContain("json-secret");
  });

  it("returns model discovery snapshots connected to provider ids", () => {
    const { profile } = createProviderProfileFromCredentialInput({
      id: "provider_openrouter",
      rawInput: 'export OPENAI_BASE_URL="https://openrouter.ai/api/v1"\nexport OPENAI_API_KEY="sk-openrouter-secret"',
      createdAt,
    });
    const discovery = discoverModelsForProfile(profile, createdAt);

    expect(discovery.status).toBe("succeeded");
    expect(discovery.providerProfileId).toBe(profile.id);
    expect(discovery.models.length).toBeGreaterThan(8);
    expect(discovery.redactionApplied).toBe(true);
    expect(discovery.models.every((model) => model.providerProfileId === profile.id)).toBe(true);
  });

  it("models secret vault availability and provider runtime readiness", () => {
    const { profile } = createProviderProfileFromCredentialInput({
      id: "provider_reseller",
      rawInput: 'export ANTHROPIC_BASE_URL="https://api.apikey.fun"\nexport ANTHROPIC_AUTH_TOKEN="sk-reseller-secret"',
      createdAt,
    });
    const discovery = discoverModelsForProfile(profile, createdAt);
    const vault = createSecretVaultSnapshot([profile], createdAt);
    const readiness = createProviderRuntimeReadiness({
      profile,
      models: discovery.models,
      vault,
      selectedModelId: discovery.selectedModelId,
      createdAt,
    });

    expect(vault.rawSecretPersisted).toBe(false);
    expect(vault.summary.available).toBe(1);
    expect(vault.entries[0]?.redactedPreview).toBe("sk-...cret");
    expect(JSON.stringify(vault)).not.toContain("reseller-secret");
    expect(readiness.status).toBe("needs_approval");
    expect(readiness.canUseAutomaticMemory).toBe(false);
  });

  it("registers DGX-02 vLLM as a trusted remote provider without raw secrets", () => {
    const profile = {
      id: "provider_dgx02_vllm",
      name: "DGX-02 vLLM",
      kind: "openai" as const,
      baseUrl: "http://dgx-02:8001/v1",
      defaultModel: "qwen36-domain-wiki-rag-prisma",
      enabled: true,
      tags: ["dgx", "vllm", "no-auth"],
      trustLevel: "trusted" as const,
    };
    const discovery = discoverModelsForProfile(profile, createdAt);
    const vault = createSecretVaultSnapshot([profile], createdAt);
    const readiness = createProviderRuntimeReadiness({
      profile,
      models: discovery.models,
      vault,
      selectedModelId: discovery.selectedModelId,
      createdAt,
    });

    expect(discovery.source).toBe("remote_probe");
    expect(discovery.models[0]?.id).toBe("qwen36-domain-wiki-rag-prisma");
    expect(vault.entries[0]?.storage).toBe("dgx_vault");
    expect(vault.entries[0]?.availability).toBe("available");
    expect(vault.rawSecretPersisted).toBe(false);
    expect(readiness.status).toBe("ready");
    expect(readiness.executionMode).toBe("remote");
  });
});
