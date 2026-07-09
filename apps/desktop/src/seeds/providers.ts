import { createProviderProfile } from "@ai-orchestrator/providers";
import type {
  ModelDescriptor,
  ModelDiscoverySnapshot,
  ProviderProfile,
  ProviderRegistryEntry,
  ProviderRegistrySnapshot,
} from "@ai-orchestrator/protocol";
import type { ModelCatalog } from "../types";
import {
  providerProfilesSeedVersion,
  providerProfilesSeedVersionKey,
  providerProfilesStorageKey,
} from "../lib/appConstants";
import { createDgxVaultSecretRef } from "../lib/helpers";

export const seededProviderProfiles: ProviderProfile[] = [
  createProviderProfile({
    id: "provider_dgx02_vllm",
    name: "DGX-02 vLLM",
    kind: "openai",
    baseUrl: "http://dgx-02:8001/v1",
    defaultModel: "qwen36-domain-lora-v5-prisma",
    tags: ["dgx", "vllm", "no-auth"],
    trustLevel: "trusted",
  }),
  createProviderProfile({
    id: "provider_openai_compat",
    name: "OpenAI 호환 프로파일",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.5-pro",
    tags: ["검증", "강한 모델"],
    trustLevel: "trusted",
  }),
  createProviderProfile({
    id: "provider_reseller_custom",
    name: "리셀러 호환 API",
    kind: "custom",
    baseUrl: "https://api.apikey.fun",
    defaultModel: "claude-code-compatible",
    tags: ["임시", "주의"],
    trustLevel: "untrusted",
  }),
  {
    ...createProviderProfile({
      id: "provider_deepseek_dgx",
      name: "DeepSeek DGX-02 Key",
      kind: "openai",
      baseUrl: "https://api.deepseek.com/v1",
      defaultModel: "deepseek-v4-flash",
      tags: ["dgx-secret-ref", "server-proxy", "deepseek"],
      trustLevel: "limited",
    }),
    secretRef: createDgxVaultSecretRef("secret_dgx02_deepseek", "DGX-02 DeepSeek API key", "dgx-02:DEEPSEEK_API_KEY"),
    modelDiscoveryEndpoint: "https://api.deepseek.com/v1/models",
  },
  {
    ...createProviderProfile({
      id: "provider_openrouter_dgx",
      name: "OpenRouter DGX-02 Key",
      kind: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "openrouter/auto",
      tags: ["dgx-secret-ref", "server-proxy", "openrouter", "openai-compatible"],
      trustLevel: "limited",
    }),
    secretRef: createDgxVaultSecretRef("secret_dgx02_openrouter", "DGX-02 OpenRouter API key", "dgx-02:OPENROUTER_API_KEY"),
    modelDiscoveryEndpoint: "https://openrouter.ai/api/v1/models",
  },
  {
    ...createProviderProfile({
      id: "provider_apifun_claude",
      name: "APIKey.fun Claude A",
      kind: "anthropic",
      baseUrl: "https://api.apikey.fun",
      defaultModel: "claude-opus-4-8",
      tags: ["dgx-secret-ref", "server-proxy", "apikey.fun", "reseller"],
      trustLevel: "untrusted",
    }),
    secretRef: createDgxVaultSecretRef("secret_dgx02_apikeyfun_claude_a", "DGX-02 APIKey.fun Claude A", "dgx-02:ANTHROPIC_API_KEY"),
    modelDiscoveryEndpoint: "https://api.apikey.fun/v1/models",
  },
  {
    ...createProviderProfile({
      id: "provider_apifun_claude_b",
      name: "APIKey.fun Claude B",
      kind: "anthropic",
      baseUrl: "https://api.apikey.fun",
      defaultModel: "claude-opus-4-8",
      tags: ["dgx-secret-ref", "server-proxy", "apikey.fun", "reseller"],
      trustLevel: "untrusted",
    }),
    secretRef: createDgxVaultSecretRef("secret_dgx02_apikeyfun_claude_b", "DGX-02 APIKey.fun Claude B", "dgx-02:ANTHROPIC_API_KEY_ALT"),
    modelDiscoveryEndpoint: "https://api.apikey.fun/v1/models",
  },
  {
    ...createProviderProfile({
      id: "provider_mimo_token_openai",
      name: "MiMo Token Plan OpenAI",
      kind: "openai",
      baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1",
      defaultModel: "mimo-v2.5-pro",
      tags: ["dgx-secret-ref", "server-proxy", "mimo", "token-plan", "openai-compatible"],
      trustLevel: "limited",
    }),
    secretRef: createDgxVaultSecretRef("secret_dgx02_mimo_token_plan", "DGX-02 MiMo Token Plan API key", "dgx-02:MIMO_API_KEY"),
    modelDiscoveryEndpoint: "https://token-plan-sgp.xiaomimimo.com/v1/models",
  },
  {
    ...createProviderProfile({
      id: "provider_mimo_token_anthropic",
      name: "MiMo Token Plan Anthropic",
      kind: "anthropic",
      baseUrl: "https://token-plan-sgp.xiaomimimo.com/anthropic",
      defaultModel: "mimo-v2.5-pro",
      tags: ["dgx-secret-ref", "server-proxy", "mimo", "token-plan", "anthropic-compatible"],
      trustLevel: "limited",
    }),
    secretRef: createDgxVaultSecretRef("secret_dgx02_mimo_token_plan", "DGX-02 MiMo Token Plan API key", "dgx-02:MIMO_API_KEY"),
  },
  {
    ...createProviderProfile({
      id: "provider_grok_oauth_dgx",
      name: "Grok OAuth #1",
      kind: "custom",
      baseUrl: "http://127.0.0.1:18111/v1",
      defaultModel: "grok-oauth-session",
      tags: ["oauth", "grok", "server-proxy", "dgx", "grok-account-1"],
      trustLevel: "limited",
    }),
    secretRef: createDgxVaultSecretRef("secret_dgx02_grok_oauth_1", "DGX-02 Grok OAuth #1", "dgx-02:~/.grok/auth.json"),
  },
  {
    ...createProviderProfile({
      id: "provider_grok_oauth_dgx_2",
      name: "Grok OAuth #2",
      kind: "custom",
      baseUrl: "http://127.0.0.1:18112/v1",
      defaultModel: "grok-oauth-session",
      tags: ["oauth", "grok", "server-proxy", "dgx", "grok-account-2"],
      trustLevel: "limited",
    }),
    secretRef: createDgxVaultSecretRef("secret_dgx02_grok_oauth_2", "DGX-02 Grok OAuth #2", "dgx-02:~/.grok2/auth.json"),
  },
  {
    ...createProviderProfile({
      id: "provider_openclaw_dgx",
      name: "DGX-02 OpenClaw vLLM",
      kind: "openai",
      baseUrl: "http://dgx-02:8004/v1",
      defaultModel: "qwen36-heretic",
      tags: ["openclaw", "dgx", "vllm", "server-proxy", "no-auth"],
      trustLevel: "trusted",
    }),
    modelDiscoveryEndpoint: "http://dgx-02:8004/v1/models",
  },
  {
    ...createProviderProfile({
      id: "provider_rmas_dgx02",
      name: "RMAS DGX-01",
      kind: "openai",
      baseUrl: "http://100.81.57.88:4041/v1",
      defaultModel: "rmas-sequential-light",
      tags: ["rmas", "dgx", "latent-mas", "server-proxy", "no-auth"],
      trustLevel: "trusted",
    }),
    modelDiscoveryEndpoint: "http://100.81.57.88:4041/v1/models",
  },
  {
    ...createProviderProfile({
      id: "provider_codex_oauth",
      name: "Codex OAuth Session",
      kind: "custom",
      baseUrl: "codex-oauth://dgx-02",
      defaultModel: "codex-session",
      tags: ["oauth", "codex", "dgx", "session", "server-proxy"],
      trustLevel: "trusted",
    }),
    secretRef: createDgxVaultSecretRef("secret_dgx02_codex_oauth", "DGX-02 Codex OAuth Session", "dgx-02:~/.codex/auth.json"),
  },
  {
    ...createProviderProfile({
      id: "provider_claude_code_single_owner",
      name: "Claude Code Single Owner",
      kind: "custom",
      baseUrl: "claude-code-single-owner://local",
      defaultModel: "claude-cli-session",
      tags: ["claude", "cli", "single-owner", "server-proxy", "session"],
      trustLevel: "limited",
    }),
    secretRef: createDgxVaultSecretRef("secret_local_claude_cli", "Claude Code single-owner local session", "local:claude"),
  },
];

export function createInitialProviderProfiles() {
  try {
    if (typeof window === "undefined") {
      return seededProviderProfiles;
    }

    const stored = window.localStorage.getItem(providerProfilesStorageKey);
    if (!stored) {
      window.localStorage.setItem(providerProfilesSeedVersionKey, providerProfilesSeedVersion);
      return seededProviderProfiles;
    }

    const parsed = JSON.parse(stored) as ProviderProfile[];
    if (!Array.isArray(parsed)) {
      return seededProviderProfiles;
    }

    const storedProfiles = parsed
      .filter(
        (profile): profile is ProviderProfile =>
          Boolean(profile) &&
          typeof profile.id === "string" &&
          typeof profile.name === "string" &&
          typeof profile.kind === "string" &&
          typeof profile.enabled === "boolean" &&
          Array.isArray(profile.tags),
      )
      .map(sanitizeProviderProfile)
      .filter((profile) => !isMockProviderProfile(profile));
    if (window.localStorage.getItem(providerProfilesSeedVersionKey) !== providerProfilesSeedVersion) {
      const storedIds = new Set(storedProfiles.map((profile) => profile.id));
      const missingSeeds = seededProviderProfiles.filter((profile) => !storedIds.has(profile.id));
      window.localStorage.setItem(providerProfilesSeedVersionKey, providerProfilesSeedVersion);
      return [...storedProfiles, ...missingSeeds].map(sanitizeProviderProfile);
    }

    return storedProfiles.length > 0 ? storedProfiles : seededProviderProfiles;
  } catch {
    return seededProviderProfiles;
  }
}

function sanitizeProviderProfile(profile: ProviderProfile): ProviderProfile {
  if (profile.id === "provider_grok_oauth_dgx") {
    return {
      ...profile,
      name: "Grok OAuth #1",
    };
  }

  if (profile.id === "provider_grok_oauth_dgx_2") {
    return {
      ...profile,
      name: "Grok OAuth #2",
    };
  }

  if (profile.id === "provider_codex_oauth") {
    return {
      ...profile,
      name: "Codex OAuth Session",
      kind: "custom",
      baseUrl: "codex-oauth://dgx-02",
      defaultModel: "codex-session",
      secretRef:
        profile.secretRef ??
        createDgxVaultSecretRef("secret_dgx02_codex_oauth", "DGX-02 Codex OAuth Session", "dgx-02:~/.codex/auth.json"),
      tags: Array.from(new Set([...profile.tags, "oauth", "codex", "dgx", "session", "server-proxy"])),
      trustLevel: "trusted",
    };
  }

  if (profile.id === "provider_claude_code_single_owner") {
    return {
      ...profile,
      name: "Claude Code Single Owner",
      kind: "custom",
      baseUrl: "claude-code-single-owner://local",
      defaultModel: "claude-cli-session",
      secretRef:
        profile.secretRef ??
        createDgxVaultSecretRef("secret_local_claude_cli", "Claude Code single-owner local session", "local:claude"),
      tags: Array.from(new Set([...profile.tags, "claude", "cli", "single-owner", "server-proxy", "session"])),
      trustLevel: "limited",
    };
  }

  return profile;
}

function isMockProviderProfile(profile: ProviderProfile): boolean {
  return profile.id === "provider_mock_local" || profile.tags.includes("mock");
}

function inferModelInputModalities(modelId: string): ModelDescriptor["inputModalities"] {
  const id = modelId.toLowerCase();
  const modalities: NonNullable<ModelDescriptor["inputModalities"]> = ["text"];

  if (
    id.includes("gpt-5.5-pro") ||
    id.includes("gpt-4.1") ||
    id.includes("gemini") ||
    id.includes("grok") ||
    id.includes("claude") ||
    id.includes("vision") ||
    id.includes("multimodal")
  ) {
    modalities.push("image", "document");
    return Array.from(new Set(modalities));
  }

  if (
    id.includes("rag") ||
    id.includes("coder") ||
    id.includes("qwen") ||
    id.includes("deepseek") ||
    id.includes("kimi") ||
    id.includes("mimo") ||
    id.includes("codex") ||
    id.includes("reviewer")
  ) {
    modalities.push("document");
  }

  return Array.from(new Set(modalities));
}

function createModel(providerProfileId: string, id: string, tags: string[] = []): ModelDescriptor {
  return {
    id,
    name: id,
    providerProfileId,
    contextWindow: 128_000,
    supportsStreaming: true,
    supportsTools: tags.includes("tools"),
    inputModalities: inferModelInputModalities(id),
    tags,
  };
}

export const seededModelCatalog: ModelCatalog = {
  provider_dgx02_vllm: [
    createModel("provider_dgx02_vllm", "qwen36-domain-lora-v5-prisma", ["dgx", "vllm", "rag"]),
  ],
  provider_openai_compat: [
    "gpt-5.5-pro",
    "gpt-5.5-coder",
    "gpt-5.5-mini",
    "gpt-5.5-reasoning",
    "gpt-5.1-pro",
    "gpt-5.1-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "o4-mini",
    "o3",
    "computer-use-preview",
    "realtime-preview",
  ].map((id) => createModel("provider_openai_compat", id, ["openai"])),
  provider_reseller_custom: [
    "claude-code-compatible",
    "claude-opus-reseller",
    "claude-sonnet-reseller",
    "deepseek-r1-proxy",
    "qwen3-coder-proxy",
    "gemini-proxy",
    "kimi-k2-proxy",
    "glm-4.5-proxy",
    "grok-proxy",
  ].map((id) => createModel("provider_reseller_custom", id, ["proxy"])),
  provider_deepseek_dgx: [
    "deepseek-v4-flash",
    "deepseek-v4-pro",
  ].map((id) => createModel("provider_deepseek_dgx", id, ["deepseek", "server-proxy"])),
  provider_openrouter_dgx: [
    "openrouter/auto",
    "anthropic/claude-opus-4.7",
    "openai/gpt-5.5-pro",
    "x-ai/grok-4",
    "deepseek/deepseek-r1",
  ].map((id) => createModel("provider_openrouter_dgx", id, ["openrouter", "server-proxy"])),
  provider_apifun_claude: [
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-code-compatible",
    "claude-sonnet-reseller",
    "claude-haiku-reseller",
  ].map((id) => createModel("provider_apifun_claude", id, ["apikey.fun", "reseller", "server-proxy"])),
  provider_apifun_claude_b: [
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-code-compatible",
    "claude-sonnet-reseller",
    "claude-haiku-reseller",
  ].map((id) => createModel("provider_apifun_claude_b", id, ["apikey.fun", "reseller", "server-proxy"])),
  provider_mimo_token_openai: [
    "mimo-v2.5-pro",
    "mimo-v2.5",
    "mimo-v2.5-asr",
  ].map((id) => createModel("provider_mimo_token_openai", id, ["mimo", "token-plan", "openai-compatible", "server-proxy"])),
  provider_mimo_token_anthropic: [
    "mimo-v2.5-pro",
    "mimo-v2.5",
  ].map((id) => createModel("provider_mimo_token_anthropic", id, ["mimo", "token-plan", "anthropic-compatible", "server-proxy"])),
  provider_grok_oauth_dgx: [
    "grok-oauth-session",
    "grok-4",
    "grok-4-fast",
    "grok-code",
  ].map((id) => createModel("provider_grok_oauth_dgx", id, ["grok", "oauth", "server-proxy", "grok-account-1"])),
  provider_grok_oauth_dgx_2: [
    "grok-oauth-session",
    "grok-4",
    "grok-4-fast",
    "grok-code",
  ].map((id) => createModel("provider_grok_oauth_dgx_2", id, ["grok", "oauth", "server-proxy", "grok-account-2"])),
  provider_openclaw_dgx: [
    "qwen36-heretic",
    "qwen36-domain-lora-v5-prisma",
  ].map((id) => createModel("provider_openclaw_dgx", id, ["openclaw", "dgx", "vllm"])),
  provider_rmas_dgx02: [
    createModel("provider_rmas_dgx02", "rmas-sequential-light", ["rmas", "dgx", "latent-mas"]),
  ],
  provider_codex_oauth: [
    "codex-session",
    "codex-high",
    "codex-medium",
    "codex-low",
    "codex-review",
    "codex-apply-patch",
    "codex-browser",
    "codex-local",
    "codex-dgx",
  ].map((id) => createModel("provider_codex_oauth", id, ["oauth", "codex", "dgx", "session"])),
  provider_claude_code_single_owner: [
    "claude-cli-session",
    "opus",
    "sonnet",
    "haiku",
  ].map((id) => createModel("provider_claude_code_single_owner", id, ["claude", "cli", "single-owner", "server-proxy", "session"])),
};

function createProviderProfileFromRegistryEntry(entry: ProviderRegistryEntry): ProviderProfile {
  return {
    id: entry.providerProfileId,
    name: entry.name,
    kind: entry.kind,
    baseUrl: entry.baseUrl,
    secretRef:
      entry.authMode === "none"
        ? undefined
        : createDgxVaultSecretRef(
            `secret_${entry.providerProfileId}`,
            `${entry.name} DGX-02 credential`,
            entry.secretRefPreview ?? `dgx-02:${entry.providerProfileId}`,
          ),
    modelDiscoveryEndpoint: entry.modelDiscoveryEndpoint,
    defaultModel: entry.selectedModelId ?? entry.defaultModelIds[0],
    enabled: true,
    tags: entry.tags,
    trustLevel: entry.trustLevel,
  };
}

export function createModelDiscoveryFromRegistryEntry(entry: ProviderRegistryEntry): ModelDiscoverySnapshot {
  const models = entry.defaultModelIds.map((modelId) => createModel(entry.providerProfileId, modelId, entry.tags));
  return {
    id: `model_discovery_registry_${entry.providerProfileId}`,
    providerProfileId: entry.providerProfileId,
    status: entry.secretAvailability === "available" ? "succeeded" : "failed",
    source: "remote_probe",
    models,
    selectedModelId: entry.selectedModelId ?? models[0]?.id,
    redactionApplied: true,
    warnings:
      entry.secretAvailability === "available"
        ? ["DGX-02 provider registry metadata merged; raw secrets stay on DGX-02."]
        : [`DGX-02 registry reports ${entry.secretAvailability} provider credential; keep profile selectable but block completion.`],
    createdAt: entry.updatedAt,
  };
}

export function mergeProviderProfilesFromRegistry(
  currentProfiles: ProviderProfile[],
  registry: ProviderRegistrySnapshot,
): ProviderProfile[] {
  const registryProfiles = registry.entries.map(createProviderProfileFromRegistryEntry);
  const registryProfilesById = new Map(registryProfiles.map((profile) => [profile.id, profile]));
  const currentIds = new Set(currentProfiles.map((profile) => profile.id));
  const mergedCurrent = currentProfiles.map((profile) => {
    const registryProfile = registryProfilesById.get(profile.id);
    if (!registryProfile) {
      return profile;
    }

    return {
      ...profile,
      kind: registryProfile.kind,
      baseUrl: registryProfile.baseUrl ?? profile.baseUrl,
      secretRef: registryProfile.secretRef ?? profile.secretRef,
      modelDiscoveryEndpoint: registryProfile.modelDiscoveryEndpoint ?? profile.modelDiscoveryEndpoint,
      defaultModel: registryProfile.defaultModel ?? profile.defaultModel,
      enabled: profile.enabled,
      tags: Array.from(new Set([...profile.tags, ...registryProfile.tags])),
      trustLevel: registryProfile.trustLevel,
    };
  });
  const missingRegistryProfiles = registryProfiles.filter((profile) => !currentIds.has(profile.id));

  return [...mergedCurrent, ...missingRegistryProfiles];
}
