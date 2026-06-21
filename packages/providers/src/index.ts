import type {
  ModelDescriptor,
  ModelDiscoverySnapshot,
  ProviderCredentialInputFormat,
  ProviderCredentialParseResult,
  ProviderKind,
  ProviderProfile,
  ProviderRuntimeReadiness,
  ProviderTrustLevel,
  SecretRef,
  SecretVaultEntry,
  SecretVaultSnapshot,
} from "@ai-orchestrator/protocol";

export type {
  AdapterRuntimeContext,
  CreateAdapterContextParams,
  LlmAdapter,
} from "./adapter.js";
export { createAdapterContext } from "./adapter.js";
export type {
  AdapterErrorCategory,
  AdapterErrorOptions,
} from "./errors.js";
export { AdapterError, redactSecretsForLog, truncateForLog } from "./errors.js";
export { MockLlmAdapter, type MockLlmAdapterOptions } from "./mockLlmAdapter.js";
export {
  applyOpenAIImageAttachments,
  createOpenAIChatMessages,
  OpenAICompatibleAdapter,
  type AdapterFetchLike,
  type OpenAIChatContentPart,
  type OpenAIChatMessageLike,
  type OpenAICompatibleAdapterOptions,
} from "./openAiCompatibleAdapter.js";
export {
  AnthropicAdapter,
  applyAnthropicImageAttachments,
  extractAnthropicText,
  splitSystemAndMessages,
  type AnthropicAdapterOptions,
  type AnthropicUserContentBlock,
} from "./anthropicAdapter.js";
export {
  createOllamaMessages,
  OllamaAdapter,
  type OllamaAdapterOptions,
} from "./ollamaAdapter.js";

/**
 * @deprecated The legacy adapter shape. New adapters should implement
 * `LlmAdapter` from "./adapter" instead, which aligns with the
 * `ProviderCompletionRequest` schema in @ai-orchestrator/protocol.
 * Removed once every call site migrates (docs/24 decision #6).
 */
export type ProviderChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

/**
 * @deprecated Use `ProviderCompletionRequest` from
 * "@ai-orchestrator/protocol" instead. The two types collided under the
 * same name; the protocol one is the SSOT.
 */
export type ProviderCompletionRequest = {
  modelId: string;
  messages: ProviderChatMessage[];
  temperature?: number;
};

/**
 * @deprecated Use `ProviderCompletionResponse` from
 * "@ai-orchestrator/protocol" instead.
 */
export type ProviderCompletionResult = {
  content: string;
  modelId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

/**
 * @deprecated Use `LlmAdapter` from "./adapter" instead. Kept as a
 * compatibility alias for `seededProviderProfiles[0]` and any other
 * caller that still reads `.profile`. Removed once those callers
 * migrate (docs/24 decision #6).
 */
export type ProviderAdapter = {
  profile: ProviderProfile;
  discoverModels(): Promise<ModelDescriptor[]>;
  complete(request: ProviderCompletionRequest): Promise<ProviderCompletionResult>;
};

/**
 * UUID-like id generator that works in both Node and browser contexts.
 * Uses globalThis.crypto.randomUUID() when available (Node ≥19, all modern
 * browsers, Electron renderer). Falls back to a Math.random-based UUIDv4
 * string for Node 18 test environments without a global crypto.
 */
function generateSecretId(): string {
  const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (g && typeof g.randomUUID === "function") {
    return g.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return "*".repeat(trimmed.length);
  }

  return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`;
}

export function createSessionSecretRef(rawSecret: string, label = "세션 임시 키"): SecretRef {
  return {
    id: `secret_${generateSecretId()}`,
    label,
    scope: "session",
    redactedPreview: maskSecret(rawSecret),
    transient: true,
    createdAt: new Date().toISOString(),
  };
}

export function createProviderProfile(params: {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  rawSecret?: string;
  defaultModel?: string;
  tags?: string[];
  trustLevel?: ProviderProfile["trustLevel"];
}): ProviderProfile {
  return {
    id: params.id,
    name: params.name,
    kind: params.kind,
    baseUrl: params.baseUrl,
    secretRef: params.rawSecret ? createSessionSecretRef(params.rawSecret) : undefined,
    defaultModel: params.defaultModel,
    enabled: true,
    tags: params.tags ?? [],
    trustLevel: params.trustLevel ?? "limited",
  };
}

export function parseProviderCredentialInput(
  rawInput: string,
  createdAt = new Date().toISOString(),
): ProviderCredentialParseResult {
  const raw = rawInput.trim();
  const jsonEnv = parseJsonEnv(raw);
  const env = {
    ...parseShellEnv(raw),
    ...parsePowerShellEnv(raw),
    ...jsonEnv,
  };
  const baseUrl = env.ANTHROPIC_BASE_URL ?? env.OPENAI_BASE_URL ?? env.BASE_URL ?? detectUrl(raw);
  const rawSecret =
    env.ANTHROPIC_AUTH_TOKEN ??
    env.ANTHROPIC_API_KEY ??
    env.OPENAI_API_KEY ??
    env.API_KEY ??
    env.AUTH_TOKEN ??
    detectBearerToken(raw) ??
    detectPlainApiKey(raw);
  const format = detectInputFormat(raw, env, jsonEnv);
  const providerKind = detectProviderKind(raw, env, baseUrl);
  const trustLevel = detectTrustLevel(providerKind, baseUrl);
  const defaultModel = detectDefaultModel(providerKind, raw);
  const tags = createProviderTags(format, trustLevel, baseUrl);

  return {
    id: `provider_parse_${stableId(`${format}:${baseUrl ?? ""}:${rawSecret ?? "none"}`)}`,
    format,
    providerKind,
    profileName: createProfileName(format, providerKind, baseUrl),
    baseUrl,
    authHeader: rawSecret ? "Authorization" : undefined,
    secretRef: rawSecret ? createSessionSecretRef(rawSecret, `${format} secret`) : undefined,
    defaultModel,
    tags,
    trustLevel,
    warnings: createParseWarnings(format, trustLevel, baseUrl, rawSecret),
    createdAt,
  };
}

export function createProviderProfileFromCredentialInput(params: {
  id: string;
  rawInput: string;
  createdAt?: string;
}): { profile: ProviderProfile; parse: ProviderCredentialParseResult } {
  const parse = parseProviderCredentialInput(params.rawInput, params.createdAt);

  return {
    parse,
    profile: {
      id: params.id,
      name: parse.profileName,
      kind: parse.providerKind,
      baseUrl: parse.baseUrl,
      secretRef: parse.secretRef,
      authHeader: parse.authHeader,
      modelDiscoveryEndpoint: createModelDiscoveryEndpoint(parse.providerKind, parse.baseUrl),
      defaultModel: parse.defaultModel,
      enabled: true,
      tags: parse.tags,
      trustLevel: parse.trustLevel,
    },
  };
}

export function discoverModelsForProfile(
  profile: ProviderProfile,
  createdAt = new Date().toISOString(),
): ModelDiscoverySnapshot {
  const models = createDiscoveredModels(profile);
  const source = profile.kind === "ollama" || profile.kind === "lmstudio"
    ? "local"
    : profile.tags.includes("mock")
      ? "mock"
      : profile.tags.includes("dgx") || profile.tags.includes("vllm") || profile.tags.includes("server-proxy")
        ? "remote_probe"
        : "remote_stub";

  return {
    id: `model_discovery_${stableId(`${profile.id}:${models.map((model) => model.id).join("|")}`)}`,
    providerProfileId: profile.id,
    status: profile.enabled ? "succeeded" : "blocked",
    source,
    models,
    selectedModelId: models[0]?.id,
    redactionApplied: true,
    warnings: createDiscoveryWarnings(profile),
    createdAt,
  };
}

export function createSecretVaultSnapshot(
  profiles: ProviderProfile[],
  createdAt = new Date().toISOString(),
): SecretVaultSnapshot {
  const entries = profiles.map((profile) => createSecretVaultEntry(profile, createdAt));

  return {
    id: `secret_vault_${stableId(entries.map((entry) => `${entry.id}:${entry.availability}`).join("|"))}`,
    entries,
    summary: {
      available: entries.filter((entry) => entry.availability === "available").length,
      missing: entries.filter((entry) => entry.availability === "missing").length,
      transient: entries.filter((entry) => entry.transient).length,
      keychainReady: entries.filter((entry) => entry.storage === "macos_keychain" && entry.availability === "available").length,
      dgxVaultReady: entries.filter((entry) => entry.storage === "dgx_vault" && entry.availability === "available").length,
    },
    rawSecretPersisted: false,
    createdAt,
  };
}

export function createProviderRuntimeReadiness(params: {
  profile?: ProviderProfile;
  models: ModelDescriptor[];
  vault: SecretVaultSnapshot;
  selectedModelId?: string;
  createdAt?: string;
}): ProviderRuntimeReadiness {
  const createdAt = params.createdAt ?? new Date().toISOString();
  const profile = params.profile;
  const vaultEntry = profile
    ? params.vault.entries.find((entry) => entry.providerProfileId === profile.id)
    : undefined;
  const executionMode = profile?.tags.includes("mock")
    ? "mock"
    : profile?.kind === "ollama" || profile?.kind === "lmstudio"
      ? "local"
      : "remote";
  const secretAvailability =
    executionMode === "local" || executionMode === "mock" ? "available" : vaultEntry?.availability ?? "missing";
  const modelCount = params.models.length;
  const status = createReadinessStatus({ profile, modelCount, secretAvailability });
  const canRunCompletion = status === "ready" || status === "needs_approval";
  const canUseAutomaticMemory = profile?.trustLevel === "trusted" || executionMode === "local" || executionMode === "mock";

  return {
    id: `provider_readiness_${stableId(`${profile?.id ?? "none"}:${status}:${params.selectedModelId ?? ""}`)}`,
    providerProfileId: profile?.id ?? "provider_pending",
    status,
    executionMode,
    modelCount,
    selectedModelId: params.selectedModelId ?? params.models[0]?.id ?? profile?.defaultModel,
    secretAvailability,
    canRunCompletion,
    canUseAutomaticMemory,
    reason: createReadinessReason({ profile, modelCount, secretAvailability, status }),
    warnings: createReadinessWarnings({ profile, canUseAutomaticMemory, secretAvailability }),
    createdAt,
  };
}

export class MockProviderAdapter implements ProviderAdapter {
  readonly profile: ProviderProfile;

  constructor(profile?: Partial<ProviderProfile>) {
    this.profile = {
      id: "provider_mock_local",
      name: "Mock Local Provider",
      kind: "custom",
      enabled: true,
      tags: ["mock", "local"],
      trustLevel: "trusted",
      defaultModel: "mock-orchestrator",
      ...profile,
    };
  }

  async discoverModels(): Promise<ModelDescriptor[]> {
    return [
      {
        id: "mock-orchestrator",
        name: "Mock Orchestrator",
        providerProfileId: this.profile.id,
        contextWindow: 128_000,
        supportsStreaming: true,
        supportsTools: false,
        inputModalities: ["text", "image", "document"],
        tags: ["conversation", "debate"],
      },
      {
        id: "mock-reviewer",
        name: "Mock Reviewer",
        providerProfileId: this.profile.id,
        contextWindow: 64_000,
        supportsStreaming: false,
        supportsTools: false,
        inputModalities: ["text", "document"],
        tags: ["review", "verification"],
      },
    ];
  }

  async complete(request: ProviderCompletionRequest): Promise<ProviderCompletionResult> {
    const lastUserMessage = [...request.messages].reverse().find((message) => message.role === "user");

    return {
      content: `mock:${lastUserMessage?.content ?? "empty"}`,
      modelId: request.modelId,
      usage: {
        inputTokens: request.messages.reduce((sum, message) => sum + message.content.length, 0),
        outputTokens: 16,
      },
    };
  }
}

function createSecretVaultEntry(profile: ProviderProfile, createdAt: string): SecretVaultEntry {
  const isDgxNoAuth = profile.tags.includes("dgx") && profile.tags.includes("no-auth");
  const isDgxSecretRef = profile.tags.includes("dgx-secret-ref") || profile.secretRef?.redactedPreview.startsWith("dgx-02:");
  const isCliSession = profile.tags.includes("cli");
  const isOAuthSession = profile.tags.includes("oauth");
  const isExpiredSession = profile.tags.includes("oauth-expired");
  const storage = isDgxNoAuth || isDgxSecretRef
    ? "dgx_vault"
    : isOAuthSession
      ? "oauth_session"
      : isCliSession
        ? "session_memory"
      : profile.trustLevel === "trusted" && profile.secretRef?.scope !== "session"
        ? "macos_keychain"
        : profile.trustLevel === "untrusted"
          ? "session_memory"
        : "session_memory";

  return {
    id: `vault_entry_${stableId(`${profile.id}:${profile.secretRef?.id ?? "missing"}`)}`,
    providerProfileId: profile.id,
    secretRefId: profile.secretRef?.id,
    storage,
    availability:
      isExpiredSession
        ? "expired"
        : isDgxNoAuth ||
            isDgxSecretRef ||
            isCliSession ||
            isOAuthSession ||
            profile.kind === "ollama" ||
            profile.kind === "lmstudio" ||
            profile.tags.includes("mock") ||
            profile.secretRef
          ? "available"
          : "missing",
    redactedPreview: profile.secretRef?.redactedPreview,
    transient: isDgxNoAuth || isDgxSecretRef
      ? false
      : isCliSession || isOAuthSession
        ? true
        : (profile.secretRef?.transient ?? profile.trustLevel !== "trusted"),
    createdAt: profile.secretRef?.createdAt ?? createdAt,
    expiresAt: profile.secretRef?.expiresAt,
  };
}

function createReadinessStatus(params: {
  profile?: ProviderProfile;
  modelCount: number;
  secretAvailability: SecretVaultEntry["availability"];
}): ProviderRuntimeReadiness["status"] {
  if (!params.profile || !params.profile.enabled) {
    return "blocked";
  }

  if (params.modelCount === 0) {
    return "blocked";
  }

  if (params.secretAvailability !== "available") {
    return "credential_required";
  }

  if (params.profile.trustLevel === "untrusted") {
    return "needs_approval";
  }

  return "ready";
}

function createReadinessReason(params: {
  profile?: ProviderProfile;
  modelCount: number;
  secretAvailability: SecretVaultEntry["availability"];
  status: ProviderRuntimeReadiness["status"];
}) {
  if (!params.profile) {
    return "provider not selected";
  }

  if (!params.profile.enabled) {
    return "provider disabled";
  }

  if (params.modelCount === 0) {
    return "model discovery has no selectable models";
  }

  if (params.secretAvailability !== "available") {
    return "credential is missing from secret vault";
  }

  if (params.status === "needs_approval") {
    return "untrusted provider can run only after explicit approval and reduced memory context";
  }

  if (params.profile.tags.includes("dgx") || params.profile.tags.includes("vllm")) {
    return "DGX-02 trusted vLLM provider is reachable through the remote runtime gate";
  }

  return "provider has model metadata and a non-persisted secret reference";
}

function createReadinessWarnings(params: {
  profile?: ProviderProfile;
  canUseAutomaticMemory: boolean;
  secretAvailability: SecretVaultEntry["availability"];
}) {
  const warnings: string[] = [];
  if (!params.profile) {
    return ["provider pending"];
  }

  if (!params.canUseAutomaticMemory) {
    warnings.push("automatic project/user memory recall is blocked for this provider");
  }

  if (params.secretAvailability !== "available") {
    warnings.push("secret must be resolved before provider completion");
  }

  if (params.profile.trustLevel === "untrusted") {
    warnings.push("prompt and memory may pass through a custom/reseller endpoint");
  }

  return warnings;
}

function parseJsonEnv(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const env = "env" in parsed && parsed.env && typeof parsed.env === "object" ? parsed.env : parsed;
    return Object.fromEntries(
      Object.entries(env as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([key, value]) => [key, value.trim()]),
    );
  } catch {
    return {};
  }
}

function parseShellEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {};
  const pattern = /(?:export\s+)?([A-Z0-9_]+)=["']?([^"'\r\n]+)["']?/g;
  for (const match of raw.matchAll(pattern)) {
    env[match[1] ?? ""] = (match[2] ?? "").trim();
  }
  return env;
}

function parsePowerShellEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {};
  const pattern = /\$env:([A-Z0-9_]+)\s*=\s*["']([^"']+)["']/gi;
  for (const match of raw.matchAll(pattern)) {
    env[(match[1] ?? "").toUpperCase()] = (match[2] ?? "").trim();
  }
  return env;
}

function detectInputFormat(
  raw: string,
  env: Record<string, string>,
  jsonEnv: Record<string, string>,
): ProviderCredentialInputFormat {
  if (Object.keys(jsonEnv).length > 0) {
    return "claude_code_settings_json";
  }

  if (/\$env:/i.test(raw)) {
    return "powershell_env";
  }

  if (env.OPENAI_API_KEY || env.OPENAI_BASE_URL) {
    return "openai_env";
  }

  if (env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || env.ANTHROPIC_BASE_URL) {
    return "anthropic_env";
  }

  if (detectUrl(raw)) {
    return "custom_base_url";
  }

  if (detectPlainApiKey(raw)) {
    return "plain_api_key";
  }

  return "unknown";
}

function detectProviderKind(raw: string, env: Record<string, string>, baseUrl?: string): ProviderKind {
  const lower = `${raw} ${baseUrl ?? ""}`.toLowerCase();
  if (lower.includes("openrouter")) {
    return "openrouter";
  }

  if (lower.includes("ollama")) {
    return "ollama";
  }

  if (lower.includes("lmstudio") || lower.includes("lm-studio")) {
    return "lmstudio";
  }

  if (env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || lower.includes("anthropic") || lower.includes("claude")) {
    return "anthropic";
  }

  if (env.OPENAI_API_KEY || lower.includes("openai")) {
    return "openai";
  }

  return "custom";
}

/**
 * Parse a base URL's hostname for trust decisions. Accepts scheme-less inputs
 * (treated as https) and returns undefined for anything unparseable — fail
 * closed, so a malformed endpoint is never mistaken for an official host.
 */
function parseHostname(url: string | undefined): string | undefined {
  if (!url) return undefined;
  for (const candidate of [url, `https://${url}`]) {
    try {
      return new URL(candidate).hostname.toLowerCase();
    } catch {
      // try the scheme-prefixed form next
    }
  }
  return undefined;
}

/**
 * True only when `host` IS `domain` or a real subdomain of it. Crucially this
 * rejects lookalikes (`api.openai.com.evil.com`), path embeds
 * (`evil.com/api.anthropic.com`) and userinfo tricks
 * (`api.anthropic.com@evil.com`) that a raw substring match would wrongly trust.
 */
function isHostOfDomain(host: string | undefined, domain: string): boolean {
  if (!host) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * True only for loopback hosts (localhost / 127.0.0.0/8 / ::1). Used to gate the
 * local-runtime trust of ollama/lmstudio: those kinds are detected by a substring
 * of the raw blob, so a remote `https://ollama.evil.com` matches kind=ollama —
 * trusting it by kind alone would over-trust a hostile remote host.
 */
function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  if (host === "localhost" || host === "::1" || host === "[::1]") return true;
  return /^127(?:\.\d{1,3}){3}$/.test(host);
}

function detectTrustLevel(providerKind: ProviderKind, baseUrl: string | undefined): ProviderTrustLevel {
  // Official-endpoint trust is decided on the parsed *hostname* of the base URL,
  // never a substring of the raw blob — otherwise a hostile lookalike host that
  // merely contains "api.openai.com"/"api.anthropic.com" would escape the
  // "untrusted" classification that quarantines it from sensitive memory recall.
  const host = parseHostname(baseUrl);
  // ollama/lmstudio are local-first runtimes whose kind is inferred from a raw
  // substring ("ollama"/"lmstudio"). Trust them only when the endpoint is absent
  // (default local socket) or a loopback host; a remote URL that merely contains
  // the keyword (e.g. https://ollama.evil.com) is a spoof and must fall through
  // to the remote-untrusted path so it cannot receive sensitive memory recall.
  if ((providerKind === "ollama" || providerKind === "lmstudio") && (!baseUrl || isLoopbackHost(host))) {
    return "trusted";
  }
  if (isHostOfDomain(host, "api.openai.com")) {
    return "trusted";
  }

  if (providerKind === "openrouter") {
    // openrouter is a known remote aggregator: classify "limited" (not
    // quarantined) only when the endpoint is the default (absent baseUrl → real
    // openrouter.ai socket) or the genuine openrouter.ai host. A remote endpoint
    // that merely contains "openrouter" as a substring (e.g.
    // https://openrouter.ai.evil.com, https://evil.com/openrouter) is a spoof —
    // it must drop to "untrusted" so it cannot receive sensitive memory recall.
    return !baseUrl || isHostOfDomain(host, "openrouter.ai") ? "limited" : "untrusted";
  }

  if (baseUrl && !isHostOfDomain(host, "api.anthropic.com")) {
    return "untrusted";
  }

  return providerKind === "custom" ? "limited" : "trusted";
}

function detectDefaultModel(providerKind: ProviderKind, raw: string): string {
  const explicitModel = /(?:MODEL|DEFAULT_MODEL|model)\s*[:=]\s*["']?([A-Za-z0-9._:/-]+)/.exec(raw)?.[1];
  if (explicitModel) {
    return explicitModel;
  }

  if (providerKind === "anthropic") {
    return "claude-code-compatible";
  }

  if (providerKind === "openrouter") {
    return "openrouter/auto";
  }

  if (providerKind === "ollama") {
    return "llama3.1:8b";
  }

  if (providerKind === "lmstudio") {
    return "local-model";
  }

  return "gpt-5.5-pro";
}

function detectUrl(raw: string): string | undefined {
  return /https?:\/\/[^\s"']+/.exec(raw)?.[0];
}

function detectBearerToken(raw: string): string | undefined {
  return /Bearer\s+([A-Za-z0-9._:-]+)/i.exec(raw)?.[1];
}

function detectPlainApiKey(raw: string): string | undefined {
  if (/[\s{}=]/.test(raw) && !/^sk-[A-Za-z0-9._-]+$/.test(raw)) {
    return undefined;
  }

  return /\b(sk-[A-Za-z0-9._-]{8,}|ant-[A-Za-z0-9._-]{8,})\b/.exec(raw)?.[0];
}

function createProviderTags(
  format: ProviderCredentialInputFormat,
  trustLevel: ProviderTrustLevel,
  baseUrl?: string,
): string[] {
  return [
    format,
    trustLevel === "untrusted" ? "untrusted" : "profile",
    baseUrl ? "custom-base-url" : "default-endpoint",
  ];
}

function createProfileName(format: ProviderCredentialInputFormat, providerKind: ProviderKind, baseUrl?: string): string {
  if (format === "claude_code_settings_json") {
    return "Claude Code 호환 프로파일";
  }

  if (baseUrl && providerKind === "custom") {
    return "리셀러 호환 API";
  }

  if (providerKind === "openrouter") {
    return "OpenRouter 프로파일";
  }

  if (providerKind === "anthropic") {
    return "Anthropic 호환 프로파일";
  }

  if (providerKind === "openai") {
    return "OpenAI 호환 프로파일";
  }

  return "Custom Provider";
}

function createParseWarnings(
  format: ProviderCredentialInputFormat,
  trustLevel: ProviderTrustLevel,
  baseUrl: string | undefined,
  rawSecret: string | undefined,
): string[] {
  const warnings: string[] = [];
  if (!rawSecret) {
    warnings.push("secret not detected; profile keeps credential pending");
  }

  if (format === "unknown") {
    warnings.push("input format unknown; verify base URL and auth header manually");
  }

  if (trustLevel === "untrusted") {
    warnings.push("custom or reseller endpoint blocks automatic sensitive memory recall");
  }

  if (baseUrl && !baseUrl.endsWith("/v1") && !baseUrl.includes("openrouter")) {
    warnings.push("model discovery will try a /v1/models compatible path later");
  }

  return warnings;
}

function createModelDiscoveryEndpoint(providerKind: ProviderKind, baseUrl?: string) {
  if (providerKind === "openrouter") {
    return "https://openrouter.ai/api/v1/models";
  }

  if (baseUrl) {
    return `${baseUrl.replace(/\/$/, "")}/models`;
  }

  if (providerKind === "openai") {
    return "https://api.openai.com/v1/models";
  }

  return undefined;
}

function createDiscoveredModels(profile: ProviderProfile): ModelDescriptor[] {
  const modelIds =
    profile.tags.includes("deepseek")
      ? [
          profile.defaultModel ?? "deepseek-v4-flash",
          "deepseek-v4-flash",
          "deepseek-v4-pro",
        ]
      : profile.tags.includes("apifun") || profile.tags.includes("apikey.fun")
        ? [
            profile.defaultModel ?? "claude-opus-4-8",
            "claude-opus-4-8",
            "claude-opus-4-7",
            "claude-opus-4-6",
            "claude-code-compatible",
            "claude-sonnet-reseller",
            "claude-haiku-reseller",
          ]
        : profile.tags.includes("grok")
          ? [
              profile.defaultModel ?? "grok-oauth-session",
              "grok-4",
              "grok-4-fast",
              "grok-code",
            ]
          : profile.tags.includes("openclaw")
            ? [
                profile.defaultModel ?? "qwen36-heretic",
                "qwen36-heretic",
                "qwen36-gio-lora-v5-prisma",
              ]
            : profile.tags.includes("cli")
      ? [
          profile.defaultModel ?? "cli-session",
          "codex-cli",
          "claude-code-cli",
          "openclaw-cli",
          "local-shell-agent",
        ]
      : profile.tags.includes("oauth")
        ? [
            profile.defaultModel ?? "oauth-session",
            "codex-session",
            "codex-high",
            "codex-review",
            "claude-oauth-session",
          ]
        : profile.tags.includes("dgx") || profile.tags.includes("vllm")
      ? [
          profile.defaultModel ?? "qwen36-gio-lora-v5-prisma",
          "qwen36-gio-lora-v5-prisma",
        ]
      : profile.kind === "openrouter"
      ? [
          "openrouter/auto",
          "anthropic/claude-opus-4.7",
          "anthropic/claude-sonnet-4.5",
          "openai/gpt-5.5-pro",
          "openai/gpt-5.5-coder",
          "google/gemini-2.5-pro",
          "x-ai/grok-4",
          "deepseek/deepseek-r1",
          "qwen/qwen3-coder",
          "moonshotai/kimi-k2",
        ]
      : profile.kind === "anthropic"
        ? ["claude-code-compatible", "claude-opus-4.7", "claude-sonnet-4.5", "claude-haiku-4.5"]
        : profile.kind === "ollama"
          ? ["llama3.1:8b", "qwen2.5-coder:14b", "deepseek-r1:14b"]
          : profile.kind === "lmstudio"
            ? ["local-model", "qwen3-coder-local", "gemma-local"]
            : profile.kind === "custom" && profile.trustLevel === "untrusted"
              ? [
                  profile.defaultModel ?? "claude-code-compatible",
                  "claude-opus-reseller",
                  "claude-sonnet-reseller",
                  "deepseek-r1-proxy",
                  "qwen3-coder-proxy",
                  "gemini-proxy",
                  "kimi-k2-proxy",
                  "glm-4.5-proxy",
                  "grok-proxy",
                ]
              : [
                  profile.defaultModel ?? "gpt-5.5-pro",
                  "gpt-5.5-pro",
                  "gpt-5.5-coder",
                  "gpt-5.5-mini",
                  "gpt-4.1",
                  "o4-mini",
                  "o3",
                  "realtime-preview",
                ];

  return Array.from(new Set(modelIds)).map((id) => ({
    id,
    name: id,
    providerProfileId: profile.id,
    contextWindow: profile.trustLevel === "untrusted" ? 64_000 : 128_000,
    supportsStreaming: true,
    supportsTools: !id.includes("mini") && !id.includes("haiku"),
    inputModalities: inferModelInputModalities(id),
    tags: [profile.kind, profile.trustLevel],
  }));
}

function inferModelInputModalities(modelId: string): Array<"text" | "image" | "document"> {
  const id = modelId.toLowerCase();
  const modalities: Array<"text" | "image" | "document"> = ["text"];

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
    return modalities;
  }

  if (
    id.includes("rag") ||
    id.includes("coder") ||
    id.includes("qwen") ||
    id.includes("deepseek") ||
    id.includes("kimi") ||
    id.includes("codex")
  ) {
    modalities.push("document");
  }

  return Array.from(new Set(modalities));
}

function createDiscoveryWarnings(profile: ProviderProfile): string[] {
  if (profile.tags.includes("dgx") || profile.tags.includes("vllm")) {
    return ["DGX-02 model registry is trusted; completion still goes through the runtime approval gate"];
  }

  if (profile.tags.includes("cli")) {
    return ["CLI provider is registered as a local/session binding until a runner is attached"];
  }

  if (profile.tags.includes("oauth")) {
    return ["OAuth provider is registered as a session binding; raw tokens stay outside the event log"];
  }

  if (profile.trustLevel === "untrusted") {
    return ["remote model list is a stub until this endpoint is explicitly trusted"];
  }

  if (!profile.secretRef && profile.kind !== "ollama" && profile.kind !== "lmstudio") {
    return ["credential pending; discovery is using static adapter metadata"];
  }

  return [];
}

function stableId(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}

export { ConnectionHealthMonitor } from './connectionHealth.js';
export type { ConnectionHealthMonitorOptions, ConnectionHealthSnapshot, ConnectionStatus, StatusChangeListener } from './connectionHealth.js';
