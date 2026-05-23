import type {
  ModelDescriptor,
  ModelDiscoverySnapshot,
  ProviderCredentialInputFormat,
  ProviderCredentialParseResult,
  ProviderKind,
  ProviderProfile,
  ProviderTrustLevel,
  SecretRef,
} from "@ai-orchestrator/protocol";

export type ProviderChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type ProviderCompletionRequest = {
  modelId: string;
  messages: ProviderChatMessage[];
  temperature?: number;
};

export type ProviderCompletionResult = {
  content: string;
  modelId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

export type ProviderAdapter = {
  profile: ProviderProfile;
  discoverModels(): Promise<ModelDescriptor[]>;
  complete(request: ProviderCompletionRequest): Promise<ProviderCompletionResult>;
};

export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return "*".repeat(trimmed.length);
  }

  return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`;
}

export function createSessionSecretRef(rawSecret: string, label = "세션 임시 키"): SecretRef {
  return {
    id: `secret_${crypto.randomUUID()}`,
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
  const trustLevel = detectTrustLevel(providerKind, baseUrl, raw);
  const defaultModel = detectDefaultModel(providerKind, raw);
  const tags = createProviderTags(format, trustLevel, baseUrl);

  return {
    id: `provider_parse_${stableId(`${format}:${baseUrl ?? ""}:${rawSecret ? maskSecret(rawSecret) : "none"}`)}`,
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

  return {
    id: `model_discovery_${stableId(`${profile.id}:${models.map((model) => model.id).join("|")}`)}`,
    providerProfileId: profile.id,
    status: profile.enabled ? "succeeded" : "blocked",
    source: profile.kind === "ollama" || profile.kind === "lmstudio" ? "local" : profile.tags.includes("mock") ? "mock" : "remote_stub",
    models,
    selectedModelId: models[0]?.id,
    redactionApplied: true,
    warnings: createDiscoveryWarnings(profile),
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
        tags: ["conversation", "debate"],
      },
      {
        id: "mock-reviewer",
        name: "Mock Reviewer",
        providerProfileId: this.profile.id,
        contextWindow: 64_000,
        supportsStreaming: false,
        supportsTools: false,
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

function detectTrustLevel(providerKind: ProviderKind, baseUrl: string | undefined, raw: string): ProviderTrustLevel {
  const lower = `${baseUrl ?? ""} ${raw}`.toLowerCase();
  if (providerKind === "ollama" || providerKind === "lmstudio" || lower.includes("api.openai.com")) {
    return "trusted";
  }

  if (providerKind === "openrouter") {
    return "limited";
  }

  if (baseUrl && !lower.includes("api.anthropic.com")) {
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
    profile.kind === "openrouter"
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
    tags: [profile.kind, profile.trustLevel],
  }));
}

function createDiscoveryWarnings(profile: ProviderProfile): string[] {
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
