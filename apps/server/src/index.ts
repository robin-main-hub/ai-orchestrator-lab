import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  DgxHeartbeat,
  EventEnvelope,
  EventStorageSessionIndexResponse,
  EventSyncPullResponse,
  EventSyncPushRequest,
  EventSyncPushResponse,
  ModelDiscoverySnapshot,
  ProviderCompletionMessage,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderKind,
  ProviderRegistryAuthMode,
  ProviderRegistryEntry,
  ProviderRegistrySnapshot,
  ProviderTrustLevel,
  RemoteExecutionRequest,
  RemoteExecutionResponse,
  RuntimeSnapshot,
  SecretAvailability,
} from "@ai-orchestrator/protocol";
import {
  eventSyncPushRequestSchema,
  providerCompletionRequestSchema,
  remoteExecutionRequestSchema,
} from "@ai-orchestrator/protocol";
import {
  CodexCliOAuthAdapter,
  OpenAICompatibleAdapter,
  type CodexExecRunner,
} from "@ai-orchestrator/providers/node";

export type ServerCapability =
  | "health"
  | "model-registry"
  | "provider-registry"
  | "provider-completion-proxy"
  | "vllm-health"
  | "runtime-status"
  | "remote-run-request"
  | "event-storage-sync"
  | "remote-event-stream-placeholder"
  | "memory-sync-placeholder";

export type ServerHealthResponse = {
  service: "ai-orchestrator-dgx-server";
  status: "ok";
  runtime: RuntimeSnapshot;
  capabilities: ServerCapability[];
  eventStorage: ServerEventStorageSnapshot;
};

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type DgxVllmProbeStatus = "connected" | "unreachable";

export type DgxVllmProbe = {
  status: DgxVllmProbeStatus;
  baseUrl: string;
  checkedAt: string;
  latencyMs?: number;
  modelIds: string[];
  error?: string;
};

export type DgxVllmProbeOptions = {
  now?: string;
  vllmBaseUrl?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

const DEFAULT_DGX02_VLLM_BASE_URL = "http://dgx-02:8001/v1";
const DEFAULT_DGX_MODEL_ID = "qwen36-gio-lora-v5-prisma";

type ServerProviderProxyConfig = {
  providerProfileId: string;
  baseUrl: string;
  apiKeyEnvNames: string[];
  envFilePaths?: string[];
  apiKeyFileEnvName?: string;
  defaultKeyFile?: string;
  noAuth?: boolean;
  apiStyle?: "openai_chat" | "anthropic_messages";
  defaultModelIds: string[];
  supportsModelList?: boolean;
  oauthAuthFileEnvName?: string;
  defaultOAuthAuthFile?: string;
  oauthAccountLabel?: string;
};

const serverProviderProxyConfigs: ServerProviderProxyConfig[] = [
  {
    providerProfileId: "provider_deepseek_dgx",
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    apiKeyEnvNames: ["DEEPSEEK_API_KEY"],
    envFilePaths: [
      "~/openclaws/2/env",
      "~/robinclaw/.env",
      "~/openclaws/7/env",
      "~/openclaws/8/env",
      "~/nanoclaw-tg/.env",
      "~/.hermes/.env",
    ],
    apiKeyFileEnvName: "DEEPSEEK_API_KEY_FILE",
    defaultKeyFile: "~/.openclaw/secrets/deepseek.key",
    apiStyle: "openai_chat",
    defaultModelIds: ["deepseek-v4-flash", "deepseek-v4-pro"],
    supportsModelList: true,
  },
  {
    providerProfileId: "provider_openai_compat",
    baseUrl: process.env.OPENAI_COMPAT_BASE_URL ?? process.env.OPENAI_OFFICIAL_BASE_URL ?? "https://api.openai.com/v1",
    apiKeyEnvNames: ["OPENAI_OFFICIAL_API_KEY", "ORCHESTRATOR_OPENAI_API_KEY"],
    apiKeyFileEnvName: "OPENAI_OFFICIAL_API_KEY_FILE",
    apiStyle: "openai_chat",
    defaultModelIds: ["gpt-5.5-pro", "gpt-5.5-coder", "gpt-5.5-mini", "gpt-4.1", "o4-mini", "o3"],
    supportsModelList: true,
  },
  {
    providerProfileId: "provider_openrouter_dgx",
    baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    apiKeyEnvNames: ["OPENROUTER_API_KEY"],
    apiKeyFileEnvName: "OPENROUTER_API_KEY_FILE",
    defaultKeyFile: "~/.openclaw/secrets/openrouter.key",
    apiStyle: "openai_chat",
    defaultModelIds: [
      "openrouter/auto",
      "anthropic/claude-opus-4.7",
      "openai/gpt-5.5-pro",
      "x-ai/grok-4",
      "deepseek/deepseek-r1",
    ],
    supportsModelList: true,
  },
  {
    providerProfileId: "provider_apifun_claude",
    baseUrl: process.env.APIKEYFUN_ANTHROPIC_BASE_URL ?? process.env.APIFUN_BASE_URL ?? "https://api.apikey.fun",
    apiKeyEnvNames: ["ANTHROPIC_API_KEY", "APIKEYFUN_CLAUDE_A_KEY", "APIFUN_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
    envFilePaths: ["~/openclaws/2/env"],
    apiKeyFileEnvName: "APIFUN_API_KEY_FILE",
    defaultKeyFile: "~/.openclaw/secrets/apifun.key",
    apiStyle: "anthropic_messages",
    defaultModelIds: ["claude-opus-4-6", "claude-code-compatible", "claude-sonnet-reseller", "claude-haiku-reseller"],
    supportsModelList: false,
  },
  {
    providerProfileId: "provider_apifun_claude_b",
    baseUrl: process.env.APIKEYFUN_ANTHROPIC_BASE_URL ?? process.env.APIFUN_BASE_URL ?? "https://api.apikey.fun",
    apiKeyEnvNames: ["ANTHROPIC_API_KEY_ALT", "APIKEYFUN_CLAUDE_B_KEY"],
    envFilePaths: ["~/openclaws/2/env"],
    apiKeyFileEnvName: "APIFUN_CLAUDE_B_API_KEY_FILE",
    apiStyle: "anthropic_messages",
    defaultModelIds: ["claude-opus-4-6", "claude-code-compatible", "claude-sonnet-reseller", "claude-haiku-reseller"],
    supportsModelList: false,
  },
  {
    providerProfileId: "provider_apikeyfun_codex",
    baseUrl: process.env.APIKEYFUN_OPENAI_BASE_URL ?? "https://api.apikey.fun/v1",
    apiKeyEnvNames: ["OPENAI_API_KEY", "APIKEYFUN_OPENAI_API_KEY"],
    envFilePaths: ["~/openclaws/2/env"],
    apiKeyFileEnvName: "APIKEYFUN_OPENAI_API_KEY_FILE",
    apiStyle: "openai_chat",
    defaultModelIds: ["gpt-5.5-pro", "gpt-5.5-coder", "gpt-5.5-mini", "gpt-5.5-reasoning"],
    supportsModelList: true,
  },
  {
    providerProfileId: "provider_codex_oauth",
    baseUrl: process.env.CODEX_OAUTH_BASE_URL ?? "codex-oauth://dgx-02",
    apiKeyEnvNames: [],
    noAuth: true,
    apiStyle: "openai_chat",
    defaultModelIds: [
      "codex-session",
      "codex-high",
      "codex-medium",
      "codex-low",
      "codex-review",
      "codex-apply-patch",
      "codex-browser",
      "codex-local",
      "codex-dgx",
    ],
    supportsModelList: false,
    oauthAuthFileEnvName: "CODEX_OAUTH_AUTH_FILE",
    defaultOAuthAuthFile: "~/.codex/auth.json",
    oauthAccountLabel: "codex-oauth",
  },
  {
    providerProfileId: "provider_grok_oauth_dgx",
    baseUrl: process.env.GROK_OPENAI_PROXY_1_BASE_URL ?? process.env.GROK_OPENAI_PROXY_BASE_URL ?? "http://127.0.0.1:18111/v1",
    apiKeyEnvNames: [],
    noAuth: true,
    apiStyle: "openai_chat",
    defaultModelIds: ["grok-oauth-session", "grok-4", "grok-4-fast", "grok-code"],
    supportsModelList: true,
    oauthAuthFileEnvName: "GROK_OAUTH_1_AUTH_FILE",
    defaultOAuthAuthFile: "~/.grok/auth.json",
    oauthAccountLabel: "grok-oauth-1",
  },
  {
    providerProfileId: "provider_grok_oauth_dgx_2",
    baseUrl: process.env.GROK_OPENAI_PROXY_2_BASE_URL ?? "http://127.0.0.1:18112/v1",
    apiKeyEnvNames: [],
    noAuth: true,
    apiStyle: "openai_chat",
    defaultModelIds: ["grok-oauth-session", "grok-4", "grok-4-fast", "grok-code"],
    supportsModelList: true,
    oauthAuthFileEnvName: "GROK_OAUTH_2_AUTH_FILE",
    defaultOAuthAuthFile: "~/.grok2/auth.json",
    oauthAccountLabel: "grok-oauth-2",
  },
  {
    providerProfileId: "provider_openclaw_dgx",
    baseUrl: process.env.OPENCLAW_VLLM_BASE_URL ?? "http://127.0.0.1:8004/v1",
    apiKeyEnvNames: ["OPENCLAW_VLLM_API_KEY"],
    apiKeyFileEnvName: "OPENCLAW_VLLM_API_KEY_FILE",
    noAuth: true,
    apiStyle: "openai_chat",
    defaultModelIds: ["qwen36-heretic", "qwen36-gio-lora-v5-prisma"],
    supportsModelList: true,
  },
];

export type ServerEventStorageState = {
  revision: number;
  eventsById: Map<string, EventEnvelope>;
  eventRevisionsById: Map<string, number>;
  eventsBySession: Map<string, string[]>;
  lastStoredAt?: string;
};

const defaultEventStorageState = createServerEventStorageState();

export type ServerEventStorageRecord = {
  revision: number;
  storedAt: string;
  event: EventEnvelope;
};

export type ServerEventStorageSnapshot = {
  mode: "memory" | "jsonl";
  storageDir: string;
  eventLogPath: string;
  revision: number;
  eventCount: number;
  sessionCount: number;
  lastStoredAt?: string;
  loadedAt: string;
};

export type JsonlServerEventStorage = {
  mode: "jsonl";
  storageDir: string;
  eventLogPath: string;
  loadedAt: string;
  statePromise: Promise<ServerEventStorageState>;
  queue: Promise<void>;
};

export function createRuntimeSnapshot(now = new Date().toISOString(), probe?: DgxVllmProbe): RuntimeSnapshot {
  const vllmReachable = probe?.status !== "unreachable";
  const modelIds = vllmReachable
    ? Array.from(new Set(["remote-workspace", "remote-model-queue", ...(probe?.modelIds.length ? probe.modelIds : [DEFAULT_DGX_MODEL_ID])]))
    : ["remote-workspace", "remote-model-queue"];

  return {
    status: "degraded",
    dgxStatus: vllmReachable ? "online" : "degraded",
    localModelStatus: "offline",
    memorySyncStatus: "syncing",
    runtimeNodes: [
      {
        id: "dgx-02",
        label: "DGX-02",
        role: "main_server",
        status: vllmReachable ? "online" : "degraded",
        isPrimary: true,
        endpoint: "dgx-02",
        models: modelIds,
      },
    ],
    localModels: [],
    syncTopology: {
      authorityNodeId: "dgx-02",
      authorityLabel: "DGX-02",
      eventStoreMode: "dgx02_authoritative_with_client_cache",
      offlineWritePolicy: "append_local_outbox_when_offline",
      conflictPolicy: "dgx02_authority_wins",
      clients: [
        {
          id: "dgx-02",
          label: "DGX-02",
          kind: "server",
          status: vllmReachable ? "online" : "degraded",
          syncRole: "authority",
          localStore: "sqlite",
          outboxMode: "stateless",
          failurePolicy: "compute_degraded",
          outboxCount: 0,
          lastSeenAt: now,
        },
        {
          id: "client_macbook",
          label: "MacBook",
          kind: "macbook",
          status: "online",
          syncRole: "cache_client",
          localStore: "sqlite",
          outboxMode: "offline_cache_outbox",
          failurePolicy: "continue_locally",
          outboxCount: 0,
          lastSeenAt: now,
        },
        {
          id: "client_home_pc",
          label: "Home PC",
          kind: "desktop_pc",
          status: "online",
          syncRole: "cache_client",
          localStore: "sqlite",
          outboxMode: "offline_cache_outbox",
          failurePolicy: "unavailable_without_dgx",
          outboxCount: 0,
          lastSeenAt: now,
        },
      ],
    },
    activeProviderProfileId: undefined,
    recentError: vllmReachable
      ? "remote execution waits for approval tokens"
      : `DGX-02 server reachable but vLLM probe failed: ${probe?.error ?? "unknown error"}`,
    updatedAt: now,
  };
}

export function createHealthResponse(now = new Date().toISOString(), probe?: DgxVllmProbe): ServerHealthResponse {
  return {
    service: "ai-orchestrator-dgx-server",
    status: "ok",
    runtime: createRuntimeSnapshot(now, probe),
    capabilities: [
      "health",
      "model-registry",
      "provider-registry",
      "provider-completion-proxy",
      "vllm-health",
      "runtime-status",
      "remote-run-request",
      "event-storage-sync",
      "remote-event-stream-placeholder",
      "memory-sync-placeholder",
    ],
    eventStorage: createEventStorageSnapshot(defaultEventStorageState, {
      mode: "memory",
      storageDir: "memory",
      eventLogPath: "memory",
      loadedAt: now,
    }),
  };
}

export function createDgxModelDiscovery(now = new Date().toISOString(), probe?: DgxVllmProbe): ModelDiscoverySnapshot {
  const vllmReachable = probe?.status !== "unreachable";
  const modelIds = vllmReachable ? (probe?.modelIds.length ? probe.modelIds : [DEFAULT_DGX_MODEL_ID]) : [];

  return {
    id: "model_discovery_dgx02_vllm_qwen36",
    providerProfileId: "provider_dgx02_vllm",
    status: vllmReachable ? "succeeded" : "failed",
    source: "remote_probe",
    selectedModelId: modelIds[0],
    redactionApplied: true,
    warnings: vllmReachable
      ? ["DGX-02 vLLM registry; completion still requires runtime approval"]
      : [`DGX-02 vLLM probe failed: ${probe?.error ?? "unknown error"}`],
    createdAt: now,
    models: modelIds.map((modelId) => createDgxModelDescriptor(modelId)),
  };
}

export async function probeDgxVllm({
  now = new Date().toISOString(),
  vllmBaseUrl = process.env.DGX02_VLLM_BASE_URL ?? DEFAULT_DGX02_VLLM_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = 1_500,
}: DgxVllmProbeOptions = {}): Promise<DgxVllmProbe> {
  const baseUrl = vllmBaseUrl.replace(/\/$/, "");
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/models`, { method: "GET" }, timeoutMs);
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`vLLM /models failed: ${response.status} ${redactSecretsForLog(rawText.slice(0, 240))}`);
    }

    const parsed = JSON.parse(rawText) as { data?: Array<{ id?: string }> };
    const modelIds = (parsed.data ?? []).map((model) => model.id).filter((modelId): modelId is string => Boolean(modelId));

    return {
      status: "connected",
      baseUrl,
      checkedAt: now,
      latencyMs: Date.now() - startedAt,
      modelIds: modelIds.length ? modelIds : [DEFAULT_DGX_MODEL_ID],
    };
  } catch (error) {
    return {
      status: "unreachable",
      baseUrl,
      checkedAt: now,
      latencyMs: Date.now() - startedAt,
      modelIds: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function createLiveHealthResponse(options: DgxVllmProbeOptions = {}): Promise<ServerHealthResponse> {
  const checkedAt = options.now ?? new Date().toISOString();
  const probe = await probeDgxVllm({ ...options, now: checkedAt });
  return createHealthResponse(checkedAt, probe);
}

export async function createLiveRuntimeSnapshot(options: DgxVllmProbeOptions = {}): Promise<RuntimeSnapshot> {
  const checkedAt = options.now ?? new Date().toISOString();
  const probe = await probeDgxVllm({ ...options, now: checkedAt });
  return createRuntimeSnapshot(checkedAt, probe);
}

export async function createLiveDgxModelDiscovery(options: DgxVllmProbeOptions = {}): Promise<ModelDiscoverySnapshot> {
  const checkedAt = options.now ?? new Date().toISOString();
  const probe = await probeDgxVllm({ ...options, now: checkedAt });
  return createDgxModelDiscovery(checkedAt, probe);
}

export async function createServerProviderModelDiscoveryResponse(
  providerProfileId: string,
  options: DgxProviderCompletionOptions & { timeoutMs?: number } = {},
): Promise<ModelDiscoverySnapshot> {
  const createdAt = options.now ?? new Date().toISOString();
  if (providerProfileId === "provider_dgx02_vllm") {
    return createLiveDgxModelDiscovery({
      now: createdAt,
      vllmBaseUrl: options.vllmBaseUrl,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    });
  }

  const config = serverProviderProxyConfigs.find((candidate) => candidate.providerProfileId === providerProfileId);
  if (!config) {
    return {
      id: `model_discovery_${providerProfileId}_blocked`,
      providerProfileId,
      status: "blocked",
      source: "remote_probe",
      models: [],
      redactionApplied: true,
      warnings: ["provider is not registered in the DGX-02 model discovery allowlist"],
      createdAt,
    };
  }

  const fallbackModels = config.defaultModelIds.map((modelId) => createServerProviderModelDescriptor(config, modelId));
  if (!config.supportsModelList) {
    return {
      id: `model_discovery_${providerProfileId}_static`,
      providerProfileId,
      status: "succeeded",
      source: "remote_probe",
      models: fallbackModels,
      selectedModelId: fallbackModels[0]?.id,
      redactionApplied: true,
      warnings: ["provider uses DGX-02 static model allowlist; remote /models is not required"],
      createdAt,
    };
  }

  const apiKey = config.noAuth ? undefined : await resolveServerProviderApiKey(config);
  if (!config.noAuth && !apiKey) {
    return {
      id: `model_discovery_${providerProfileId}_secret_missing`,
      providerProfileId,
      status: "failed",
      source: "remote_probe",
      models: fallbackModels,
      selectedModelId: fallbackModels[0]?.id,
      redactionApplied: true,
      warnings: ["DGX-02 provider secret was not resolved; using static model fallback"],
      createdAt,
    };
  }

  if (config.apiStyle !== "anthropic_messages") {
    const rawErrors: string[] = [];
    const adapter = new OpenAICompatibleAdapter({
      profileId: config.providerProfileId,
      kind: createServerProviderKind(config),
      baseUrl: config.baseUrl,
      modelIds: config.defaultModelIds,
      supportsModelList: config.supportsModelList,
      requiresAuth: !config.noAuth,
      fetchImpl: options.fetchImpl ?? fetch,
    });
    const models = await adapter.discoverModels({
      resolveSecret: async () => apiKey,
      timeoutMs: options.timeoutMs ?? 1_500,
      onRawError(status, redactedSnippet) {
        rawErrors.push(`${status} ${redactedSnippet}`.trim());
      },
    });
    const fallbackIds = new Set(fallbackModels.map((model) => model.id));
    const fellBackToStatic =
      rawErrors.length > 0 && models.length === fallbackModels.length && models.every((model) => fallbackIds.has(model.id));

    return {
      id: `model_discovery_${providerProfileId}_${models.length || "fallback"}`,
      providerProfileId,
      status: "succeeded",
      source: "remote_probe",
      models: models.length ? models : fallbackModels,
      selectedModelId: (models[0] ?? fallbackModels[0])?.id,
      redactionApplied: true,
      warnings: fellBackToStatic ? [`remote /models failed; using static model fallback: ${rawErrors[0]}`] : [],
      createdAt,
    };
  }

  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/models`;
  try {
    const response = await fetchWithTimeout(
      options.fetchImpl ?? fetch,
      endpoint,
      {
        method: "GET",
        headers: createAnthropicProviderHeaders(apiKey),
      },
      options.timeoutMs ?? 1_500,
    );
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${redactSecretsForLog(rawText.slice(0, 180))}`);
    }

    const parsed = JSON.parse(rawText) as { data?: Array<{ id?: string }> };
    const models = (parsed.data ?? [])
      .map((model) => model.id)
      .filter((modelId): modelId is string => Boolean(modelId))
      .map((modelId) => createServerProviderModelDescriptor(config, modelId));

    return {
      id: `model_discovery_${providerProfileId}_${models.length || "fallback"}`,
      providerProfileId,
      status: "succeeded",
      source: "remote_probe",
      models: models.length ? models : fallbackModels,
      selectedModelId: (models[0] ?? fallbackModels[0])?.id,
      redactionApplied: true,
      warnings: models.length ? [] : ["remote /models returned no models; using static model fallback"],
      createdAt,
    };
  } catch (error) {
    return {
      id: `model_discovery_${providerProfileId}_fallback`,
      providerProfileId,
      status: "succeeded",
      source: "remote_probe",
      models: fallbackModels,
      selectedModelId: fallbackModels[0]?.id,
      redactionApplied: true,
      warnings: [`remote /models failed; using static model fallback: ${error instanceof Error ? error.message : String(error)}`],
      createdAt,
    };
  }
}

export async function createServerProviderRegistrySnapshot(
  options: DgxProviderCompletionOptions = {},
): Promise<ProviderRegistrySnapshot> {
  const createdAt = options.now ?? new Date().toISOString();
  const vllmEntry: ProviderRegistryEntry = {
    providerProfileId: "provider_dgx02_vllm",
    name: "DGX-02 vLLM",
    kind: "openai",
    baseUrl: process.env.DGX02_VLLM_BASE_URL ?? DEFAULT_DGX02_VLLM_BASE_URL,
    trustLevel: "trusted",
    tags: ["dgx", "vllm", "no-auth"],
    defaultModelIds: [DEFAULT_DGX_MODEL_ID],
    selectedModelId: DEFAULT_DGX_MODEL_ID,
    supportsModelList: true,
    apiStyle: "openai_chat",
    authMode: "none",
    secretAvailability: "available",
    modelDiscoveryEndpoint: `${(process.env.DGX02_VLLM_BASE_URL ?? DEFAULT_DGX02_VLLM_BASE_URL).replace(/\/$/, "")}/models`,
    updatedAt: createdAt,
  };
  const proxyEntries = await Promise.all(
    serverProviderProxyConfigs.map((config) => createServerProviderRegistryEntry(config, createdAt)),
  );
  const entries = [vllmEntry, ...proxyEntries];

  return {
    id: `provider_registry_dgx02_${createdAt.replace(/[-:.TZ]/g, "")}`,
    authorityNodeId: "dgx-02",
    entries,
    summary: {
      total: entries.length,
      ready: entries.filter((entry) => entry.secretAvailability === "available").length,
      missingSecrets: entries.filter((entry) => entry.secretAvailability === "missing").length,
      dgxVaultBacked: entries.filter((entry) => entry.authMode === "dgx_secret_ref").length,
      oauthSessions: entries.filter((entry) => entry.authMode === "oauth_session").length,
      noAuth: entries.filter((entry) => entry.authMode === "none").length,
    },
    rawSecretPersisted: false,
    createdAt,
  };
}

async function createServerProviderRegistryEntry(
  config: ServerProviderProxyConfig,
  updatedAt: string,
): Promise<ProviderRegistryEntry> {
  const authMode = createServerProviderRegistryAuthMode(config);
  const secretAvailability = await createServerProviderSecretAvailability(config, authMode, updatedAt);
  const baseTags = createServerProviderTags(config.providerProfileId);
  const tags = secretAvailability === "expired" ? Array.from(new Set([...baseTags, "oauth-expired"])) : baseTags;

  return {
    providerProfileId: config.providerProfileId,
    name: createServerProviderDisplayName(config.providerProfileId),
    kind: createServerProviderKind(config),
    baseUrl: config.baseUrl,
    trustLevel: createServerProviderTrustLevel(config.providerProfileId),
    tags,
    defaultModelIds: config.defaultModelIds,
    selectedModelId: config.defaultModelIds[0],
    supportsModelList: Boolean(config.supportsModelList),
    apiStyle: config.apiStyle ?? "openai_chat",
    authMode,
    secretAvailability,
    secretRefPreview: createServerProviderSecretRefPreview(config, authMode),
    secretSourceRefs: createServerProviderSecretSourceRefs(config, authMode),
    modelDiscoveryEndpoint: config.supportsModelList ? `${config.baseUrl.replace(/\/$/, "")}/models` : undefined,
    updatedAt,
  };
}

async function createServerProviderSecretAvailability(
  config: ServerProviderProxyConfig,
  authMode: ProviderRegistryAuthMode,
  now: string,
): Promise<SecretAvailability> {
  if (authMode === "none") {
    return "available";
  }

  if (authMode === "oauth_session") {
    return resolveServerProviderOAuthAvailability(config, now);
  }

  return (await resolveServerProviderApiKey(config)) ? "available" : "missing";
}

function createDgxModelDescriptor(modelId: string): ModelDiscoverySnapshot["models"][number] {
  return {
    id: modelId,
    name: modelId,
    providerProfileId: "provider_dgx02_vllm",
    contextWindow: 65_536,
    supportsStreaming: true,
    supportsTools: false,
    tags: ["dgx", "vllm", ...(modelId.includes("qwen") ? ["qwen"] : []), ...(modelId.includes("rag") ? ["rag"] : [])],
  };
}

function createServerProviderModelDescriptor(
  config: ServerProviderProxyConfig,
  modelId: string,
): ModelDiscoverySnapshot["models"][number] {
  const multimodal = /gpt-4o|vision|gemini|claude|grok-4|codex-browser/i.test(modelId);
  return {
    id: modelId,
    name: modelId,
    providerProfileId: config.providerProfileId,
    contextWindow: /deepseek|r1/i.test(modelId) ? 64_000 : /claude|grok|codex/i.test(modelId) ? 128_000 : 65_536,
    supportsStreaming: true,
    supportsTools: false,
    inputModalities: multimodal ? ["text", "image", "document"] : ["text", "document"],
    tags: [
      "server-proxy",
      ...(config.providerProfileId.includes("deepseek") ? ["deepseek"] : []),
      ...(config.providerProfileId.includes("apifun") ? ["apikey.fun", "reseller"] : []),
      ...(config.providerProfileId.includes("codex_oauth") ? ["codex", "oauth", "dgx"] : []),
      ...(config.providerProfileId.includes("grok") ? ["grok", "oauth"] : []),
      ...(config.providerProfileId.includes("openclaw") ? ["openclaw", "dgx", "vllm"] : []),
    ],
  };
}

function createServerProviderRegistryAuthMode(config: ServerProviderProxyConfig): ProviderRegistryAuthMode {
  if (config.providerProfileId.includes("grok_oauth") || config.providerProfileId.includes("codex_oauth")) {
    return "oauth_session";
  }

  if (config.noAuth) {
    return "none";
  }

  return "dgx_secret_ref";
}

function createServerProviderDisplayName(providerProfileId: string) {
  const names: Record<string, string> = {
    provider_deepseek_dgx: "DeepSeek DGX-02 Key",
    provider_apifun_claude: "APIKey.fun Claude A",
    provider_apifun_claude_b: "APIKey.fun Claude B",
    provider_apikeyfun_codex: "APIKey.fun Codex/GPT",
    provider_openai_compat: "OpenAI Official",
    provider_openrouter_dgx: "OpenRouter DGX-02 Key",
    provider_codex_oauth: "Codex OAuth Session",
    provider_grok_oauth_dgx: "Grok OAuth #1",
    provider_grok_oauth_dgx_2: "Grok OAuth #2",
    provider_openclaw_dgx: "DGX-02 OpenClaw vLLM",
  };

  return names[providerProfileId] ?? providerProfileId;
}

function createServerProviderKind(config: ServerProviderProxyConfig): ProviderKind {
  if (config.apiStyle === "anthropic_messages") {
    return "anthropic";
  }

  if (config.providerProfileId.includes("openrouter")) {
    return "openrouter";
  }

  if (config.providerProfileId.includes("grok") || config.providerProfileId.includes("codex_oauth")) {
    return "custom";
  }

  return "openai";
}

function createServerProviderTrustLevel(providerProfileId: string): ProviderTrustLevel {
  if (providerProfileId.includes("apifun")) {
    return "untrusted";
  }

  if (providerProfileId.includes("openrouter") || providerProfileId.includes("apikeyfun")) {
    return "limited";
  }

  if (providerProfileId.includes("grok")) {
    return "limited";
  }

  if (providerProfileId.includes("codex_oauth")) {
    return "trusted";
  }

  return "trusted";
}

function createServerProviderTags(providerProfileId: string) {
  if (providerProfileId.includes("deepseek")) {
    return ["dgx-secret-ref", "server-proxy", "deepseek"];
  }

  if (providerProfileId.includes("apifun")) {
    return ["dgx-secret-ref", "server-proxy", "apikey.fun", "reseller"];
  }

  if (providerProfileId.includes("apikeyfun")) {
    return ["dgx-secret-ref", "server-proxy", "apikey.fun", "codex", "openai-compatible"];
  }

  if (providerProfileId.includes("openrouter")) {
    return ["dgx-secret-ref", "server-proxy", "openrouter", "openai-compatible"];
  }

  if (providerProfileId.includes("openai_compat")) {
    return ["dgx-secret-ref", "server-proxy", "openai", "openai-compatible"];
  }

  if (providerProfileId.includes("codex_oauth")) {
    return ["oauth", "codex", "server-proxy", "dgx", "session"];
  }

  if (providerProfileId.includes("grok")) {
    return [
      "oauth",
      "grok",
      "server-proxy",
      "dgx",
      providerProfileId.endsWith("_2") ? "grok-account-2" : "grok-account-1",
    ];
  }

  if (providerProfileId.includes("openclaw")) {
    return ["openclaw", "dgx", "vllm", "server-proxy", "no-auth"];
  }

  return ["server-proxy"];
}

function createServerProviderSecretRefPreview(
  config: ServerProviderProxyConfig,
  authMode: ProviderRegistryAuthMode,
) {
  if (authMode === "none") {
    return undefined;
  }

  if (authMode === "oauth_session") {
    return `dgx-02:${getServerProviderOAuthAuthFilePath(config) ?? "oauth-session"}`;
  }

  return `dgx-02:${config.apiKeyEnvNames[0] ?? config.defaultKeyFile ?? "provider-secret"}`;
}

function createServerProviderSecretSourceRefs(
  config: ServerProviderProxyConfig,
  authMode: ProviderRegistryAuthMode,
): string[] | undefined {
  if (authMode === "none") {
    return undefined;
  }

  if (authMode === "oauth_session") {
    return [
      ...(config.oauthAccountLabel ? [`account:${config.oauthAccountLabel}`] : []),
      ...(getServerProviderOAuthAuthFilePath(config) ? [`file:${getServerProviderOAuthAuthFilePath(config)}`] : []),
    ];
  }

  const refs = [
    ...config.apiKeyEnvNames.map((envName) => `env:${envName}`),
    ...getServerProviderEnvFilePaths(config).map((path) => `file:${path}`),
  ];

  if (config.apiKeyFileEnvName) {
    refs.push(`env:${config.apiKeyFileEnvName}`);
  }

  if (config.defaultKeyFile) {
    refs.push(`file:${config.defaultKeyFile}`);
  }

  return Array.from(new Set(refs));
}

function getServerProviderOAuthAuthFilePath(config: ServerProviderProxyConfig) {
  return config.oauthAuthFileEnvName
    ? process.env[config.oauthAuthFileEnvName] ?? config.defaultOAuthAuthFile
    : config.defaultOAuthAuthFile;
}

async function resolveServerProviderOAuthAvailability(
  config: ServerProviderProxyConfig,
  now: string,
): Promise<SecretAvailability> {
  const authFilePath = getServerProviderOAuthAuthFilePath(config);
  if (!authFilePath) {
    return "missing";
  }

  try {
    const raw = await readFile(expandHomePath(authFilePath), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const entries = parsed && typeof parsed === "object" ? Object.values(parsed as Record<string, unknown>) : [];
    const authRecord = entries.find((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"));
    const expiresAt = typeof authRecord?.expires_at === "string"
      ? authRecord.expires_at
      : typeof authRecord?.expiresAt === "string"
        ? authRecord.expiresAt
        : undefined;

    if (!expiresAt) {
      return "available";
    }

    const expiresAtMs = Date.parse(expiresAt);
    const nowMs = Date.parse(now);
    if (Number.isFinite(expiresAtMs) && Number.isFinite(nowMs) && expiresAtMs <= nowMs) {
      return "expired";
    }

    return "available";
  } catch {
    return "missing";
  }
}

const defaultDgxSystemPrompt =
  "Answer directly in Korean when the user writes Korean. Do not reveal reasoning or a thinking process.";

type AnthropicMessageResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

export type DgxProviderCompletionOptions = {
  now?: string;
  vllmBaseUrl?: string;
  fetchImpl?: FetchLike;
  codexCliRunner?: CodexExecRunner;
};

export async function createDgxProviderCompletionResponse(
  request: ProviderCompletionRequest,
  options: DgxProviderCompletionOptions = {},
): Promise<ProviderCompletionResponse> {
  const vllmBaseUrl = options.vllmBaseUrl ?? process.env.DGX02_VLLM_BASE_URL ?? DEFAULT_DGX02_VLLM_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (request.providerProfileId !== "provider_dgx02_vllm") {
    return createServerProviderProxyCompletionResponse(request, options);
  }

  return createOpenAICompatibleServerCompletion({
    request,
    profileId: "provider_dgx02_vllm",
    kind: "openai",
    baseUrl: vllmBaseUrl,
    modelIds: [DEFAULT_DGX_MODEL_ID],
    requiresAuth: false,
    fetchImpl,
    extraBody: {
      chat_template_kwargs: {
        enable_thinking: false,
      },
    },
  });
}

export async function createServerProviderProxyCompletionResponse(
  request: ProviderCompletionRequest,
  options: DgxProviderCompletionOptions = {},
): Promise<ProviderCompletionResponse> {
  const createdAt = options.now ?? new Date().toISOString();
  const fetchImpl = options.fetchImpl ?? fetch;
  const config = serverProviderProxyConfigs.find((candidate) => candidate.providerProfileId === request.providerProfileId);

  if (!config) {
    return {
      id: `provider_completion_response_${crypto.randomUUID()}`,
      requestId: request.id,
      providerProfileId: request.providerProfileId,
      modelId: request.modelId,
      route: "server_proxy",
      status: "failed",
      error: "provider is not registered in the DGX-02 proxy allowlist",
      createdAt,
    };
  }

  if (config.providerProfileId === "provider_codex_oauth") {
    const adapter = new CodexCliOAuthAdapter({
      profileId: config.providerProfileId,
      codexBinPath:
        process.env.CODEX_BIN_PATH ??
        "~/.codex/packages/standalone/releases/0.132.0-aarch64-unknown-linux-musl/codex",
      codexHome: process.env.CODEX_OAUTH_HOME ?? "~/.codex",
      cwd: process.env.CODEX_OAUTH_CWD,
      defaultTimeoutMs: parsePositiveInteger(process.env.CODEX_CLI_TIMEOUT_MS) ?? 30_000,
      modelIds: config.defaultModelIds,
      runCodexExec: options.codexCliRunner,
    });
    return adapter.complete(
      {
        ...request,
        routePreference: "server_proxy",
      },
      {
        resolveSecret: async () => undefined,
        timeoutMs: parsePositiveInteger(process.env.CODEX_CLI_TIMEOUT_MS) ?? 30_000,
        onRawError(status, redactedSnippet) {
          if (redactedSnippet) {
            console.warn(`Codex OAuth CLI adapter warning (${status}): ${redactedSnippet}`);
          }
        },
      },
    );
  }

  const apiKey = config.noAuth ? undefined : await resolveServerProviderApiKey(config);
  if (!config.noAuth && !apiKey) {
    return {
      id: `provider_completion_response_${crypto.randomUUID()}`,
      requestId: request.id,
      providerProfileId: request.providerProfileId,
      modelId: request.modelId,
      route: "server_proxy",
      status: "failed",
      error: "DGX-02 provider secret was not resolved from env or key file",
      createdAt,
    };
  }

  if (config.apiStyle !== "anthropic_messages") {
    return createOpenAICompatibleServerCompletion({
      request,
      profileId: config.providerProfileId,
      kind: createServerProviderKind(config),
      baseUrl: config.baseUrl,
      modelIds: config.defaultModelIds,
      supportsModelList: config.supportsModelList,
      requiresAuth: !config.noAuth,
      apiKey,
      fetchImpl,
    });
  }

  const endpoint = createAnthropicMessagesEndpoint(config);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: createAnthropicProviderHeaders(apiKey),
      body: JSON.stringify(createAnthropicMessagesRequestBody(request.modelId, request.messages)),
    });
    const rawText = await response.text();

    if (!response.ok) {
      return {
        id: `provider_completion_response_${crypto.randomUUID()}`,
        requestId: request.id,
        providerProfileId: request.providerProfileId,
        modelId: request.modelId,
        route: "server_proxy",
        status: "failed",
        endpoint,
        error: `DGX-02 provider proxy failed: ${response.status} ${redactSecretsForLog(rawText.slice(0, 240))}`,
        createdAt,
      };
    }

    const parsed = JSON.parse(rawText) as AnthropicMessageResponse;
    const content = extractAnthropicMessagesContent(parsed);
    if (!content) {
      return {
        id: `provider_completion_response_${crypto.randomUUID()}`,
        requestId: request.id,
        providerProfileId: request.providerProfileId,
        modelId: request.modelId,
        route: "server_proxy",
        status: "failed",
        endpoint,
        error: "DGX-02 provider proxy returned an empty response",
        createdAt,
      };
    }

    return {
      id: `provider_completion_response_${crypto.randomUUID()}`,
      requestId: request.id,
      providerProfileId: request.providerProfileId,
      modelId: request.modelId,
      route: "server_proxy",
      status: "succeeded",
      content,
      endpoint,
      usage: extractAnthropicMessagesUsage(parsed),
      createdAt,
    };
  } catch (error) {
    return {
      id: `provider_completion_response_${crypto.randomUUID()}`,
      requestId: request.id,
      providerProfileId: request.providerProfileId,
      modelId: request.modelId,
      route: "server_proxy",
      status: "failed",
      endpoint,
      error: error instanceof Error ? error.message : String(error),
      createdAt,
    };
  }
}

function createOpenAICompatibleServerCompletion(params: {
  request: ProviderCompletionRequest;
  profileId: string;
  kind: ProviderKind;
  baseUrl: string;
  modelIds: string[];
  supportsModelList?: boolean;
  requiresAuth: boolean;
  apiKey?: string;
  fetchImpl: FetchLike;
  extraBody?: Record<string, unknown>;
}) {
  const adapter = new OpenAICompatibleAdapter({
    profileId: params.profileId,
    kind: params.kind,
    baseUrl: params.baseUrl,
    modelIds: params.modelIds,
    supportsModelList: params.supportsModelList,
    requiresAuth: params.requiresAuth,
    defaultSystemPrompt: defaultDgxSystemPrompt,
    maxTokens: 512,
    temperature: 0.2,
    extraBody: params.extraBody,
    fetchImpl: params.fetchImpl,
  });

  return adapter.complete(
    {
      ...params.request,
      routePreference: "server_proxy",
    },
    {
      resolveSecret: async () => params.apiKey,
      timeoutMs: 30_000,
      onRawError(status, redactedSnippet) {
        if (redactedSnippet) {
          console.warn(`OpenAI-compatible adapter warning (${status}): ${redactedSnippet}`);
        }
      },
    },
  );
}

function createAnthropicMessagesEndpoint(config: ServerProviderProxyConfig) {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  return `${baseUrl}/v1/messages`;
}

function createAnthropicProviderHeaders(apiKey?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
  };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function createAnthropicMessagesRequestBody(modelId: string, messages: ProviderCompletionMessage[]) {
  return {
    model: modelId,
    system: defaultDgxSystemPrompt,
    messages: messages.slice(-8).map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    })),
    max_tokens: 512,
    temperature: 0.2,
  };
}

function extractAnthropicMessagesContent(parsed: AnthropicMessageResponse) {
  return parsed.content
    ?.map((entry) => entry.text)
    .filter((text): text is string => Boolean(text?.trim()))
    .join("\n")
    .trim();
}

function extractAnthropicMessagesUsage(parsed: AnthropicMessageResponse) {
  const usage = parsed.usage;
  return {
    inputTokens: usage?.input_tokens,
    outputTokens: usage?.output_tokens,
    totalTokens:
      typeof usage?.input_tokens === "number" && typeof usage.output_tokens === "number"
        ? usage.input_tokens + usage.output_tokens
        : undefined,
  };
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function resolveServerProviderApiKey(config: ServerProviderProxyConfig): Promise<string | undefined> {
  for (const envName of config.apiKeyEnvNames) {
    const envValue = process.env[envName]?.trim();
    if (envValue) {
      return envValue;
    }
  }

  const envFileValue = await resolveServerProviderApiKeyFromEnvFiles(config);
  if (envFileValue) {
    return envFileValue;
  }

  const keyFile = (config.apiKeyFileEnvName ? process.env[config.apiKeyFileEnvName] : undefined) ?? config.defaultKeyFile;
  if (!keyFile) {
    return undefined;
  }

  try {
    const raw = await readFile(expandHomePath(keyFile), "utf8");
    return raw.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function resolveServerProviderApiKeyFromEnvFiles(config: ServerProviderProxyConfig): Promise<string | undefined> {
  for (const envFilePath of getServerProviderEnvFilePaths(config)) {
    const env = await readServerProviderEnvFile(envFilePath);
    for (const envName of config.apiKeyEnvNames) {
      const value = env[envName]?.trim();
      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

function getServerProviderEnvFilePaths(config: ServerProviderProxyConfig) {
  return [
    process.env.OPENCLAW_SLOT_ENV_FILE,
    process.env.OPENCLAW_ENV_FILE,
    ...(config.envFilePaths ?? []),
  ].filter((value): value is string => Boolean(value));
}

async function readServerProviderEnvFile(envFilePath: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(expandHomePath(envFilePath), "utf8");
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .map(parseEnvFileLine)
        .filter((entry): entry is [string, string] => Boolean(entry)),
    );
  } catch {
    return {};
  }
}

function parseEnvFileLine(line: string): [string, string] | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return undefined;
  }

  const withoutExport = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
  const separatorIndex = withoutExport.indexOf("=");
  if (separatorIndex <= 0) {
    return undefined;
  }

  const key = withoutExport.slice(0, separatorIndex).trim();
  const rawValue = withoutExport.slice(separatorIndex + 1).trim();
  const value =
    (rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ? rawValue.slice(1, -1)
      : rawValue;

  return [key, value];
}

function expandHomePath(value: string) {
  if (!value.startsWith("~/")) {
    return value;
  }

  return join(process.env.HOME ?? "/home/robin", value.slice(2));
}

export function createDgxHeartbeat(runtime = createRuntimeSnapshot(), checkedAt = new Date().toISOString()): DgxHeartbeat {
  const status =
    runtime.dgxStatus === "online" ? "connected" : runtime.dgxStatus === "degraded" ? "pending" : "unreachable";

  return {
    nodeId: "dgx-02",
    status,
    latencyMs: runtime.dgxStatus === "online" ? 12 : undefined,
    checkedAt,
    message:
      status === "connected"
        ? "dgx-02 authority reachable"
        : status === "pending"
          ? "dgx-02 server reachable; vLLM probe is degraded"
          : "dgx-02 unreachable; local fallback required",
  };
}

export function createRemoteRunResponse(
  request: RemoteExecutionRequest,
  runtime = createRuntimeSnapshot(),
): RemoteExecutionResponse {
  if (request.approvalState !== "approved") {
    return {
      id: `remote_response_${crypto.randomUUID()}`,
      requestId: request.id,
      status: "blocked",
      targetNodeId: request.targetNodeId,
      fallbackMode: "local_cli",
      message: "approval required before DGX remote execution",
      createdAt: new Date().toISOString(),
    };
  }

  if (runtime.dgxStatus !== "online") {
    return {
      id: `remote_response_${crypto.randomUUID()}`,
      requestId: request.id,
      status: "fallback_required",
      targetNodeId: request.targetNodeId,
      fallbackMode: request.kind === "model_inference" ? "local_model" : "local_cli",
      message: "dgx-02 is not reachable; use local fallback",
      createdAt: new Date().toISOString(),
    };
  }

  return {
    id: `remote_response_${crypto.randomUUID()}`,
    requestId: request.id,
    status: "queued",
    targetNodeId: request.targetNodeId,
    fallbackMode: "none",
    message: "remote run accepted into the DGX queue",
    createdAt: new Date().toISOString(),
  };
}

export function createServerEventStorageState(): ServerEventStorageState {
  return {
    revision: 0,
    eventsById: new Map(),
    eventRevisionsById: new Map(),
    eventsBySession: new Map(),
  };
}

export function createJsonlServerEventStorage(storageDir = getDefaultEventStorageDir()): JsonlServerEventStorage {
  const resolvedStorageDir = resolve(storageDir);
  const eventLogPath = join(resolvedStorageDir, "events.jsonl");
  return {
    mode: "jsonl",
    storageDir: resolvedStorageDir,
    eventLogPath,
    loadedAt: new Date().toISOString(),
    statePromise: loadServerEventStorageStateFromJsonl(eventLogPath),
    queue: Promise.resolve(),
  };
}

export async function loadServerEventStorageStateFromJsonl(eventLogPath: string): Promise<ServerEventStorageState> {
  const state = createServerEventStorageState();
  let rawText = "";

  try {
    rawText = await readFile(eventLogPath, "utf8");
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      return state;
    }

    throw error;
  }

  for (const line of rawText.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const record = parseEventStorageRecord(line);
    if (!record || state.eventsById.has(record.event.id)) {
      continue;
    }

    state.revision = Math.max(state.revision, record.revision);
    state.eventsById.set(record.event.id, record.event);
    state.eventRevisionsById.set(record.event.id, record.revision);
    const sessionEvents = state.eventsBySession.get(record.event.sessionId) ?? [];
    sessionEvents.push(record.event.id);
    state.eventsBySession.set(record.event.sessionId, sessionEvents);
    state.lastStoredAt = record.storedAt;
  }

  return state;
}

export async function pushEventsToPersistentServerStorage(
  request: EventSyncPushRequest,
  storage: JsonlServerEventStorage,
  now = new Date().toISOString(),
): Promise<EventSyncPushResponse> {
  return enqueueStorageTask(storage, async () => {
    const state = await storage.statePromise;
    const response = pushEventsToServerStorage(request, state, now);
    await appendAcceptedEventsToJsonl(request, response, storage.eventLogPath, now);
    return response;
  });
}

export async function pullEventsFromPersistentServerStorage(
  sessionId: string,
  storage: JsonlServerEventStorage,
  now = new Date().toISOString(),
  afterRevision = 0,
): Promise<EventSyncPullResponse> {
  const state = await storage.statePromise;
  return pullEventsFromServerStorage(sessionId, state, now, afterRevision);
}

export async function listPersistentEventStorageSessions(
  storage: JsonlServerEventStorage,
  now = new Date().toISOString(),
): Promise<EventStorageSessionIndexResponse> {
  const state = await storage.statePromise;
  return listEventStorageSessions(state, now);
}

export async function createPersistentEventStorageSnapshot(
  storage: JsonlServerEventStorage,
  now = new Date().toISOString(),
): Promise<ServerEventStorageSnapshot> {
  const state = await storage.statePromise;
  return createEventStorageSnapshot(state, {
    mode: storage.mode,
    storageDir: storage.storageDir,
    eventLogPath: storage.eventLogPath,
    loadedAt: storage.loadedAt,
    now,
  });
}

export function createEventStorageSnapshot(
  state: ServerEventStorageState,
  metadata: {
    mode: ServerEventStorageSnapshot["mode"];
    storageDir: string;
    eventLogPath: string;
    loadedAt: string;
    now?: string;
  },
): ServerEventStorageSnapshot {
  return {
    mode: metadata.mode,
    storageDir: metadata.storageDir,
    eventLogPath: metadata.eventLogPath,
    revision: state.revision,
    eventCount: state.eventsById.size,
    sessionCount: state.eventsBySession.size,
    lastStoredAt: state.lastStoredAt,
    loadedAt: metadata.loadedAt,
  };
}

export function pushEventsToServerStorage(
  request: EventSyncPushRequest,
  state = defaultEventStorageState,
  now = new Date().toISOString(),
): EventSyncPushResponse {
  const results = request.events.map((event) => {
    if (event.sessionId !== request.sessionId) {
      return {
        eventId: event.id,
        status: "failed" as const,
        reason: "event_session_mismatch",
      };
    }

    if (containsSecretLikeText(event)) {
      return {
        eventId: event.id,
        status: "failed" as const,
        reason: "raw_secret_pattern_detected",
      };
    }

    const existingEvent = state.eventsById.get(event.id);
    if (!existingEvent) {
      state.revision += 1;
      state.eventsById.set(event.id, event);
      state.eventRevisionsById.set(event.id, state.revision);
      const sessionEvents = state.eventsBySession.get(event.sessionId) ?? [];
      sessionEvents.push(event.id);
      state.eventsBySession.set(event.sessionId, sessionEvents);
      state.lastStoredAt = now;

      return {
        eventId: event.id,
        status: "accepted" as const,
        serverRevision: state.revision,
      };
    }

    const existingRevision = state.eventRevisionsById.get(event.id) ?? state.revision;
    if (fingerprintEvent(existingEvent) === fingerprintEvent(event)) {
      return {
        eventId: event.id,
        status: "duplicate" as const,
        serverRevision: existingRevision,
      };
    }

    return {
      eventId: event.id,
      status: "conflict" as const,
      serverRevision: existingRevision,
      reason: "same_event_id_different_payload",
    };
  });

  return {
    id: `event_sync_response_${crypto.randomUUID()}`,
    requestId: request.id,
    sessionId: request.sessionId,
    serverRevision: state.revision,
    accepted: results.filter((result) => result.status === "accepted").length,
    duplicates: results.filter((result) => result.status === "duplicate").length,
    conflicts: results.filter((result) => result.status === "conflict").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
    createdAt: now,
  };
}

export function pullEventsFromServerStorage(
  sessionId: string,
  state = defaultEventStorageState,
  now = new Date().toISOString(),
  afterRevision = 0,
): EventSyncPullResponse {
  const eventIds = state.eventsBySession.get(sessionId) ?? [];
  const events = eventIds
    .filter((eventId) => (state.eventRevisionsById.get(eventId) ?? 0) > afterRevision)
    .map((eventId) => state.eventsById.get(eventId))
    .filter((event): event is EventEnvelope => Boolean(event))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    sessionId,
    serverRevision: state.revision,
    events,
    createdAt: now,
  };
}

export function listEventStorageSessions(
  state = defaultEventStorageState,
  now = new Date().toISOString(),
): EventStorageSessionIndexResponse {
  const sessions = [...state.eventsBySession.entries()]
    .map(([sessionId, eventIds]) => {
      const events = eventIds
        .map((eventId) => state.eventsById.get(eventId))
        .filter((event): event is EventEnvelope => Boolean(event))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const firstEvent = events[0];
      const lastEvent = events[events.length - 1];
      const sessionMetadata = getSessionMetadata(events);

      return {
        sessionId,
        title: sessionMetadata.title,
        createdByClient: sessionMetadata.createdByClient,
        eventCount: events.length,
        firstEventAt: firstEvent?.createdAt,
        lastEventAt: lastEvent?.createdAt,
        lastEventType: lastEvent?.type,
        sources: uniqueValues(events.map((event) => event.source)),
        sourceTrust: uniqueValues(events.map((event) => event.sourceTrust)),
      };
    })
    .filter((session) => session.eventCount > 0)
    .sort((left, right) => (right.lastEventAt ?? "").localeCompare(left.lastEventAt ?? ""));

  return {
    serverRevision: state.revision,
    sessions,
    createdAt: now,
  };
}

export function startServer(port = Number(process.env.PORT ?? 4317)) {
  const eventStorage = createJsonlServerEventStorage();
  const apiToken = resolveOrchestratorApiToken();
  const expectedAuthorization = `Bearer ${apiToken}`;

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const pathname = requestUrl.pathname;
    const originHeader = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
    const corsHeaders = createCorsHeaders(originHeader);

    const respondJson = (statusCode: number, payload: unknown) => {
      response.writeHead(statusCode, {
        "content-type": "application/json; charset=utf-8",
        ...corsHeaders,
      });
      response.end(JSON.stringify(payload));
    };

    const requireAuth = (): boolean => {
      if (request.headers.authorization === expectedAuthorization) return true;
      respondJson(401, { error: "unauthorized" });
      return false;
    };

    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }

    if (pathname === "/health") {
      const storageSnapshot = await createPersistentEventStorageSnapshot(eventStorage);
      respondJson(200, {
        ...(await createLiveHealthResponse()),
        eventStorage: redactInternalPathsForPublicHealth(storageSnapshot),
      } satisfies ServerHealthResponse);
      return;
    }

    if (!requireAuth()) return;

    if (pathname === "/runtime") {
      respondJson(200, await createLiveRuntimeSnapshot());
      return;
    }

    if (pathname === "/heartbeat") {
      const runtime = await createLiveRuntimeSnapshot();
      respondJson(200, createDgxHeartbeat(runtime));
      return;
    }

    if (pathname === "/models") {
      respondJson(200, await createLiveDgxModelDiscovery());
      return;
    }

    if (pathname === "/provider-models") {
      const providerProfileId = requestUrl.searchParams.get("providerProfileId") ?? "provider_dgx02_vllm";
      respondJson(200, await createServerProviderModelDiscoveryResponse(providerProfileId));
      return;
    }

    if (pathname === "/provider-registry") {
      respondJson(200, await createServerProviderRegistrySnapshot());
      return;
    }

    if (pathname === "/provider-completions" && request.method === "POST") {
      let payload: ProviderCompletionRequest;
      try {
        payload = providerCompletionRequestSchema.parse(await readJsonBody(request)) as ProviderCompletionRequest;
      } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
          respondJson(413, { error: "payload_too_large", limit: error.limit });
          return;
        }
        respondJson(400, {
          error: "invalid_provider_completion_payload",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      const completion = await createDgxProviderCompletionResponse(payload);
      respondJson(completion.status === "succeeded" ? 200 : 502, completion);
      return;
    }

    if (pathname === "/remote-runs" && request.method === "POST") {
      let payload: RemoteExecutionRequest;
      try {
        payload = remoteExecutionRequestSchema.parse(await readJsonBody(request)) as RemoteExecutionRequest;
      } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
          respondJson(413, { error: "payload_too_large", limit: error.limit });
          return;
        }
        respondJson(400, {
          error: "invalid_remote_execution_payload",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      respondJson(202, createRemoteRunResponse(payload));
      return;
    }

    if (pathname === "/events/sync" && request.method === "POST") {
      let payload: EventSyncPushRequest;
      try {
        payload = eventSyncPushRequestSchema.parse(await readJsonBody(request)) as EventSyncPushRequest;
      } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
          respondJson(413, { error: "payload_too_large", limit: error.limit });
          return;
        }
        respondJson(400, {
          error: "invalid_event_sync_payload",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      try {
        respondJson(202, await pushEventsToPersistentServerStorage(payload, eventStorage));
      } catch (error) {
        respondJson(500, {
          error: "event_storage_write_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (pathname === "/events" && request.method === "GET") {
      const sessionId = requestUrl.searchParams.get("sessionId") ?? "session_desktop_001";
      const afterRevision = Number(requestUrl.searchParams.get("afterRevision") ?? 0);
      respondJson(200, await pullEventsFromPersistentServerStorage(sessionId, eventStorage, undefined, afterRevision));
      return;
    }

    if (pathname === "/sessions" && request.method === "GET") {
      respondJson(200, await listPersistentEventStorageSessions(eventStorage));
      return;
    }

    if (pathname === "/event-storage" && request.method === "GET") {
      respondJson(200, await createPersistentEventStorageSnapshot(eventStorage));
      return;
    }

    if (pathname === "/events/stream") {
      response.writeHead(200, {
        "cache-control": "no-cache",
        "content-type": "text/event-stream; charset=utf-8",
        ...corsHeaders,
      });
      response.end(`event: heartbeat\ndata: ${JSON.stringify(createDgxHeartbeat())}\n\n`);
      return;
    }

    respondJson(404, { error: "not_found" });
  });

  server.listen(port, "0.0.0.0");
  return server;
}

async function fetchWithTimeout(fetchImpl: FetchLike, input: string, init: Parameters<FetchLike>[1], timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

const MAX_JSON_BODY_BYTES = 1_048_576;

class RequestBodyTooLargeError extends Error {
  constructor(public limit: number) {
    super(`request body exceeds ${limit} byte limit`);
    this.name = "RequestBodyTooLargeError";
  }
}

async function readJsonBody(request: IncomingMessage) {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    request.resume();
    throw new RequestBodyTooLargeError(MAX_JSON_BODY_BYTES);
  }

  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      request.off("data", onData);
      request.off("end", onEnd);
      callback();
    };

    const onData = (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_JSON_BODY_BYTES) {
        chunks.length = 0;
        settle(() => {
          request.resume();
          reject(new RequestBodyTooLargeError(MAX_JSON_BODY_BYTES));
        });
        return;
      }
      chunks.push(buf);
    };

    const onEnd = () => {
      settle(() => {
        try {
          const rawBody = Buffer.concat(chunks).toString("utf8");
          resolve(rawBody ? JSON.parse(rawBody) : {});
        } catch (error) {
          reject(error);
        }
      });
    };

    request.on("data", onData);
    request.once("end", onEnd);
    request.once("error", (error) => {
      settle(() => reject(error));
    });
  });
}

const DEFAULT_ALLOWED_ORIGINS: ReadonlyArray<string> = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "https://orchestrator.endruin.com",
];

export function resolveAllowedOrigins(): Set<string> {
  const extras = (process.env.ORCHESTRATOR_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set<string>([...DEFAULT_ALLOWED_ORIGINS, ...extras]);
}

const ALLOWED_ORIGINS = resolveAllowedOrigins();
const FALLBACK_ALLOWED_ORIGIN = "http://localhost:5173";
const ALLOWED_METHODS = "GET, HEAD, OPTIONS, POST";

function resolveOrchestratorApiToken(): string {
  const fromEnv = process.env.ORCHESTRATOR_API_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ORCHESTRATOR_API_TOKEN is required in production. Refusing to start without it.",
    );
  }

  const devToken = "dev-orchestrator-token";
  console.warn(
    `[orchestrator-server] ORCHESTRATOR_API_TOKEN not set. Using dev fallback "${devToken}". ` +
      "Do not deploy without setting a real token.",
  );
  return devToken;
}

export function pickAllowedOrigin(originHeader: string | undefined, allowed: Set<string> = ALLOWED_ORIGINS): string {
  return originHeader && allowed.has(originHeader) ? originHeader : FALLBACK_ALLOWED_ORIGIN;
}

export function redactInternalPathsForPublicHealth(
  snapshot: ServerEventStorageSnapshot,
): ServerEventStorageSnapshot {
  return {
    ...snapshot,
    storageDir: "",
    eventLogPath: "",
  };
}

function createCorsHeaders(originHeader?: string) {
  return {
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": ALLOWED_METHODS,
    "access-control-allow-origin": pickAllowedOrigin(originHeader),
    "access-control-allow-credentials": "true",
    "access-control-allow-private-network": "true",
    "access-control-max-age": "600",
    "vary": "Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Access-Control-Request-Private-Network",
  };
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...createCorsHeaders(),
  });
  response.end(JSON.stringify(payload));
}

async function appendAcceptedEventsToJsonl(
  request: EventSyncPushRequest,
  response: EventSyncPushResponse,
  eventLogPath: string,
  storedAt: string,
) {
  const records = response.results
    .filter((result) => result.status === "accepted" && typeof result.serverRevision === "number")
    .map((result): ServerEventStorageRecord | undefined => {
      const event = request.events.find((candidate) => candidate.id === result.eventId);
      if (!event || typeof result.serverRevision !== "number") {
        return undefined;
      }

      return {
        revision: result.serverRevision,
        storedAt,
        event,
      };
    })
    .filter((record): record is ServerEventStorageRecord => Boolean(record));

  if (records.length === 0) {
    return;
  }

  await mkdir(dirname(eventLogPath), { recursive: true });
  await appendFile(eventLogPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
}

async function enqueueStorageTask<T>(storage: JsonlServerEventStorage, task: () => Promise<T>): Promise<T> {
  const nextTask = storage.queue.catch(() => undefined).then(task);
  storage.queue = nextTask.then(
    () => undefined,
    () => undefined,
  );

  return nextTask;
}

function parseEventStorageRecord(line: string): ServerEventStorageRecord | undefined {
  try {
    const parsed = JSON.parse(line) as ServerEventStorageRecord;
    if (
      typeof parsed.revision !== "number" ||
      typeof parsed.storedAt !== "string" ||
      !parsed.event ||
      typeof parsed.event.id !== "string" ||
      typeof parsed.event.sessionId !== "string" ||
      typeof parsed.event.type !== "string"
    ) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

function uniqueValues<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function getSessionMetadata(events: EventEnvelope[]): { title?: string; createdByClient?: string } {
  const createdEvent = events.find((event) => event.type === "session.created");
  const titleEvent = [...events]
    .filter((event) => event.type === "session.created" || event.type === "session.renamed")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const createdPayload = asSessionMetadataPayload(createdEvent);
  const titlePayload = asSessionMetadataPayload(titleEvent);

  return {
    title: titlePayload.title,
    createdByClient:
      typeof createdPayload.createdByClient === "string"
        ? createdPayload.createdByClient
        : typeof createdPayload.sourceClient === "string"
          ? createdPayload.sourceClient
          : undefined,
  };
}

function asSessionMetadataPayload(event: EventEnvelope | undefined): {
  title?: string;
  sourceClient?: string;
  createdByClient?: string;
} {
  if (!event || !event.payload || typeof event.payload !== "object") {
    return {};
  }

  const payload = event.payload as { title?: unknown; sourceClient?: unknown; createdByClient?: unknown };
  return {
    title: typeof payload.title === "string" ? payload.title : undefined,
    sourceClient: typeof payload.sourceClient === "string" ? payload.sourceClient : undefined,
    createdByClient: typeof payload.createdByClient === "string" ? payload.createdByClient : undefined,
  };
}

function getDefaultEventStorageDir() {
  return process.env.EVENT_STORAGE_DIR ?? join(process.cwd(), "data", "events");
}

const SECRET_LIKE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\b(?:claude|anthropic|grok|xai|deepseek|ghp|gho|ghs|ghr|ghu|glpat|pat)[-_][A-Za-z0-9_-]{16,}\b/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /\b(?:API_KEY|AUTH_TOKEN|SECRET|TOKEN|PASSWORD|PRIVATE_KEY)\s*[:=]\s*[^"'\s,}]{4,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

function containsSecretLikeText(value: unknown): boolean {
  const text = fingerprintEvent(value);
  return SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(text));
}

function redactSecretsForLog(text: string): string {
  let masked = text;
  for (const pattern of SECRET_LIKE_PATTERNS) {
    masked = masked.replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`), "<redacted>");
  }
  return masked;
}

function fingerprintEvent(value: unknown): string {
  return stableStringify(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? String(value);
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (import.meta.url === entryPoint) {
  const server = startServer();
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : "unknown";
  console.log(`AI Orchestrator DGX placeholder listening on ${port}`);
}
