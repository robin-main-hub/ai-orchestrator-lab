import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { EventEmitter } from "node:events";
import { z } from "zod";
import { mkdir, readFile, appendFile, writeFile, unlink, rename, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { promisify } from "node:util";
import type {
  AgentDelegationAuthorityLevel,
  AgentDelegationEventPayload,
  AgentDelegationEventType,
  AgentRole,
  ApprovalDecisionRequest,
  ApprovalQueueItem,
  ApprovalRequest,
  ApprovalReplayRequest,
  ApprovalState,
  DgxHeartbeat,
  EventEnvelope,
  EventSource,
  EventStorageSessionIndexResponse,
  EventSyncPullResponse,
  EventSyncPushRequest,
  EventSyncPushResponse,
  ExternalChannel,
  IngressAuthorType,
  IngressConfidence,
  IngressEvent,
  IngressGuardResult,
  IngressGuardStep,
  ModelDiscoverySnapshot,
  PermissionAction,
  PermissionActor,
  PermissionDecision,
  PermissionLevel,
  ProviderCompletionMessage,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderCompletionRoute,
  ProviderKind,
  ProviderRegistryAuthMode,
  ProviderRegistryEntry,
  ProviderRegistrySnapshot,
  ProviderTrustLevel,
  RemoteExecutionRequest,
  RemoteExecutionResponse,
  RedactionPhase,
  RuntimeSnapshot,
  SecretAvailability,
  SourceTrust,
  TerminalCommandEventPayload,
  TerminalCommandEventType,
  TerminalCommandIntent,
  TerminalCommandDispatchState,
  TerminalHostKind,
  TerminalTimelineBlock,
  TerminalPaneOutputCapturedEventPayload,
  TmuxPaneRole,
} from "@ai-orchestrator/protocol";
import {
  agentRoleSchema,
  approvalDecisionRequestSchema,
  approvalRequestSchema,
  codingPacketSchema,
  eventSyncPushRequestSchema,
  parseAgentDelegationEventPayload,
  parseTerminalCommandEventPayload,
  providerCompletionRequestSchema,
  remoteExecutionRequestSchema,
  terminalCommandIntentSchema,
  terminalTimelineBlockSchema,
  type ProviderCompletionChunkEvent,
} from "@ai-orchestrator/protocol";
import {
  ClaudeCliAdapter,
  CodexCliOAuthAdapter,
  AnthropicAdapter,
  OpenAICompatibleAdapter,
  type ClaudeExecRunner,
  type CodexExecRunner,
} from "@ai-orchestrator/providers/node";
import {
  MementoMcpAdapter,
  LocalHeuristicAdapter,
  withTrustEnforcement,
  DgxSimpleMemMemoryAdapter,
} from "@ai-orchestrator/memory";
import type {
  MemoryAdapter,
  MemoryAdapterContext,
  MemoryAdapterKind,
} from "@ai-orchestrator/memory";
import type { LlmAdapter } from "@ai-orchestrator/providers";
import { handleApprovalRoute } from "./routes/approvals.js";
import { handleTmuxRoute } from "./routes/tmux.js";

export type ServerCapability =
  | "health"
  | "model-registry"
  | "provider-registry"
  | "provider-completion-proxy"
  | "agent-delegation-endpoint"
  | "vllm-health"
  | "runtime-status"
  | "remote-run-request"
  | "tmux-dispatch-gate"
  | "tmux-capture-gate"
  | "approval-queue"
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
const DEFAULT_DGX_MODEL_ID = "qwen36-domain-lora-v5-prisma";
const CLAUDE_CODE_SINGLE_OWNER_PROVIDER_ID = "provider_claude_code_single_owner";
const CLAUDE_CODE_BLOCKED_ROUTE_TYPES = new Set([
  "shared",
  "slack_bot",
  "company_webapp",
  "multi_user_openclaw",
  "public_api",
  "scheduled_batch",
]);
const execFileAsync = promisify(execFile);

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

export type ServerPermissionGateResult = {
  action: PermissionAction;
  approvalState: ApprovalState;
  decision: PermissionDecision;
  requestedLevels: PermissionLevel[];
  reason: string;
  costEstimateTokens?: number;
};

export type ServerApprovalDecisionEventPayload = {
  approvalId: string;
  sourceItemId?: string;
  state: Extract<ApprovalState, "approved" | "rejected">;
  actor: PermissionActor;
  reason?: string;
  decidedAt: string;
};

export type ServerApprovalListResponse = {
  approvals: ApprovalRequest[];
  queue: ApprovalQueueItem[];
  summary: {
    pending: number;
    approved: number;
    rejected: number;
    expired: number;
  };
  createdAt: string;
};

export type ServerApprovalReplayResponse =
  | {
      status: "replayed";
      approval: ApprovalRequest;
      replay: ApprovalReplayRequest;
      result: ProviderCompletionResponse | ServerAgentDelegationExecuteResponse | ServerTmuxDispatchResponse;
      eventSync?: EventSyncPushResponse;
    }
  | {
      status: "not_replayed";
      reason: string;
      approval?: ApprovalRequest;
    };

export type ServerIngressInput = {
  id: string;
  sessionId: string;
  channel: ExternalChannel;
  authorType: IngressAuthorType;
  eventType: IngressEvent["eventType"];
  text: string;
  receivedAt: string;
  debounceWindowMs?: number;
  recentTexts?: string[];
};

export type ServerIngressSnapshot = {
  id: string;
  sessionId: string;
  channel: ExternalChannel;
  result: IngressGuardResult;
  approvals: ApprovalRequest[];
  checklist: string[];
  zeroTokenSafety: {
    enabled: boolean;
    cadence: string;
    lastCheck: string;
    pendingCount: number;
  };
};

export type ServerIngressReceiverResponse = {
  snapshot: ServerIngressSnapshot;
  eventSync: EventSyncPushResponse;
  approvals: ApprovalRequest[];
};

export type ServerAgentDelegationAgentRef = {
  agentId: string;
  role: AgentRole;
  providerProfileId: string;
  modelId: string;
  personaName?: string;
  systemPrompt?: string;
};

export type ServerAgentDelegationTarget = ServerAgentDelegationAgentRef & {
  key: string;
};

type ServerDelegateTag = {
  target: string;
  prompt: string;
  raw: string;
  startIndex: number;
  endIndex: number;
};

export type ServerAgentDelegationExecutionMode = "live" | "mock";

export type ServerAgentDelegationExecuteRequest = {
  id: string;
  sessionId: string;
  caller: ServerAgentDelegationAgentRef;
  userMessage: string;
  targets: ServerAgentDelegationTarget[];
  routePreference?: ProviderCompletionRoute;
  maxDelegatesPerTurn?: number;
  approvalState?: ApprovalState;
  permissionDecision?: PermissionDecision;
  executionMode?: ServerAgentDelegationExecutionMode;
  createdAt?: string;
};

export type ServerAgentDelegationOutcome =
  | {
      kind: "succeeded";
      target: string;
      prompt: string;
      targetAgentId: string;
      response: string;
    }
  | {
      kind: "blocked";
      target: string;
      prompt: string;
      reason: string;
    }
  | {
      kind: "unknown_target";
      target: string;
      prompt: string;
    }
  | {
      kind: "self_delegation";
      target: string;
      prompt: string;
    }
  | {
      kind: "failed";
      target: string;
      prompt: string;
      targetAgentId?: string;
      reason: string;
    };

export type ServerAgentDelegationExecuteResponse = {
  id: string;
  sessionId: string;
  initialContent: string;
  finalContent: string;
  shortCircuited: boolean;
  delegations: ServerAgentDelegationOutcome[];
  events: EventEnvelope[];
  eventSync?: EventSyncPushResponse;
  createdAt: string;
};

export type ServerRedactionReport = {
  phase: RedactionPhase;
  redacted: boolean;
  replacementCount: number;
  patternIds: string[];
};

export type ServerTmuxDispatchMode = "record_only" | "execute_if_approved";

export type ServerTmuxDispatchRequest = {
  id: string;
  sessionId: string;
  terminalSessionId: string;
  role: TmuxPaneRole;
  host: TerminalHostKind;
  paneId: string;
  requestedBy: PermissionActor;
  commandPreview: string;
  approvalState: ApprovalState;
  dispatchMode: ServerTmuxDispatchMode;
  tmuxSessionName: string;
  createdAt: string;
};

export type ServerTmuxDispatchSnapshot = {
  intent: TerminalCommandIntent;
  permission: ServerPermissionGateResult;
  approval?: ApprovalRequest;
  events: EventEnvelope[];
  timelineBlocks: TerminalTimelineBlock[];
};

export type ServerTmuxDispatchResult = {
  attempted: boolean;
  status: TerminalCommandDispatchState;
  reason: string;
  stdoutPreview?: string;
  stderrPreview?: string;
};

export type ServerTmuxDispatchResponse = {
  intent: TerminalCommandIntent;
  permission: ServerPermissionGateResult;
  approval?: ApprovalRequest;
  dispatch: ServerTmuxDispatchResult;
  eventSync: EventSyncPushResponse;
  dispatchEventSync?: EventSyncPushResponse;
  timelineBlocks: TerminalTimelineBlock[];
};

export type ServerTmuxPreflightResponse = {
  intent: TerminalCommandIntent;
  permission: ServerPermissionGateResult;
  approval?: ApprovalRequest;
  timelineBlocks: TerminalTimelineBlock[];
  audit: {
    redactionApplied: boolean;
    wouldRecordEvents: string[];
    wouldQueueApproval: boolean;
    wouldAttemptSendKeys: boolean;
    dryRunEnabled: boolean;
    sendKeysEnabled: boolean;
    replayEndpoint?: string;
    checks: Array<{
      id: string;
      status: "pass" | "warn" | "block";
      message: string;
    }>;
  };
};

export type ServerTmuxCaptureRequest = {
  id: string;
  sessionId: string;
  terminalSessionId: string;
  role: TmuxPaneRole;
  host: TerminalHostKind;
  paneId: string;
  requestedBy: PermissionActor;
  lines: number;
  tmuxSessionName: string;
  createdAt: string;
};

export type ServerTmuxCaptureResponse = {
  status: "disabled" | "captured" | "failed";
  reason: string;
  payload?: TerminalPaneOutputCapturedEventPayload;
  eventSync?: EventSyncPushResponse;
  timelineBlocks?: TerminalTimelineBlock[];
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
    providerProfileId: CLAUDE_CODE_SINGLE_OWNER_PROVIDER_ID,
    baseUrl: process.env.CLAUDE_CLI_BASE_URL ?? "claude-code-single-owner://local",
    apiKeyEnvNames: [],
    noAuth: true,
    apiStyle: "openai_chat",
    defaultModelIds: ["claude-cli-session", "opus", "sonnet", "haiku"],
    supportsModelList: false,
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
    defaultModelIds: ["qwen36-heretic", "qwen36-domain-lora-v5-prisma"],
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
      "agent-delegation-endpoint",
      "vllm-health",
      "runtime-status",
      "remote-run-request",
      "tmux-dispatch-gate",
      "tmux-capture-gate",
      "approval-queue",
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

  // anthropic_messages branch: Anthropic has no /v1/models endpoint, so the
  // adapter returns the static modelIds list directly. We still flow it
  // through AnthropicAdapter.discoverModels() to keep the shape and tag
  // policy consistent with how completions will report models.
  const adapter = new AnthropicAdapter({
    profileId: config.providerProfileId,
    baseUrl: config.baseUrl,
    modelIds: config.defaultModelIds,
    requiresAuth: !config.noAuth,
    fetchImpl: options.fetchImpl ?? fetch,
  });
  const models = await adapter.discoverModels({
    resolveSecret: async () => apiKey,
    timeoutMs: options.timeoutMs ?? 1_500,
  });

  return {
    id: `model_discovery_${providerProfileId}_${models.length || "fallback"}`,
    providerProfileId,
    status: "succeeded",
    source: "remote_probe",
    models: models.length ? models : fallbackModels,
    selectedModelId: (models[0] ?? fallbackModels[0])?.id,
    redactionApplied: true,
    warnings: [],
    createdAt,
  };
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

  if (authMode === "local_cli") {
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
  if (config.providerProfileId === "provider_claude_code_single_owner") {
    return "local_cli";
  }

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
    provider_claude_code_single_owner: "Claude Code Single Owner",
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

  if (
    config.providerProfileId.includes("grok") ||
    config.providerProfileId.includes("codex_oauth") ||
    config.providerProfileId === "provider_claude_code_single_owner"
  ) {
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

  if (providerProfileId === "provider_claude_code_single_owner") {
    return "limited";
  }

  if (providerProfileId.includes("codex_oauth")) {
    return "trusted";
  }

  return "trusted";
}

function resolveServerProviderTrustLevel(providerProfileId: string): ProviderTrustLevel | "unknown" {
  if (providerProfileId === "provider_dgx02_vllm") {
    return "trusted";
  }

  const config = serverProviderProxyConfigs.find((candidate) => candidate.providerProfileId === providerProfileId);
  if (!config) {
    return "unknown";
  }

  return createServerProviderTrustLevel(providerProfileId);
}

export function evaluateServerProviderCompletionPermission(
  request: ProviderCompletionRequest,
): ServerPermissionGateResult {
  const config = serverProviderProxyConfigs.find((candidate) => candidate.providerProfileId === request.providerProfileId);
  const trustLevel = resolveServerProviderTrustLevel(request.providerProfileId);
  const requestedLevels: PermissionLevel[] = ["network_access"];
  const costEstimateTokens = estimateProviderCompletionBudgetTokens(request.messages);
  const budgetPolicy = resolveProviderBudgetPolicy();

  if (request.providerProfileId !== "provider_dgx02_vllm" && !config?.noAuth) {
    requestedLevels.push("secret_access");
  }

  const claudeSingleOwnerBlockReason = evaluateClaudeCodeSingleOwnerPolicy(request);
  if (claudeSingleOwnerBlockReason) {
    return {
      action: "provider_completion",
      approvalState: "rejected",
      decision: "deny",
      requestedLevels,
      reason: claudeSingleOwnerBlockReason,
      costEstimateTokens,
    };
  }

  if (request.permissionDecision === "deny" || request.approvalState === "rejected" || request.approvalState === "expired") {
    return {
      action: "provider_completion",
      approvalState: request.approvalState ?? "rejected",
      decision: "deny",
      requestedLevels,
      reason: "provider completion was denied or its approval expired",
      costEstimateTokens,
    };
  }

  if (trustLevel === "unknown") {
    return {
      action: "provider_completion",
      approvalState: "rejected",
      decision: "deny",
      requestedLevels,
      reason: "provider is not registered in the DGX-02 proxy allowlist",
      costEstimateTokens,
    };
  }

  if (costEstimateTokens > budgetPolicy.hardLimitTokens) {
    return {
      action: "provider_completion",
      approvalState: "rejected",
      decision: "deny",
      requestedLevels,
      reason: `provider completion estimate ${costEstimateTokens} tokens exceeds hard limit ${budgetPolicy.hardLimitTokens}`,
      costEstimateTokens,
    };
  }

  if (request.approvalState === "approved") {
    return {
      action: "provider_completion",
      approvalState: "approved",
      decision: "allow",
      requestedLevels,
      reason: "provider completion was explicitly approved",
      costEstimateTokens,
    };
  }

  if (costEstimateTokens >= budgetPolicy.approvalThresholdTokens) {
    return {
      action: "provider_completion",
      approvalState: "required",
      decision: "approval_required",
      requestedLevels,
      reason: `provider completion estimate ${costEstimateTokens} tokens requires budget approval`,
      costEstimateTokens,
    };
  }

  if (trustLevel === "trusted") {
    return {
      action: "provider_completion",
      approvalState: "not_required",
      decision: "allow",
      requestedLevels,
      reason: "trusted DGX-02 provider can run without an extra approval",
      costEstimateTokens,
    };
  }

  return {
    action: "provider_completion",
    approvalState: "required",
    decision: "approval_required",
    requestedLevels,
    reason: `${trustLevel} provider completion requires explicit approval before DGX-02 uses its credential`,
    costEstimateTokens,
  };
}

function evaluateClaudeCodeSingleOwnerPolicy(request: ProviderCompletionRequest): string | undefined {
  if (request.providerProfileId !== CLAUDE_CODE_SINGLE_OWNER_PROVIDER_ID) {
    return undefined;
  }

  if (!isClaudeCodeSingleOwnerProviderEnabled()) {
    return "Claude Code single-owner provider is disabled until ENABLE_CLAUDE_CODE_SINGLE_OWNER_PROVIDER=true";
  }

  const ownerUserId = resolveClaudeCodeOwnerUserId();
  if (!ownerUserId) {
    return "Claude Code single-owner provider requires CLAUDE_CODE_OWNER_USER_ID";
  }

  const requestContext = request.requestContext;
  if (!requestContext?.userId) {
    return "Claude Code single-owner provider requires requestContext.userId";
  }

  if (requestContext.userId !== ownerUserId) {
    return "Claude Code single-owner provider only accepts requests from its configured owner";
  }

  if (CLAUDE_CODE_BLOCKED_ROUTE_TYPES.has(requestContext.routeType ?? "personal")) {
    return `Claude Code single-owner provider blocks shared route type: ${requestContext.routeType}`;
  }

  return undefined;
}

function isClaudeCodeSingleOwnerProviderEnabled() {
  return (
    process.env.ENABLE_CLAUDE_CODE_SINGLE_OWNER_PROVIDER === "true" ||
    process.env.ENABLE_PERSONAL_CLAUDE_CODE_PROVIDER === "true"
  );
}

function resolveClaudeCodeOwnerUserId() {
  return process.env.CLAUDE_CODE_OWNER_USER_ID ?? process.env.OWNER_USER_ID;
}
class ServerAgentDelegationPermissionError extends Error {
  constructor(
    readonly permission: ServerPermissionGateResult,
    readonly approval?: ApprovalRequest,
  ) {
    super(permission.reason);
    this.name = "ServerAgentDelegationPermissionError";
  }
}

export function parseServerAgentDelegationExecuteRequest(
  value: unknown,
  now = new Date().toISOString(),
): ServerAgentDelegationExecuteRequest {
  if (!value || typeof value !== "object") {
    throw new Error("agent delegation payload must be an object");
  }

  const candidate = value as Partial<ServerAgentDelegationExecuteRequest>;
  const sessionId = parseRequiredString(candidate.sessionId, "sessionId", 256);
  const userMessage = parseRequiredString(candidate.userMessage, "userMessage", 200_000);
  const caller = parseServerAgentDelegationAgentRef(candidate.caller, "caller");
  const targets = parseServerAgentDelegationTargets(candidate.targets);
  const id =
    typeof candidate.id === "string" && candidate.id.trim()
      ? candidate.id.trim().slice(0, 256)
      : `agent_delegation_${stableServerId(`${sessionId}:${caller.agentId}:${userMessage}`)}`;
  const routePreference =
    candidate.routePreference === "server_proxy" ||
    candidate.routePreference === "direct_provider" ||
    candidate.routePreference === "local_fallback"
      ? candidate.routePreference
      : "server_proxy";
  const maxDelegatesPerTurn =
    typeof candidate.maxDelegatesPerTurn === "number" && Number.isFinite(candidate.maxDelegatesPerTurn)
      ? Math.max(0, Math.min(10, Math.trunc(candidate.maxDelegatesPerTurn)))
      : 4;
  const executionMode = candidate.executionMode === "mock" ? "mock" : "live";
  const createdAt = typeof candidate.createdAt === "string" && candidate.createdAt.trim() ? candidate.createdAt.trim() : now;

  return {
    id,
    sessionId,
    caller,
    userMessage,
    targets,
    routePreference,
    maxDelegatesPerTurn,
    approvalState: parseOptionalApprovalState(candidate.approvalState),
    permissionDecision: parseOptionalPermissionDecision(candidate.permissionDecision),
    executionMode,
    createdAt,
  };
}

export async function createServerAgentDelegationExecution(
  request: ServerAgentDelegationExecuteRequest,
  options: {
    completeProvider?: (request: ProviderCompletionRequest) => Promise<ProviderCompletionResponse>;
    now?: string;
    generateId?: () => string;
  } = {},
): Promise<ServerAgentDelegationExecuteResponse> {
  const createdAt = request.createdAt ?? options.now ?? new Date().toISOString();
  const now = options.now ?? createdAt;
  const route = request.routePreference ?? "server_proxy";
  const generateId = options.generateId ?? (() => crypto.randomUUID());
  const completeProvider = options.completeProvider ?? createDgxProviderCompletionResponse;
  const targetByKey = createServerAgentDelegationTargetIndex(request.targets);
  const events: EventEnvelope[] = [];

  const initialCompletion = await completeProvider(createServerDelegationProviderRequest({
    id: `provider_completion_${request.id}_initial_${generateId()}`,
    sessionId: request.sessionId,
    agent: request.caller,
    messages: [
      createOptionalSystemMessage(request.caller.systemPrompt),
      { role: "user", content: request.userMessage },
    ].filter((message): message is ProviderCompletionMessage => Boolean(message)),
    route,
    approvalState: request.approvalState,
    permissionDecision: request.permissionDecision,
    createdAt: now,
  }));
  const initialContent = requireSucceededProviderContent(initialCompletion, "caller initial delegation turn");
  const parsedTags = parseServerDelegateTags(initialContent);

  if (parsedTags.length === 0) {
    return {
      id: request.id,
      sessionId: request.sessionId,
      initialContent,
      finalContent: initialContent,
      shortCircuited: true,
      delegations: [],
      events,
      createdAt,
    };
  }

  events.push(createServerAgentDelegationEvent({
    request,
    type: "agent.delegation.detected",
    suffix: "detected",
    payload: {
      sourceAgentId: request.caller.agentId,
      sourceAgentName: createServerAgentDisplayName(request.caller),
      sourceRole: request.caller.role,
      authorityLevel: createServerDelegationAuthorityLevel(request.caller),
      targets: parsedTags.map((tag) => tag.target),
      count: parsedTags.length,
      depthLimit: 1,
    },
    createdAt: now,
  }));

  const delegations: ServerAgentDelegationOutcome[] = [];
  for (let index = 0; index < parsedTags.length; index += 1) {
    const tag = parsedTags[index]!;
    const prompt = tag.prompt;
    if (index >= (request.maxDelegatesPerTurn ?? 4)) {
      const outcome: ServerAgentDelegationOutcome = {
        kind: "blocked",
        target: tag.target,
        prompt,
        reason: "max_delegates_exceeded",
      };
      delegations.push(outcome);
      events.push(createServerAgentDelegationOutcomeEvent(request, "agent.delegation.blocked", outcome, now));
      continue;
    }

    if (isSelfDelegation(request.caller, tag.target)) {
      const outcome: ServerAgentDelegationOutcome = {
        kind: "self_delegation",
        target: tag.target,
        prompt,
      };
      delegations.push(outcome);
      events.push(createServerAgentDelegationOutcomeEvent(request, "agent.delegation.self_blocked", outcome, now));
      continue;
    }

    const target = targetByKey.get(tag.target);
    if (!target) {
      const outcome: ServerAgentDelegationOutcome = {
        kind: "unknown_target",
        target: tag.target,
        prompt,
      };
      delegations.push(outcome);
      events.push(createServerAgentDelegationOutcomeEvent(request, "agent.delegation.unknown_target", outcome, now));
      continue;
    }

    events.push(createServerAgentDelegationEvent({
      request,
      type: "agent.delegation.dispatched",
      suffix: `dispatched_${tag.target}_${index}`,
      payload: {
        sourceAgentId: request.caller.agentId,
        targetAgentId: target.agentId,
        sourceAgentName: createServerAgentDisplayName(request.caller),
        sourceRole: request.caller.role,
        sourcePersonaName: request.caller.personaName,
        authorityLevel: createServerDelegationAuthorityLevel(request.caller),
        depthLimit: 1,
        targetAgentName: createServerAgentDisplayName(target),
        targetRole: target.role,
        targetPersonaName: target.personaName,
        providerProfileId: target.providerProfileId,
        modelId: target.modelId,
        promptLength: prompt.length,
      },
      createdAt: now,
    }));

    try {
      const targetCompletion = await completeProvider(createServerDelegationProviderRequest({
        id: `provider_completion_${request.id}_${tag.target}_${generateId()}`,
        sessionId: request.sessionId,
        agent: target,
        messages: [
          createOptionalSystemMessage(target.systemPrompt),
          {
            role: "user",
            content: buildServerSubAgentDelegationPrompt(request.caller, prompt),
          },
        ].filter((message): message is ProviderCompletionMessage => Boolean(message)),
        route,
        approvalState: request.approvalState,
        permissionDecision: request.permissionDecision,
        createdAt: now,
      }));
      const response = requireSucceededProviderContent(targetCompletion, `delegated target ${tag.target}`);
      const outcome: ServerAgentDelegationOutcome = {
        kind: "succeeded",
        target: tag.target,
        prompt,
        targetAgentId: target.agentId,
        response,
      };
      delegations.push(outcome);
      events.push(createServerAgentDelegationOutcomeEvent(request, "agent.delegation.succeeded", outcome, now));
    } catch (error) {
      const outcome: ServerAgentDelegationOutcome = {
        kind: "failed",
        target: tag.target,
        prompt,
        targetAgentId: target.agentId,
        reason: error instanceof Error ? error.message : String(error),
      };
      delegations.push(outcome);
      events.push(createServerAgentDelegationOutcomeEvent(request, "agent.delegation.failed", outcome, now));
    }
  }

  const followUpCompletion = await completeProvider(createServerDelegationProviderRequest({
    id: `provider_completion_${request.id}_followup_${generateId()}`,
    sessionId: request.sessionId,
    agent: request.caller,
    messages: [
      createOptionalSystemMessage(request.caller.systemPrompt),
      { role: "user", content: request.userMessage },
      { role: "assistant", content: initialContent },
      { role: "user", content: buildServerDelegationFollowUpPrompt(delegations, request.userMessage) },
    ].filter((message): message is ProviderCompletionMessage => Boolean(message)),
    route,
    approvalState: request.approvalState,
    permissionDecision: request.permissionDecision,
    createdAt: now,
  }));
  const finalContent = requireSucceededProviderContent(followUpCompletion, "caller delegation follow-up");

  events.push(createServerAgentDelegationEvent({
    request,
    type: "agent.delegation.followup.completed",
    suffix: "followup_completed",
    payload: {
      sourceAgentId: request.caller.agentId,
      sourceAgentName: createServerAgentDisplayName(request.caller),
      sourceRole: request.caller.role,
      sourcePersonaName: request.caller.personaName,
      authorityLevel: createServerDelegationAuthorityLevel(request.caller),
      outcomeCount: delegations.length,
      succeededCount: delegations.filter((outcome) => outcome.kind === "succeeded").length,
      blockedCount: delegations.filter((outcome) => outcome.kind === "blocked" || outcome.kind === "self_delegation").length,
      responseLength: finalContent.length,
    },
    createdAt: now,
  }));

  return {
    id: request.id,
    sessionId: request.sessionId,
    initialContent,
    finalContent,
    shortCircuited: false,
    delegations,
    events,
    createdAt,
  };
}

async function createServerAgentDelegationCompletionWithGate(
  request: ProviderCompletionRequest,
  storage: JsonlServerEventStorage,
  replay?: ApprovalReplayRequest,
): Promise<ProviderCompletionResponse> {
  const permission = evaluateServerProviderCompletionPermission(request);
  if (permission.decision !== "allow") {
    const approval =
      permission.decision === "approval_required"
        ? createProviderCompletionApprovalRequest(request, permission, new Date().toISOString(), replay)
        : undefined;
    if (approval) {
      await recordApprovalRequestToPersistentServerStorage(approval, storage);
    }
    throw new ServerAgentDelegationPermissionError(permission, approval);
  }
  return createDgxProviderCompletionResponse(request, { eventStorage: storage });
}

function createServerAgentDelegationMockCompletionFactory() {
  let callCount = 0;
  return async (request: ProviderCompletionRequest): Promise<ProviderCompletionResponse> => {
    callCount += 1;
    const content =
      callCount === 1
        ? `채아린이 하위 에이전트에게 확인할게. <delegate to="researcher">${request.messages.at(-1)?.content ?? "조사"}</delegate>`
        : callCount === 2
          ? "마오마오 조사 결과: 핵심 근거 3개와 리스크 1개를 확인했어."
          : "채아린 최종 정리: 하위 에이전트 확인까지 반영해서 바로 실행 가능한 결론으로 묶었어.";
    return {
      id: `provider_completion_response_mock_${callCount}`,
      requestId: request.id,
      providerProfileId: request.providerProfileId,
      modelId: request.modelId,
      route: request.routePreference,
      status: "succeeded",
      content,
      createdAt: request.createdAt,
    };
  };
}

function createServerAgentDelegationEventSyncRequest(
  request: ServerAgentDelegationExecuteRequest,
  events: EventEnvelope[],
  now: string,
): EventSyncPushRequest {
  return {
    id: `event_sync_agent_delegation_${request.id}_${stableServerId(now)}`,
    clientId: "server_agent_delegation_endpoint",
    sessionId: request.sessionId,
    events,
    idempotencyKey: `server_agent_delegation_endpoint:${request.id}:${events.map((event) => event.id).join(",")}`,
    createdAt: now,
  };
}

const DEFAULT_PROVIDER_BUDGET_APPROVAL_TOKENS = 24_000;
const DEFAULT_PROVIDER_BUDGET_HARD_LIMIT_TOKENS = 128_000;
const DEFAULT_PROVIDER_BUDGET_OUTPUT_RESERVE_TOKENS = 1_024;
const PROVIDER_MESSAGE_TOKEN_OVERHEAD = 8;

export function estimateProviderCompletionBudgetTokens(messages: ProviderCompletionRequest["messages"]): number {
  const inputEstimate = messages.reduce((sum, message) => {
    return sum + Math.ceil(message.content.length / 4) + PROVIDER_MESSAGE_TOKEN_OVERHEAD;
  }, 0);
  return inputEstimate + readPositiveIntegerEnv("ORCHESTRATOR_PROVIDER_BUDGET_OUTPUT_RESERVE_TOKENS", DEFAULT_PROVIDER_BUDGET_OUTPUT_RESERVE_TOKENS);
}

function resolveProviderBudgetPolicy() {
  const approvalThresholdTokens = readPositiveIntegerEnv(
    "ORCHESTRATOR_PROVIDER_BUDGET_APPROVAL_TOKENS",
    DEFAULT_PROVIDER_BUDGET_APPROVAL_TOKENS,
  );
  const hardLimitTokens = Math.max(
    approvalThresholdTokens,
    readPositiveIntegerEnv("ORCHESTRATOR_PROVIDER_BUDGET_HARD_LIMIT_TOKENS", DEFAULT_PROVIDER_BUDGET_HARD_LIMIT_TOKENS),
  );
  return {
    approvalThresholdTokens,
    hardLimitTokens,
  };
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function evaluateServerRemoteRunPermission(request: RemoteExecutionRequest): ServerPermissionGateResult {
  const requestedLevels: PermissionLevel[] =
    request.kind === "model_inference" ? ["network_access", "remote_workspace"] : ["run_safe_commands", "remote_workspace"];

  if (request.approvalState === "approved") {
    return {
      action: "remote_workspace",
      approvalState: "approved",
      decision: "allow",
      requestedLevels,
      reason: "remote run was explicitly approved",
    };
  }

  if (request.approvalState === "rejected" || request.approvalState === "expired") {
    return {
      action: "remote_workspace",
      approvalState: request.approvalState,
      decision: "deny",
      requestedLevels,
      reason: "remote run approval was rejected or expired",
    };
  }

  return {
    action: "remote_workspace",
    approvalState: "required",
    decision: "approval_required",
    requestedLevels,
    reason: "remote execution requires approval before DGX-02 queues it",
  };
}

const DEFAULT_APPROVAL_TTL_SECONDS = 86_400;

export function createProviderCompletionApprovalRequest(
  request: ProviderCompletionRequest,
  permission: ServerPermissionGateResult,
  now = new Date().toISOString(),
  replay = createProviderCompletionApprovalReplay(request),
): ApprovalRequest {
  return {
    id: createApprovalId(request.id),
    sessionId: request.sessionId,
    sourceItemId: request.id,
    subjectId: `${request.providerProfileId}:${request.modelId}`,
    actor: actorFromEventSource(request.source),
    channel: request.source,
    sourceTrust: sourceTrustFromEventSource(request.source),
    action: permission.action,
    requestedLevels: permission.requestedLevels,
    decision: permission.decision,
    state: permission.approvalState,
    reason: permission.reason,
    costEstimateTokens: permission.costEstimateTokens,
    replay,
    ttlSeconds: DEFAULT_APPROVAL_TTL_SECONDS,
    createdAt: now,
    expiresAt: addSecondsIso(now, DEFAULT_APPROVAL_TTL_SECONDS),
  };
}

function createProviderCompletionApprovalReplay(request: ProviderCompletionRequest): ApprovalReplayRequest {
  return {
    kind: "provider_completion",
    endpoint: "/provider-completions",
    method: "POST",
    payload: {
      ...request,
      approvalState: "approved",
      permissionDecision: "allow",
    } satisfies ProviderCompletionRequest,
  };
}

function createServerAgentDelegationApprovalReplay(request: ServerAgentDelegationExecuteRequest): ApprovalReplayRequest {
  return {
    kind: "agent_delegation",
    endpoint: "/agent-delegations/execute",
    method: "POST",
    payload: {
      ...request,
      approvalState: "approved",
      permissionDecision: "allow",
    } satisfies ServerAgentDelegationExecuteRequest,
  };
}

export function createRemoteRunApprovalRequest(
  request: RemoteExecutionRequest,
  permission: ServerPermissionGateResult,
  now = new Date().toISOString(),
): ApprovalRequest {
  return {
    id: createApprovalId(request.id),
    sessionId: request.runId,
    sourceItemId: request.id,
    subjectId: `${request.targetNodeId}:${request.kind}`,
    actor: "user",
    channel: "desktop",
    sourceTrust: "trusted",
    action: permission.action,
    requestedLevels: permission.requestedLevels,
    decision: permission.decision,
    state: permission.approvalState,
    reason: permission.reason,
    ttlSeconds: DEFAULT_APPROVAL_TTL_SECONDS,
    createdAt: now,
    expiresAt: addSecondsIso(now, DEFAULT_APPROVAL_TTL_SECONDS),
  };
}

const TMUX_PANE_ROLES: TmuxPaneRole[] = [
  "discussion",
  "orchestrator",
  "status",
  "code",
  "architect",
  "frontend",
  "backend",
  "qa",
  "research",
  "memory",
];

const TERMINAL_HOST_KINDS: TerminalHostKind[] = ["local_mac", "home_pc", "dgx_02", "dgx_01_locked"];

export function parseServerTmuxDispatchRequest(value: unknown, now = new Date().toISOString()): ServerTmuxDispatchRequest {
  if (!value || typeof value !== "object") {
    throw new Error("tmux dispatch payload must be an object");
  }

  const candidate = value as Partial<ServerTmuxDispatchRequest>;
  const commandPreview = typeof candidate.commandPreview === "string" ? candidate.commandPreview.trim() : "";
  if (!commandPreview) {
    throw new Error("commandPreview is required");
  }
  if (commandPreview.length > 8_000) {
    throw new Error("commandPreview must be 8000 characters or fewer");
  }

  const role = parseTmuxPaneRole(candidate.role);
  const sessionId = typeof candidate.sessionId === "string" && candidate.sessionId.trim() ? candidate.sessionId.trim() : "session_desktop_001";
  const terminalSessionId =
    typeof candidate.terminalSessionId === "string" && candidate.terminalSessionId.trim()
      ? candidate.terminalSessionId.trim()
      : "terminal_session_ai_swarm";
  const paneId = typeof candidate.paneId === "string" && candidate.paneId.trim() ? candidate.paneId.trim() : `role:${role}`;
  const requestedBy = parsePermissionActor(candidate.requestedBy);
  const approvalState = parseApprovalState(candidate.approvalState);
  const dispatchMode =
    candidate.dispatchMode === "execute_if_approved" || candidate.dispatchMode === "record_only"
      ? candidate.dispatchMode
      : "record_only";
  const host = parseTerminalHostKind(candidate.host);
  const tmuxSessionName =
    typeof candidate.tmuxSessionName === "string" && candidate.tmuxSessionName.trim()
      ? candidate.tmuxSessionName.trim()
      : "ai-swarm";
  const id =
    typeof candidate.id === "string" && candidate.id.trim()
      ? candidate.id.trim()
      : `tmux_dispatch_${stableServerId(`${sessionId}:${terminalSessionId}:${role}:${commandPreview}`)}`;
  const createdAt = typeof candidate.createdAt === "string" && candidate.createdAt.trim() ? candidate.createdAt.trim() : now;

  return {
    id,
    sessionId,
    terminalSessionId,
    role,
    host,
    paneId,
    requestedBy,
    commandPreview,
    approvalState,
    dispatchMode,
    tmuxSessionName,
    createdAt,
  };
}

export function evaluateServerTmuxDispatchPermission(request: ServerTmuxDispatchRequest): ServerPermissionGateResult {
  const requestedLevels = detectTmuxDispatchPermissions(request);
  const rawSecretPatternFound = containsSecretLikeText(request.commandPreview);

  if (rawSecretPatternFound) {
    return {
      action: "terminal_run",
      approvalState: "rejected",
      decision: "deny",
      requestedLevels,
      reason: "tmux command text appears to contain a raw secret and will not be dispatched",
    };
  }

  if (request.host === "dgx_01_locked") {
    return {
      action: "terminal_run",
      approvalState: "rejected",
      decision: "deny",
      requestedLevels,
      reason: "DGX-01 is locked and cannot receive tmux dispatches from this orchestrator",
    };
  }

  if (request.approvalState === "approved") {
    return {
      action: "terminal_run",
      approvalState: "approved",
      decision: "allow",
      requestedLevels,
      reason: "tmux dispatch was explicitly approved",
    };
  }

  if (request.approvalState === "rejected" || request.approvalState === "expired") {
    return {
      action: "terminal_run",
      approvalState: request.approvalState,
      decision: "deny",
      requestedLevels,
      reason: "tmux dispatch approval was rejected or expired",
    };
  }

  return {
    action: "terminal_run",
    approvalState: "required",
    decision: "approval_required",
    requestedLevels,
    reason: "tmux dispatch requires explicit approval before send-keys can run",
  };
}

export function createServerTmuxDispatchSnapshot(
  request: ServerTmuxDispatchRequest,
  now = new Date().toISOString(),
): ServerTmuxDispatchSnapshot {
  const permission = evaluateServerTmuxDispatchPermission(request);
  const redactedCommandPreview = redactForServerPhase(request.commandPreview, "pre_store").value;
  const dispatchState = createTmuxIntentDispatchState(request, permission);
  const intent = terminalCommandIntentSchema.parse({
    id: request.id,
    sessionId: request.sessionId,
    terminalSessionId: request.terminalSessionId,
    paneId: request.paneId,
    requestedBy: request.requestedBy,
    commandPreview: redactedCommandPreview,
    redactedCommandPreview,
    requestedPermissions: permission.requestedLevels,
    approvalState: permission.approvalState,
    dispatchState,
    blockedReason: permission.decision === "deny" ? permission.reason : undefined,
    createdAt: request.createdAt,
  }) as TerminalCommandIntent;
  const approval =
    permission.decision === "approval_required" ? createTmuxDispatchApprovalRequest(request, permission, now) : undefined;
  const events: EventEnvelope[] = [
    createTmuxCommandIntentEvent(intent, request.role, request.host, request.tmuxSessionName),
  ];

  if (permission.decision === "deny") {
    events.push(createTmuxCommandBlockedEvent(intent, permission.reason, request.role, request.host, now));
  }

  if (approval) {
    events.push(createApprovalRequestedEvent(approval));
  }
  const timelineBlocks = createTmuxDispatchTimelineBlocks(request, intent, permission, approval, events, now);

  return {
    intent,
    permission,
    approval,
    events,
    timelineBlocks,
  };
}

export function createServerTmuxPreflightResponse(
  request: ServerTmuxDispatchRequest,
  now = new Date().toISOString(),
): ServerTmuxPreflightResponse {
  const snapshot = createServerTmuxDispatchSnapshot(request, now);
  const sendKeysEnabled = process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS === "1";
  const dryRunEnabled = process.env.ORCHESTRATOR_TMUX_DRY_RUN === "1";
  const wouldAttemptSendKeys =
    snapshot.permission.decision === "allow" &&
    request.dispatchMode === "execute_if_approved" &&
    sendKeysEnabled &&
    !dryRunEnabled;

  return {
    intent: snapshot.intent,
    permission: snapshot.permission,
    approval: snapshot.approval,
    timelineBlocks: snapshot.timelineBlocks,
    audit: {
      redactionApplied: snapshot.intent.commandPreview !== snapshot.intent.redactedCommandPreview,
      wouldRecordEvents: snapshot.events.map((event) => event.type),
      wouldQueueApproval: Boolean(snapshot.approval),
      wouldAttemptSendKeys,
      dryRunEnabled,
      sendKeysEnabled,
      replayEndpoint: snapshot.approval?.replay?.endpoint,
      checks: [
        {
          id: "redaction",
          status: snapshot.intent.commandPreview === snapshot.intent.redactedCommandPreview ? "pass" : "warn",
          message:
            snapshot.intent.commandPreview === snapshot.intent.redactedCommandPreview
              ? "command preview contains no redacted secret-like text"
              : "command preview will be redacted before persistence",
        },
        {
          id: "permission",
          status:
            snapshot.permission.decision === "deny"
              ? "block"
              : snapshot.permission.decision === "approval_required"
                ? "warn"
                : "pass",
          message: snapshot.permission.reason,
        },
        {
          id: "dispatch_mode",
          status: request.dispatchMode === "execute_if_approved" ? "warn" : "pass",
          message:
            request.dispatchMode === "execute_if_approved"
              ? "approved replay may attempt tmux send-keys if the server env gate allows it"
              : "record-only mode will not attempt tmux send-keys",
        },
        {
          id: "server_gate",
          status: wouldAttemptSendKeys ? "warn" : "pass",
          message: wouldAttemptSendKeys
            ? "server env currently allows real tmux send-keys"
            : dryRunEnabled
              ? "server dry-run gate prevents real send-keys"
              : "server send-keys gate is disabled",
        },
      ],
    },
  };
}

export async function recordServerTmuxDispatchToPersistentServerStorage(
  request: ServerTmuxDispatchRequest,
  storage: JsonlServerEventStorage,
  now = new Date().toISOString(),
): Promise<ServerTmuxDispatchResponse> {
  const snapshot = createServerTmuxDispatchSnapshot(request, now);
  const eventSync = await pushEventsToPersistentServerStorage(createTmuxDispatchEventSyncRequest(request, snapshot.events, now), storage, now);
  const dispatch = await dispatchServerTmuxCommandIfAllowed(request, snapshot.intent, snapshot.permission);
  let dispatchEventSync: EventSyncPushResponse | undefined;

  if (
    dispatch.status === "sent" ||
    dispatch.status === "failed" ||
    dispatch.status === "dry_run" ||
    (dispatch.status === "blocked" && snapshot.permission.decision === "allow" && request.dispatchMode === "execute_if_approved")
  ) {
    const dispatchEvent =
      dispatch.status === "sent"
        ? createTmuxCommandSentEvent(snapshot.intent, dispatch, request.role, request.host, now)
        : dispatch.status === "failed"
          ? createTmuxCommandFailedEvent(snapshot.intent, dispatch, request.role, request.host, now)
          : dispatch.status === "dry_run"
            ? createTmuxCommandDryRunEvent(snapshot.intent, dispatch, request.role, request.host, now)
            : createTmuxCommandBlockedEvent(snapshot.intent, dispatch.reason, request.role, request.host, now);
    dispatchEventSync = await pushEventsToPersistentServerStorage(
      createTmuxDispatchEventSyncRequest(request, [dispatchEvent], now),
      storage,
      now,
    );
  }
  const dispatchEventIds = dispatchEventSync?.results
    .filter((result) => result.status === "accepted" || result.status === "duplicate")
    .map((result) => result.eventId);
  const timelineBlocks = [
    ...snapshot.timelineBlocks,
    createTmuxDispatchResultTimelineBlock(request, snapshot.intent, dispatch, dispatchEventIds ?? [], now),
  ];

  return {
    intent: snapshot.intent,
    permission: snapshot.permission,
    approval: snapshot.approval,
    dispatch,
    eventSync,
    dispatchEventSync,
    timelineBlocks,
  };
}

export function parseServerTmuxCaptureRequest(value: unknown, now = new Date().toISOString()): ServerTmuxCaptureRequest {
  if (!value || typeof value !== "object") {
    throw new Error("tmux capture payload must be an object");
  }

  const candidate = value as Partial<ServerTmuxCaptureRequest>;
  const role = parseTmuxPaneRole(candidate.role);
  const sessionId = typeof candidate.sessionId === "string" && candidate.sessionId.trim() ? candidate.sessionId.trim() : "session_desktop_001";
  const terminalSessionId =
    typeof candidate.terminalSessionId === "string" && candidate.terminalSessionId.trim()
      ? candidate.terminalSessionId.trim()
      : "terminal_session_ai_swarm";
  const paneId = typeof candidate.paneId === "string" && candidate.paneId.trim() ? candidate.paneId.trim() : `role:${role}`;
  const requestedBy = parsePermissionActor(candidate.requestedBy);
  const host = parseTerminalHostKind(candidate.host);
  const tmuxSessionName =
    typeof candidate.tmuxSessionName === "string" && candidate.tmuxSessionName.trim()
      ? candidate.tmuxSessionName.trim()
      : "ai-swarm";
  const lines =
    typeof candidate.lines === "number" && Number.isFinite(candidate.lines)
      ? Math.max(1, Math.min(2_000, Math.trunc(candidate.lines)))
      : 120;
  const id =
    typeof candidate.id === "string" && candidate.id.trim()
      ? candidate.id.trim()
      : `tmux_capture_${stableServerId(`${sessionId}:${terminalSessionId}:${role}:${lines}`)}`;
  const createdAt = typeof candidate.createdAt === "string" && candidate.createdAt.trim() ? candidate.createdAt.trim() : now;

  return {
    id,
    sessionId,
    terminalSessionId,
    role,
    host,
    paneId,
    requestedBy,
    lines,
    tmuxSessionName,
    createdAt,
  };
}

export function createServerTmuxCaptureSnapshot(
  request: ServerTmuxCaptureRequest,
  rawOutput: string,
  now = new Date().toISOString(),
): { payload: TerminalPaneOutputCapturedEventPayload; event: EventEnvelope<TerminalPaneOutputCapturedEventPayload> } {
  const redacted = redactForServerPhase(rawOutput, "pre_store");
  const outputPreview = String(redacted.value).slice(0, 12_000);
  const payload: TerminalPaneOutputCapturedEventPayload = {
    terminalSessionId: request.terminalSessionId,
    paneId: request.paneId,
    role: request.role,
    outputPreview,
    lineCount: outputPreview ? outputPreview.split(/\r?\n/).length : 0,
    redactionApplied: redacted.report.redacted,
    capturedAt: now,
  };

  return {
    payload,
    event: {
      id: `event_tmux_capture_${request.id}_${stableServerId(now)}`,
      sessionId: request.sessionId,
      type: "terminal.pane.output_captured",
      payload,
      createdAt: now,
      source: "server",
      sourceTrust: "trusted",
      redacted: true,
      correlationId: request.id,
    },
  };
}

function createTmuxDispatchTimelineBlocks(
  request: ServerTmuxDispatchRequest,
  intent: TerminalCommandIntent,
  permission: ServerPermissionGateResult,
  approval: ApprovalRequest | undefined,
  events: EventEnvelope[],
  now: string,
): TerminalTimelineBlock[] {
  const intentEventIds = events
    .filter((event) => event.type === "terminal.command.intent.created")
    .map((event) => event.id);
  const approvalEventIds = events
    .filter((event) => event.type === "approval.requested")
    .map((event) => event.id);
  const blockedEventIds = events
    .filter((event) => event.type === "terminal.command.blocked")
    .map((event) => event.id);
  const blocks: TerminalTimelineBlock[] = [
    parseTmuxTimelineBlock({
      id: `tmux_block_intent_${intent.id}`,
      sessionId: request.sessionId,
      terminalSessionId: request.terminalSessionId,
      paneId: request.paneId,
      role: request.role,
      host: request.host,
      kind: "command_intent",
      status:
        permission.decision === "deny"
          ? "blocked"
          : permission.decision === "approval_required"
            ? "pending_approval"
            : request.dispatchMode === "execute_if_approved"
              ? "running"
              : "planned",
      title: `${request.role} command intent`,
      summary:
        permission.decision === "approval_required"
          ? "tmux dispatch is waiting for approval"
          : permission.reason,
      commandIntentId: intent.id,
      relatedEventIds: [...intentEventIds, ...blockedEventIds],
      redactionApplied: intent.commandPreview !== intent.redactedCommandPreview,
      createdAt: now,
    }),
  ];

  if (approval) {
    blocks.push(
      parseTmuxTimelineBlock({
        id: `tmux_block_approval_${approval.id}`,
        sessionId: request.sessionId,
        terminalSessionId: request.terminalSessionId,
        paneId: request.paneId,
        role: request.role,
        host: request.host,
        kind: "approval",
        status: "pending_approval",
        title: "Approval required",
        summary: approval.reason,
        parentBlockId: blocks[0]?.id,
        commandIntentId: intent.id,
        approvalId: approval.id,
        relatedEventIds: approvalEventIds,
        redactionApplied: true,
        createdAt: now,
      }),
    );
  }

  return blocks;
}

function createTmuxDispatchResultTimelineBlock(
  request: ServerTmuxDispatchRequest,
  intent: TerminalCommandIntent,
  dispatch: ServerTmuxDispatchResult,
  relatedEventIds: string[],
  now: string,
): TerminalTimelineBlock {
  const isDryRun = dispatch.status === "dry_run";
  const status =
    dispatch.status === "sent"
      ? "completed"
      : dispatch.status === "failed"
        ? "failed"
        : dispatch.status === "blocked"
          ? "blocked"
          : isDryRun
            ? "dry_run"
            : "planned";

  return parseTmuxTimelineBlock({
    id: `tmux_block_dispatch_${intent.id}_${stableServerId(`${dispatch.status}:${now}`)}`,
    sessionId: request.sessionId,
    terminalSessionId: request.terminalSessionId,
    paneId: request.paneId,
    role: request.role,
    host: request.host,
    kind: isDryRun ? "dry_run" : "dispatch",
    status,
    title: isDryRun ? "Dry-run dispatch" : "Dispatch result",
    summary: dispatch.reason,
    parentBlockId: `tmux_block_intent_${intent.id}`,
    commandIntentId: intent.id,
    relatedEventIds,
    outputPreview: dispatch.stderrPreview ?? dispatch.stdoutPreview,
    redactionApplied: true,
    completedAt: now,
    createdAt: now,
  });
}

function createTmuxCaptureTimelineBlock(
  request: ServerTmuxCaptureRequest,
  payload: TerminalPaneOutputCapturedEventPayload,
  relatedEventIds: string[],
  now: string,
): TerminalTimelineBlock {
  return parseTmuxTimelineBlock({
    id: `tmux_block_capture_${request.id}_${stableServerId(now)}`,
    sessionId: request.sessionId,
    terminalSessionId: request.terminalSessionId,
    paneId: request.paneId,
    role: request.role,
    host: request.host,
    kind: "capture",
    status: "completed",
    title: `${request.role} pane capture`,
    summary: `${payload.lineCount} lines captured`,
    relatedEventIds,
    outputPreview: payload.outputPreview,
    redactionApplied: payload.redactionApplied,
    completedAt: now,
    createdAt: now,
  });
}

function parseTmuxTimelineBlock(value: TerminalTimelineBlock): TerminalTimelineBlock {
  return terminalTimelineBlockSchema.parse(value) as TerminalTimelineBlock;
}

export async function recordServerTmuxCaptureToPersistentServerStorage(
  request: ServerTmuxCaptureRequest,
  storage: JsonlServerEventStorage,
  now = new Date().toISOString(),
): Promise<ServerTmuxCaptureResponse> {
  if (process.env.ORCHESTRATOR_ENABLE_TMUX_CAPTURE !== "1") {
    return {
      status: "disabled",
      reason: "ORCHESTRATOR_ENABLE_TMUX_CAPTURE is not enabled on this server",
    };
  }

  try {
    const rawOutput = await captureServerTmuxPane(request);
    const snapshot = createServerTmuxCaptureSnapshot(request, rawOutput, now);
    const eventSync = await pushEventsToPersistentServerStorage(
      {
        id: `event_sync_tmux_capture_${request.id}_${stableServerId(now)}`,
        clientId: "server_tmux_capture_gate",
        sessionId: request.sessionId,
        events: [snapshot.event],
        idempotencyKey: `server_tmux_capture_gate:${request.id}:${snapshot.event.id}`,
        createdAt: now,
      },
      storage,
      now,
    );

    return {
      status: "captured",
      reason: "tmux pane output captured and redacted",
      payload: snapshot.payload,
      eventSync,
      timelineBlocks: [createTmuxCaptureTimelineBlock(request, snapshot.payload, [snapshot.event.id], now)],
    };
  } catch (error) {
    return {
      status: "failed",
      reason: redactForServerPhase(error instanceof Error ? error.message : String(error), "post_receive").value,
    };
  }
}

export function listApprovalsFromServerStorage(
  state = defaultEventStorageState,
  now = new Date().toISOString(),
): ServerApprovalListResponse {
  const requestedApprovals = new Map<string, ApprovalRequest>();
  const decisions = new Map<string, ServerApprovalDecisionEventPayload>();
  const events = [...state.eventsById.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  for (const event of events) {
    if (event.type === "approval.requested") {
      const parsed = approvalRequestSchema.safeParse(event.payload);
      if (parsed.success) {
        requestedApprovals.set(parsed.data.id, parsed.data);
      }
      continue;
    }

    if (event.type === "approval.granted" || event.type === "approval.rejected") {
      const decision = asApprovalDecisionPayload(event.payload);
      if (decision) {
        decisions.set(decision.approvalId, decision);
      }
    }
  }

  const approvals = [...requestedApprovals.values()]
    .map((approval) => {
      const decision = decisions.get(approval.id);
      if (decision) {
        return {
          ...approval,
          state: decision.state,
          decision: decision.state === "approved" ? "allow" : "deny",
        } satisfies ApprovalRequest;
      }

      if (approval.state === "required" && approval.expiresAt && approval.expiresAt < now) {
        return {
          ...approval,
          state: "expired",
          decision: "deny",
        } satisfies ApprovalRequest;
      }

      return approval;
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const queue = approvals.filter((approval) => approval.state === "required").map(createApprovalQueueItem);

  return {
    approvals,
    queue,
    summary: {
      pending: queue.length,
      approved: approvals.filter((approval) => approval.state === "approved").length,
      rejected: approvals.filter((approval) => approval.state === "rejected").length,
      expired: approvals.filter((approval) => approval.state === "expired").length,
    },
    createdAt: now,
  };
}

export async function listApprovalsFromPersistentServerStorage(
  storage: JsonlServerEventStorage,
  now = new Date().toISOString(),
): Promise<ServerApprovalListResponse> {
  await storage.queue.catch(() => undefined);
  const state = await storage.statePromise;
  return listApprovalsFromServerStorage(state, now);
}

export async function recordApprovalRequestToPersistentServerStorage(
  approval: ApprovalRequest,
  storage: JsonlServerEventStorage,
  now = new Date().toISOString(),
): Promise<EventSyncPushResponse> {
  const event = createApprovalRequestedEvent(approval);
  return pushEventsToPersistentServerStorage(
    {
      id: `event_sync_approval_requested_${approval.id}`,
      clientId: "dgx-02-server",
      sessionId: approval.sessionId,
      events: [event],
      idempotencyKey: event.id,
      createdAt: now,
    },
    storage,
    now,
  );
}

export async function decideApprovalInPersistentServerStorage(
  request: ApprovalDecisionRequest,
  state: Extract<ApprovalState, "approved" | "rejected">,
  storage: JsonlServerEventStorage,
  now = new Date().toISOString(),
): Promise<
  | {
      statusCode: 200;
      payload: {
        approval: ApprovalRequest;
        event: EventEnvelope<ServerApprovalDecisionEventPayload>;
        status: Extract<ApprovalState, "approved" | "rejected">;
      };
    }
  | {
      statusCode: 404 | 409;
      payload: { error: string; approval?: ApprovalRequest };
    }
> {
  return enqueueStorageTask(storage, async () => {
    const storageState = await storage.statePromise;
    const current = listApprovalsFromServerStorage(storageState, now);
    const approval = current.approvals.find(
      (candidate) =>
        (request.approvalId && candidate.id === request.approvalId) ||
        (request.sourceItemId && candidate.sourceItemId === request.sourceItemId),
    );

    if (!approval) {
      return {
        statusCode: 404,
        payload: { error: "approval_not_found" },
      };
    }

    if (approval.state !== "required") {
      return {
        statusCode: 409,
        payload: {
          error: "approval_not_pending",
          approval,
        },
      };
    }

    const decidedAt = request.decidedAt ?? now;
    const event = createApprovalDecisionEvent(approval, state, request.actor ?? "user", request.reason, decidedAt);
    const syncRequest: EventSyncPushRequest = {
      id: `event_sync_approval_${state}_${approval.id}`,
      clientId: "dgx-02-server",
      sessionId: approval.sessionId,
      events: [event],
      idempotencyKey: event.id,
      createdAt: now,
    };
    const syncResponse = pushEventsToServerStorage(syncRequest, storageState, now);
    await appendAcceptedEventsToJsonl(syncRequest, syncResponse, storage.eventLogPath, now);
    const updatedApproval =
      listApprovalsFromServerStorage(storageState, now).approvals.find((candidate) => candidate.id === approval.id) ??
      approval;

    return {
      statusCode: 200,
      payload: {
        approval: updatedApproval,
        event,
        status: state,
      },
    };
  });
}

export async function replayApprovedRequestFromPersistentServerStorage(
  request: ApprovalDecisionRequest,
  storage: JsonlServerEventStorage,
  now = new Date().toISOString(),
): Promise<
  | {
      statusCode: 202;
      payload: ServerApprovalReplayResponse;
    }
  | {
      statusCode: 404 | 409 | 422;
      payload: ServerApprovalReplayResponse;
    }
> {
  const current = await listApprovalsFromPersistentServerStorage(storage, now);
  const approval = current.approvals.find(
    (candidate) =>
      (request.approvalId && candidate.id === request.approvalId) ||
      (request.sourceItemId && candidate.sourceItemId === request.sourceItemId),
  );

  if (!approval) {
    return {
      statusCode: 404,
      payload: {
        status: "not_replayed",
        reason: "approval_not_found",
      },
    };
  }

  if (approval.state !== "approved") {
    return {
      statusCode: 409,
      payload: {
        status: "not_replayed",
        reason: "approval_not_approved",
        approval,
      },
    };
  }

  if (!approval.replay) {
    return {
      statusCode: 409,
      payload: {
        status: "not_replayed",
        reason: "approval_has_no_replay_payload",
        approval,
      },
    };
  }

  if (approval.replay.kind === "provider_completion") {
    const completionRequest = providerCompletionRequestSchema.parse({
      ...(approval.replay.payload as Record<string, unknown>),
      approvalState: "approved",
      permissionDecision: "allow",
    }) as ProviderCompletionRequest;
    const result = await createDgxProviderCompletionResponse(completionRequest, { eventStorage: storage });

    return {
      statusCode: 202,
      payload: {
        status: "replayed",
        approval,
        replay: approval.replay,
        result,
      },
    };
  }

  if (approval.replay.kind === "tmux_dispatch") {
    const dispatchRequest = parseServerTmuxDispatchRequest({
      ...(approval.replay.payload as Record<string, unknown>),
      approvalState: "approved",
    });
    const result = await recordServerTmuxDispatchToPersistentServerStorage(dispatchRequest, storage, now);

    return {
      statusCode: 202,
      payload: {
        status: "replayed",
        approval,
        replay: approval.replay,
        result,
        eventSync: result.dispatchEventSync ?? result.eventSync,
      },
    };
  }

  if (approval.replay.kind !== "agent_delegation") {
    return {
      statusCode: 422,
      payload: {
        status: "not_replayed",
        reason: `unsupported_replay_kind:${approval.replay.kind}`,
        approval,
      },
    };
  }

  const delegationRequest = parseServerAgentDelegationExecuteRequest({
    ...(approval.replay.payload as Record<string, unknown>),
    approvalState: "approved",
    permissionDecision: "allow",
  });
  if (delegationRequest.executionMode === "mock" && process.env.NODE_ENV === "production") {
    throw new Error("mock agent delegation execution is disabled in production");
  }
  const completion =
    delegationRequest.executionMode === "mock"
      ? createServerAgentDelegationMockCompletionFactory()
      : (completionRequest: ProviderCompletionRequest) =>
          createServerAgentDelegationCompletionWithGate(
            completionRequest,
            storage,
            createServerAgentDelegationApprovalReplay(delegationRequest),
          );
  const result = await createServerAgentDelegationExecution(delegationRequest, {
    completeProvider: completion,
    now,
  });
  const eventSync = await pushEventsToPersistentServerStorage(
    createServerAgentDelegationEventSyncRequest(delegationRequest, result.events, result.createdAt),
    storage,
    now,
  );

  return {
    statusCode: 202,
    payload: {
      status: "replayed",
      approval,
      replay: approval.replay,
      result,
      eventSync,
    },
  };
}

function createApprovalId(sourceItemId: string) {
  return `approval_${sourceItemId.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
}

function actorFromEventSource(source: ProviderCompletionRequest["source"]): PermissionActor {
  if (source === "mobile") return "mobile";
  if (source === "agent") return "agent";
  if (source === "api" || source === "legacy_telegram") return "external_channel";
  if (source === "server") return "server";
  return "user";
}

function sourceTrustFromEventSource(source: ProviderCompletionRequest["source"]): SourceTrust {
  if (source === "legacy_telegram" || source === "api") return "untrusted";
  if (source === "mobile") return "limited";
  return "trusted";
}

export function createServerIngressSnapshot(input: ServerIngressInput): ServerIngressSnapshot {
  const normalizedText = normalizeIngressText([...(input.recentTexts ?? []), input.text].join(" "));
  const redaction = redactForServerPhase(normalizedText, "pre_store");
  const redactedText = String(redaction.value);
  const requestedPermissions = detectIngressPermissions(normalizedText);
  const confidence = classifyIngressConfidence(normalizedText, requestedPermissions);
  const requiresApproval = requestedPermissions.length > 0 || confidence !== "high";
  const guardSteps = createIngressGuardSteps({
    input,
    normalizedText,
    redactedText,
    requestedPermissions,
    requiresApproval,
  });
  const blocked = guardSteps.some((step) => step.status === "blocked");
  const source = eventSourceForIngressChannel(input.channel);
  const normalizedEvent: IngressEvent | undefined = blocked
    ? undefined
    : {
        id: `ingress_event_${stableIngressId(`${input.id}:${redactedText}`)}`,
        channel: input.channel,
        source,
        sourceTrust: sourceTrustFromEventSource(source),
        authorType: input.authorType,
        rawText: "[QUARANTINED_RAW_PAYLOAD]",
        normalizedText: redactedText,
        eventType: input.eventType,
        requestedPermissions,
        confidence,
        requiresApproval,
        redacted: redaction.report.redacted || redactedText !== normalizedText,
        createdAt: input.receivedAt,
      };
  const approvalState: ApprovalState = blocked ? "rejected" : requiresApproval ? "required" : "not_required";
  const result: IngressGuardResult = {
    id: `ingress_result_${stableIngressId(`${input.id}:${approvalState}`)}`,
    inputId: input.id,
    accepted: Boolean(normalizedEvent),
    earlyReturn: blocked || input.eventType !== "message",
    confidence,
    normalizedEvent,
    guardSteps,
    approvalState,
    reason: createIngressResultReason(blocked, requiresApproval, confidence),
    createdAt: input.receivedAt,
  };
  const approvals = normalizedEvent && requiresApproval ? [createIngressApprovalRequest(input, normalizedEvent, result)] : [];

  return {
    id: `ingress_snapshot_${stableIngressId(`${input.id}:${input.receivedAt}`)}`,
    sessionId: input.sessionId,
    channel: input.channel,
    result,
    approvals,
    checklist: [
      "external source classified before session handoff",
      "raw payload quarantined; only redacted normalized text is stored",
      "dangerous action requests become approval queue items",
      "memory candidates remain provisional until a curator promotes them",
      "terminal/tmux dispatch is not executed from ingress",
    ],
    zeroTokenSafety: {
      enabled: true,
      cadence: "3h",
      lastCheck: input.receivedAt,
      pendingCount: approvals.length,
    },
  };
}

export async function recordServerIngressToPersistentServerStorage(
  input: ServerIngressInput,
  storage: JsonlServerEventStorage,
  now = new Date().toISOString(),
): Promise<ServerIngressReceiverResponse> {
  const snapshot = createServerIngressSnapshot(input);
  const events = createServerIngressEvents(snapshot, now);
  const eventSync = await pushEventsToPersistentServerStorage(
    {
      id: `event_sync_ingress_${snapshot.id}`,
      clientId: "dgx-02-server",
      sessionId: snapshot.sessionId,
      events,
      idempotencyKey: `ingress:${snapshot.id}`,
      createdAt: now,
    },
    storage,
    now,
  );

  return {
    snapshot,
    eventSync,
    approvals: snapshot.approvals,
  };
}

function createServerIngressEvents(snapshot: ServerIngressSnapshot, now: string): EventEnvelope[] {
  const source = snapshot.result.normalizedEvent?.source ?? eventSourceForIngressChannel(snapshot.channel);
  const sourceTrust = snapshot.result.normalizedEvent?.sourceTrust ?? sourceTrustFromEventSource(source);
  const events: EventEnvelope[] = [
    {
      id: `event_ingress_guard_${snapshot.result.id}`,
      sessionId: snapshot.sessionId,
      type: "ingress.guard.evaluated",
      payload: {
        snapshotId: snapshot.id,
        result: snapshot.result,
        checklist: snapshot.checklist,
        zeroTokenSafety: snapshot.zeroTokenSafety,
      },
      createdAt: now,
      source,
      sourceTrust,
      redacted: true,
      correlationId: snapshot.id,
    },
  ];

  if (snapshot.result.normalizedEvent) {
    events.push({
      id: `event_ingress_accepted_${snapshot.result.normalizedEvent.id}`,
      sessionId: snapshot.sessionId,
      type: "ingress.event.accepted",
      payload: snapshot.result.normalizedEvent,
      createdAt: now,
      source,
      sourceTrust,
      redacted: true,
      correlationId: snapshot.id,
    });
    events.push({
      id: `event_memory_remote_pending_${snapshot.result.normalizedEvent.id}`,
      sessionId: snapshot.sessionId,
      type: "memory.remote_input.pending",
      payload: {
        ingressEventId: snapshot.result.normalizedEvent.id,
        channel: snapshot.channel,
        sourceTrust,
        summary: snapshot.result.normalizedEvent.normalizedText.slice(0, 180),
        approvalState: snapshot.result.approvalState,
      },
      createdAt: now,
      source,
      sourceTrust,
      redacted: true,
      correlationId: snapshot.id,
    });
  }

  for (const approval of snapshot.approvals) {
    events.push(createApprovalRequestedEvent(approval));
  }

  return events;
}

function parseServerIngressInput(value: unknown, now = new Date().toISOString()): ServerIngressInput {
  if (!value || typeof value !== "object") {
    throw new Error("ingress payload must be an object");
  }
  const candidate = value as Record<string, unknown>;
  const channel = parseExternalChannel(candidate.channel);
  const authorType = parseIngressAuthorType(candidate.authorType);
  const eventType = parseIngressEventType(candidate.eventType);
  const text = typeof candidate.text === "string" ? candidate.text : undefined;
  if (!text || text.length > 50_000) {
    throw new Error("ingress text is required and must be <= 50000 characters");
  }
  const receivedAt = typeof candidate.receivedAt === "string" && candidate.receivedAt ? candidate.receivedAt : now;
  const id =
    typeof candidate.id === "string" && candidate.id
      ? candidate.id
      : `ingress_input_${stableIngressId(`${channel}:${receivedAt}:${text.slice(0, 128)}`)}`;
  const sessionId =
    typeof candidate.sessionId === "string" && candidate.sessionId
      ? candidate.sessionId
      : `session_ingress_${channel}`;
  const recentTexts = Array.isArray(candidate.recentTexts)
    ? candidate.recentTexts.filter((entry): entry is string => typeof entry === "string").slice(0, 12)
    : undefined;
  const debounceWindowMs =
    typeof candidate.debounceWindowMs === "number" && Number.isFinite(candidate.debounceWindowMs)
      ? Math.max(0, Math.trunc(candidate.debounceWindowMs))
      : undefined;

  return {
    id,
    sessionId,
    channel,
    authorType,
    eventType,
    text,
    receivedAt,
    debounceWindowMs,
    recentTexts,
  };
}

function parseExternalChannel(value: unknown): ExternalChannel {
  if (value === "legacy_telegram" || value === "mobile" || value === "api" || value === "webhook") {
    return value;
  }
  return "api";
}

function parseIngressAuthorType(value: unknown): IngressAuthorType {
  if (value === "user" || value === "bot" || value === "manager" || value === "system") {
    return value;
  }
  return "user";
}

function parseIngressEventType(value: unknown): IngressEvent["eventType"] {
  if (value === "message" || value === "system_event" || value === "bot_reply" || value === "unknown") {
    return value;
  }
  return "message";
}

function createIngressGuardSteps(params: {
  input: ServerIngressInput;
  normalizedText: string;
  redactedText: string;
  requestedPermissions: PermissionLevel[];
  requiresApproval: boolean;
}): IngressGuardStep[] {
  const isNoise = params.input.eventType === "system_event" || !params.normalizedText.trim();
  const isSelfResponse = params.input.authorType === "bot" || params.input.authorType === "manager";
  return [
    {
      name: "shape_unification",
      status: "passed",
      reason: `${params.input.channel} payload normalized into IngressEvent`,
    },
    {
      name: "noise_filter",
      status: isNoise ? "blocked" : "passed",
      reason: isNoise ? "system/noise event skipped before model wakeup" : "message event kept",
    },
    {
      name: "self_response_prevention",
      status: isSelfResponse ? "blocked" : "passed",
      reason: isSelfResponse ? "bot/manager author would create response loop" : "external user author accepted",
    },
    {
      name: "debounce",
      status: "passed",
      reason: params.input.recentTexts?.length
        ? `${params.input.recentTexts.length + 1} messages merged in ${params.input.debounceWindowMs ?? 30_000}ms window`
        : "single message; merge window clear",
    },
    {
      name: "pii_secret_block",
      status: params.requestedPermissions.includes("secret_access") || params.requiresApproval ? "queued" : "passed",
      reason:
        params.redactedText !== params.normalizedText
          ? "secret-like text redacted and approval required"
          : params.requiresApproval
            ? "sensitive action waits for approval"
            : "no sensitive request detected",
    },
    {
      name: "guard_logging",
      status: "passed",
      reason: "redacted event goes to Event Storage; raw payload stays quarantined",
    },
    {
      name: "checklist_injection",
      status: "passed",
      reason: "external-agent checklist attached before session handoff",
    },
  ];
}

function createIngressApprovalRequest(
  input: ServerIngressInput,
  event: IngressEvent,
  result: IngressGuardResult,
): ApprovalRequest {
  return {
    id: createApprovalId(event.id),
    sessionId: input.sessionId,
    sourceItemId: event.id,
    subjectId: `${event.channel}:${event.id}`,
    actor: actorFromEventSource(event.source),
    channel: event.source,
    sourceTrust: event.sourceTrust,
    action: actionFromIngressPermissions(event.requestedPermissions),
    requestedLevels: event.requestedPermissions,
    decision: "approval_required",
    state: "required",
    reason: result.reason,
    ttlSeconds: DEFAULT_APPROVAL_TTL_SECONDS,
    createdAt: input.receivedAt,
    expiresAt: addSecondsIso(input.receivedAt, DEFAULT_APPROVAL_TTL_SECONDS),
  };
}

function actionFromIngressPermissions(permissions: PermissionLevel[]): PermissionAction {
  if (permissions.includes("run_dangerous_commands")) return "terminal_run";
  if (permissions.includes("run_safe_commands")) return "terminal_run";
  if (permissions.includes("write_files")) return "file_write";
  if (permissions.includes("secret_access")) return "secret_view";
  if (permissions.includes("remote_workspace")) return "remote_workspace";
  return "unknown_external_effect";
}

function detectIngressPermissions(value: string): PermissionLevel[] {
  const permissions = new Set<PermissionLevel>();
  if (/(terminal|tmux|pnpm|npm|python|bash|powershell|cmd\.exe|execute|run|실행)/i.test(value)) {
    permissions.add("run_safe_commands");
  }
  if (/(delete|remove|rm\s|move|write|patch|merge|push|파일|수정|삭제)/i.test(value)) {
    permissions.add("write_files");
  }
  if (/(api[_ -]?key|token|secret|bearer|sk-|password|private key)/i.test(value)) {
    permissions.add("secret_access");
  }
  if (/(reboot|shutdown|format|rm\s+-rf|재부팅|종료)/i.test(value)) {
    permissions.add("run_dangerous_commands");
  }
  return [...permissions];
}

function classifyIngressConfidence(value: string, permissions: PermissionLevel[]): IngressConfidence {
  if (permissions.length > 0 || /(refund|payment|delete|merge|push|secret|token|api key|환불|결제|삭제)/i.test(value)) {
    return "low";
  }
  if (/(coding|handoff|debate|summary|review|코딩|토론|요약|검토)/i.test(value)) {
    return "medium";
  }
  return "high";
}

function normalizeIngressText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function eventSourceForIngressChannel(channel: ExternalChannel): EventSource {
  if (channel === "legacy_telegram") return "legacy_telegram";
  if (channel === "mobile") return "mobile";
  return "api";
}

function createIngressResultReason(blocked: boolean, requiresApproval: boolean, confidence: IngressConfidence) {
  if (blocked) return "blocked before session handoff";
  if (requiresApproval) return `${confidence} confidence external input queued for approval`;
  return "high confidence external input accepted";
}

function stableServerId(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
}

function stableIngressId(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}

function createApprovalQueueItem(approval: ApprovalRequest): ApprovalQueueItem {
  return {
    id: `queue_${approval.id}`,
    sourceItemId: approval.sourceItemId ?? approval.id,
    summary: approvalSummary(approval),
    requestedBy: approval.actor,
    action: approval.action,
    reason: approval.reason,
    sourceTrust: approval.sourceTrust,
    permissions: approval.requestedLevels,
    state: approval.state,
    costEstimateTokens: approval.costEstimateTokens,
    createdAt: approval.createdAt,
    expiresAt: approval.expiresAt,
    replayKind: approval.replay?.kind,
    replayEndpoint: approval.replay?.endpoint,
  };
}

function approvalSummary(approval: ApprovalRequest) {
  if (approval.action === "provider_completion") {
    return `Provider completion approval: ${approval.subjectId}`;
  }

  if (approval.action === "remote_workspace") {
    return `Remote workspace approval: ${approval.subjectId}`;
  }

  return `${approval.action} approval: ${approval.subjectId}`;
}

function createApprovalRequestedEvent(approval: ApprovalRequest): EventEnvelope<ApprovalRequest> {
  return {
    id: `event_approval_requested_${approval.id}`,
    sessionId: approval.sessionId,
    type: "approval.requested",
    payload: approval,
    createdAt: approval.createdAt,
    source: "server",
    sourceTrust: "trusted",
    redacted: true,
    correlationId: approval.sourceItemId,
  };
}

function createApprovalDecisionEvent(
  approval: ApprovalRequest,
  state: Extract<ApprovalState, "approved" | "rejected">,
  actor: PermissionActor,
  reason: string | undefined,
  decidedAt: string,
): EventEnvelope<ServerApprovalDecisionEventPayload> {
  return {
    id: `event_approval_${state}_${approval.id}_${decidedAt.replace(/[^a-zA-Z0-9_-]+/g, "_")}`,
    sessionId: approval.sessionId,
    type: state === "approved" ? "approval.granted" : "approval.rejected",
    payload: {
      approvalId: approval.id,
      sourceItemId: approval.sourceItemId,
      state,
      actor,
      reason,
      decidedAt,
    },
    createdAt: decidedAt,
    source: "server",
    sourceTrust: "trusted",
    redacted: true,
    correlationId: approval.sourceItemId,
  };
}

function asApprovalDecisionPayload(value: unknown): ServerApprovalDecisionEventPayload | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<ServerApprovalDecisionEventPayload>;
  if (
    typeof candidate.approvalId === "string" &&
    (candidate.state === "approved" || candidate.state === "rejected") &&
    typeof candidate.actor === "string" &&
    typeof candidate.decidedAt === "string"
  ) {
    return candidate as ServerApprovalDecisionEventPayload;
  }

  return undefined;
}

function parseTmuxPaneRole(value: unknown): TmuxPaneRole {
  if (typeof value === "string" && TMUX_PANE_ROLES.includes(value as TmuxPaneRole)) {
    return value as TmuxPaneRole;
  }

  return "orchestrator";
}

function parseTerminalHostKind(value: unknown): TerminalHostKind {
  if (typeof value === "string" && TERMINAL_HOST_KINDS.includes(value as TerminalHostKind)) {
    return value as TerminalHostKind;
  }

  return "dgx_02";
}

function parsePermissionActor(value: unknown): PermissionActor {
  if (value === "user" || value === "agent" || value === "external_channel" || value === "mobile" || value === "server") {
    return value;
  }

  return "user";
}

function parseApprovalState(value: unknown): ApprovalState {
  if (value === "not_required" || value === "required" || value === "approved" || value === "rejected" || value === "expired") {
    return value;
  }

  return "required";
}

function parseOptionalApprovalState(value: unknown): ApprovalState | undefined {
  if (value === undefined) return undefined;
  if (value === "not_required" || value === "required" || value === "approved" || value === "rejected" || value === "expired") {
    return value;
  }
  return undefined;
}

function parseOptionalPermissionDecision(value: unknown): PermissionDecision | undefined {
  if (value === "allow" || value === "approval_required" || value === "deny") {
    return value;
  }
  return undefined;
}

function parseRequiredString(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value.trim().slice(0, maxLength);
}

function parseOptionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  return value.trim().slice(0, maxLength);
}

function parseServerAgentDelegationAgentRef(value: unknown, fieldName: string): ServerAgentDelegationAgentRef {
  if (!value || typeof value !== "object") {
    throw new Error(`${fieldName} must be an object`);
  }

  const candidate = value as Partial<ServerAgentDelegationAgentRef>;
  return {
    agentId: parseRequiredString(candidate.agentId, `${fieldName}.agentId`, 256),
    role: parseServerAgentRole(candidate.role, `${fieldName}.role`),
    providerProfileId: parseRequiredString(candidate.providerProfileId, `${fieldName}.providerProfileId`, 256),
    modelId: parseRequiredString(candidate.modelId, `${fieldName}.modelId`, 256),
    personaName: parseOptionalString(candidate.personaName, 128),
    systemPrompt: parseOptionalString(candidate.systemPrompt, 200_000),
  };
}

function parseServerAgentRole(value: unknown, fieldName: string): AgentRole {
  const parsed = agentRoleSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${fieldName} must be a known AgentRole`);
  }
  return parsed.data;
}

function parseServerAgentDelegationTargets(value: unknown): ServerAgentDelegationTarget[] {
  if (!Array.isArray(value)) {
    throw new Error("targets must be an array");
  }

  return value.slice(0, 32).map((target, index): ServerAgentDelegationTarget => {
    const candidate = target as Partial<ServerAgentDelegationTarget>;
    return {
      ...parseServerAgentDelegationAgentRef(target, `targets[${index}]`),
      key: parseRequiredString(candidate.key, `targets[${index}].key`, 128),
    };
  });
}

function parseServerDelegateTags(content: string): ServerDelegateTag[] {
  const tags: ServerDelegateTag[] = [];
  const pattern = /<delegate\s+to="([a-zA-Z_][a-zA-Z0-9_-]*)"\s*>([\s\S]*?)<\/delegate>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    tags.push({
      target: match[1]!,
      prompt: match[2]!.trim(),
      raw: match[0]!,
      startIndex: match.index,
      endIndex: match.index + match[0]!.length,
    });
  }
  return tags;
}

function createServerAgentDelegationTargetIndex(targets: ServerAgentDelegationTarget[]): Map<string, ServerAgentDelegationTarget> {
  const index = new Map<string, ServerAgentDelegationTarget>();
  for (const target of targets) {
    for (const key of [target.key, target.role, target.personaName, target.agentId]) {
      if (key) index.set(key, target);
    }
  }
  return index;
}

function createOptionalSystemMessage(content: string | undefined): ProviderCompletionMessage | undefined {
  if (!content) return undefined;
  return { role: "system", content };
}

function createServerDelegationProviderRequest(params: {
  id: string;
  sessionId: string;
  agent: ServerAgentDelegationAgentRef;
  messages: ProviderCompletionMessage[];
  route: ProviderCompletionRoute;
  approvalState?: ApprovalState;
  permissionDecision?: PermissionDecision;
  createdAt: string;
}): ProviderCompletionRequest {
  return {
    id: params.id,
    sessionId: params.sessionId,
    providerProfileId: params.agent.providerProfileId,
    modelId: params.agent.modelId,
    messages: params.messages,
    source: "server",
    routePreference: params.route,
    approvalState: params.approvalState,
    permissionDecision: params.permissionDecision,
    createdAt: params.createdAt,
  };
}

function requireSucceededProviderContent(response: ProviderCompletionResponse, label: string): string {
  if (response.status !== "succeeded" || !response.content) {
    throw new Error(`${label} failed: ${response.error ?? response.status}`);
  }
  return response.content;
}

function isSelfDelegation(caller: ServerAgentDelegationAgentRef, target: string): boolean {
  return target === caller.agentId || target === caller.role || target === caller.personaName;
}

function createServerDelegationAuthorityLevel(agent: ServerAgentDelegationAgentRef): AgentDelegationAuthorityLevel {
  return agent.role === "companion" || agent.role === "orchestrator" ? "orchestrator_plus" : "agent";
}

function createServerAgentDisplayName(agent: ServerAgentDelegationAgentRef): string {
  return agent.personaName ?? agent.agentId;
}

function buildServerSubAgentDelegationPrompt(caller: ServerAgentDelegationAgentRef, prompt: string): string {
  return [
    `Delegated by ${caller.personaName ?? caller.role} (${caller.agentId}).`,
    "This server-side delegation is completion-only. Do not execute commands, send external messages, or mutate files.",
    "Return concise findings that the caller can incorporate into a final answer.",
    "",
    prompt,
  ].join("\n");
}

function buildServerDelegationFollowUpPrompt(outcomes: ServerAgentDelegationOutcome[], userMessage: string): string {
  const lines = outcomes.map((outcome, index) => {
    if (outcome.kind === "succeeded") {
      return `${index + 1}. ${outcome.target}: ${outcome.response}`;
    }
    if (outcome.kind === "failed") {
      return `${index + 1}. ${outcome.target}: failed - ${outcome.reason}`;
    }
    if (outcome.kind === "blocked") {
      return `${index + 1}. ${outcome.target}: blocked - ${outcome.reason}`;
    }
    return `${index + 1}. ${outcome.target}: ${outcome.kind}`;
  });

  return [
    "Sub-agent delegation results are below. Produce the final answer in your own voice.",
    `Original user request: ${userMessage}`,
    "",
    lines.join("\n") || "No usable delegation result.",
  ].join("\n");
}

function createRedactedPreview(value: string, maxLength = 360): string {
  const redacted = redactForServerPhase(value, "pre_store").value;
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}...` : redacted;
}

function createServerAgentDelegationEvent(params: {
  request: ServerAgentDelegationExecuteRequest;
  type: AgentDelegationEventType;
  suffix: string;
  payload: AgentDelegationEventPayload;
  createdAt: string;
}): EventEnvelope {
  const redactedPayload = redactForServerPhase(params.payload, "pre_store").value;
  const payload = parseAgentDelegationEventPayload(params.type, redactedPayload);
  return {
    id: `event_${params.type.replaceAll(".", "_")}_${params.request.id}_${stableServerId(params.suffix)}`,
    sessionId: params.request.sessionId,
    type: params.type,
    payload,
    createdAt: params.createdAt,
    source: "server",
    sourceTrust: "trusted",
    redacted: true,
    correlationId: params.request.id,
  };
}

function createServerAgentDelegationOutcomeEvent(
  request: ServerAgentDelegationExecuteRequest,
  type: AgentDelegationEventType,
  outcome: ServerAgentDelegationOutcome,
  createdAt: string,
): EventEnvelope {
  const suffix = `${type}:${outcome.target}:${outcome.kind}:${"reason" in outcome ? outcome.reason ?? "" : ""}`;
  const payload = createServerAgentDelegationOutcomePayload(request, outcome);
  return createServerAgentDelegationEvent({
    request,
    type,
    suffix,
    payload,
    createdAt,
  });
}

function createServerAgentDelegationOutcomePayload(
  request: ServerAgentDelegationExecuteRequest,
  outcome: ServerAgentDelegationOutcome,
): AgentDelegationEventPayload {
  const base = {
    sourceAgentId: request.caller.agentId,
    sourceAgentName: createServerAgentDisplayName(request.caller),
    sourceRole: request.caller.role,
    sourcePersonaName: request.caller.personaName,
    authorityLevel: createServerDelegationAuthorityLevel(request.caller),
    depthLimit: 1,
  };

  if (outcome.kind === "blocked") {
    return {
      ...base,
      target: outcome.target,
      reason: createRedactedPreview(outcome.reason, 4_000),
    };
  }

  if (outcome.kind === "unknown_target") {
    return {
      ...base,
      target: outcome.target,
      promptLength: outcome.prompt.length,
    };
  }

  if (outcome.kind === "self_delegation") {
    return {
      ...base,
      target: outcome.target,
    };
  }

  const target = request.targets.find((candidate) => candidate.agentId === outcome.targetAgentId);
  const targetRole = target?.role ?? "executor";
  const targetName = target ? createServerAgentDisplayName(target) : outcome.targetAgentId ?? outcome.target;
  const providerProfileId = target?.providerProfileId ?? request.caller.providerProfileId;
  const modelId = target?.modelId ?? request.caller.modelId;

  if (outcome.kind === "succeeded") {
    return {
      ...base,
      targetAgentId: outcome.targetAgentId,
      targetAgentName: targetName,
      targetRole,
      providerProfileId,
      modelId,
      responseLength: outcome.response.length,
      route: request.executionMode === "mock" ? "mock" : request.routePreference ?? "server_proxy",
      realProviderCall: request.executionMode !== "mock",
    };
  }

  return {
    ...base,
    targetAgentId: outcome.targetAgentId ?? outcome.target,
    targetAgentName: targetName,
    targetRole,
    providerProfileId,
    modelId,
    error: createRedactedPreview(outcome.reason, 20_000),
  };
}

function detectTmuxDispatchPermissions(request: ServerTmuxDispatchRequest): PermissionLevel[] {
  const permissions = new Set<PermissionLevel>(["run_safe_commands", "remote_workspace"]);
  const command = request.commandPreview.toLowerCase();

  if (request.host === "local_mac" || request.host === "home_pc") {
    permissions.delete("remote_workspace");
  }

  if (/(rm\s+-rf|shutdown|reboot|format|diskpart|mkfs|dd\s+if=|sudo\s+)/i.test(request.commandPreview)) {
    permissions.add("run_dangerous_commands");
  }

  if (/(apply_patch|write|delete|remove|move|mv\s|rm\s|git\s+push|git\s+merge|git\s+rebase|pnpm\s+install|npm\s+install)/i.test(
    request.commandPreview,
  )) {
    permissions.add("write_files");
  }

  if (/(curl|wget|http:\/\/|https:\/\/|ssh\s|scp\s|rsync\s|git\s+fetch|git\s+pull)/i.test(request.commandPreview)) {
    permissions.add("network_access");
  }

  if (/(api[_ -]?key|token|secret|bearer|password|private key|\.env|auth\.json)/i.test(command)) {
    permissions.add("secret_access");
  }

  return [...permissions];
}

function createTmuxIntentDispatchState(
  _request: ServerTmuxDispatchRequest,
  permission: ServerPermissionGateResult,
): TerminalCommandDispatchState {
  if (permission.decision === "deny") return "blocked";
  if (permission.decision === "approval_required") return "pending_approval";
  return "recorded";
}

function createTmuxDispatchApprovalRequest(
  request: ServerTmuxDispatchRequest,
  permission: ServerPermissionGateResult,
  now: string,
): ApprovalRequest {
  const channel = eventSourceFromPermissionActor(request.requestedBy);
  return {
    id: createApprovalId(request.id),
    sessionId: request.sessionId,
    sourceItemId: request.id,
    subjectId: `${request.host}:${request.tmuxSessionName}:${request.role}`,
    actor: request.requestedBy,
    channel,
    sourceTrust: sourceTrustFromEventSource(channel),
    action: permission.action,
    requestedLevels: permission.requestedLevels,
    decision: permission.decision,
    state: permission.approvalState,
    reason: permission.reason,
    ttlSeconds: DEFAULT_APPROVAL_TTL_SECONDS,
    createdAt: now,
    expiresAt: addSecondsIso(now, DEFAULT_APPROVAL_TTL_SECONDS),
    replay: createTmuxDispatchApprovalReplay(request),
  };
}

function createTmuxDispatchApprovalReplay(request: ServerTmuxDispatchRequest): ApprovalReplayRequest {
  return {
    kind: "tmux_dispatch",
    endpoint: "/tmux/dispatch",
    method: "POST",
    payload: {
      ...request,
      approvalState: "approved",
      dispatchMode: request.dispatchMode,
    } satisfies ServerTmuxDispatchRequest,
  };
}

function eventSourceFromPermissionActor(actor: PermissionActor): EventSource {
  if (actor === "mobile") return "mobile";
  if (actor === "external_channel") return "api";
  if (actor === "agent") return "agent";
  if (actor === "server") return "server";
  return "desktop";
}

function createTmuxCommandIntentEvent(
  intent: TerminalCommandIntent,
  role: TmuxPaneRole,
  host: TerminalHostKind,
  tmuxSessionName: string,
): EventEnvelope {
  return createTerminalCommandEvent(
    "terminal.command.intent.created",
    {
      intent,
      role,
      host,
      tmuxSessionName,
      rawCommandQuarantined: true,
    },
    {
      id: `event_tmux_intent_${intent.id}`,
      sessionId: intent.sessionId,
      createdAt: intent.createdAt,
      correlationId: intent.id,
    },
  );
}

function createTerminalCommandEvent(
  type: TerminalCommandEventType,
  payload: TerminalCommandEventPayload,
  options: {
    id: string;
    sessionId: string;
    createdAt: string;
    correlationId: string;
  },
): EventEnvelope {
  return {
    id: options.id,
    sessionId: options.sessionId,
    type,
    payload: parseTerminalCommandEventPayload(type, payload),
    createdAt: options.createdAt,
    source: "server",
    sourceTrust: "trusted",
    redacted: true,
    correlationId: options.correlationId,
  };
}

function createTmuxCommandBlockedEvent(
  intent: TerminalCommandIntent,
  reason: string,
  role: TmuxPaneRole,
  host: TerminalHostKind,
  createdAt: string,
): EventEnvelope {
  return createTerminalCommandEvent(
    "terminal.command.blocked",
    {
      intentId: intent.id,
      terminalSessionId: intent.terminalSessionId,
      paneId: intent.paneId,
      role,
      host,
      reason,
      redactedCommandPreview: intent.redactedCommandPreview,
    },
    {
      id: `event_tmux_blocked_${intent.id}_${stableServerId(reason)}`,
      sessionId: intent.sessionId,
      createdAt,
      correlationId: intent.id,
    },
  );
}

function createTmuxCommandDryRunEvent(
  intent: TerminalCommandIntent,
  dispatch: ServerTmuxDispatchResult,
  role: TmuxPaneRole,
  host: TerminalHostKind,
  createdAt: string,
): EventEnvelope {
  return createTerminalCommandEvent(
    "terminal.command.dry_run",
    {
      intentId: intent.id,
      terminalSessionId: intent.terminalSessionId,
      paneId: intent.paneId,
      role,
      host,
      reason: dispatch.reason,
      attempted: false,
      redactedCommandPreview: intent.redactedCommandPreview,
    },
    {
      id: `event_tmux_dry_run_${intent.id}_${stableServerId(createdAt)}`,
      sessionId: intent.sessionId,
      createdAt,
      correlationId: intent.id,
    },
  );
}

function createTmuxCommandSentEvent(
  intent: TerminalCommandIntent,
  dispatch: ServerTmuxDispatchResult,
  role: TmuxPaneRole,
  host: TerminalHostKind,
  createdAt: string,
): EventEnvelope {
  return createTerminalCommandEvent(
    "terminal.command.sent",
    {
      intentId: intent.id,
      terminalSessionId: intent.terminalSessionId,
      paneId: intent.paneId,
      role,
      host,
      stdoutPreview: dispatch.stdoutPreview,
      stderrPreview: dispatch.stderrPreview,
    },
    {
      id: `event_tmux_sent_${intent.id}_${stableServerId(createdAt)}`,
      sessionId: intent.sessionId,
      createdAt,
      correlationId: intent.id,
    },
  );
}

function createTmuxCommandFailedEvent(
  intent: TerminalCommandIntent,
  dispatch: ServerTmuxDispatchResult,
  role: TmuxPaneRole,
  host: TerminalHostKind,
  createdAt: string,
): EventEnvelope {
  return createTerminalCommandEvent(
    "terminal.command.failed",
    {
      intentId: intent.id,
      terminalSessionId: intent.terminalSessionId,
      paneId: intent.paneId,
      role,
      host,
      reason: dispatch.reason,
      stdoutPreview: dispatch.stdoutPreview,
      stderrPreview: dispatch.stderrPreview,
    },
    {
      id: `event_tmux_failed_${intent.id}_${stableServerId(dispatch.reason)}`,
      sessionId: intent.sessionId,
      createdAt,
      correlationId: intent.id,
    },
  );
}

function createTmuxDispatchEventSyncRequest(
  request: ServerTmuxDispatchRequest,
  events: EventEnvelope[],
  now: string,
): EventSyncPushRequest {
  return {
    id: `event_sync_tmux_${request.id}_${stableServerId(now)}`,
    clientId: "server_tmux_dispatch_gate",
    sessionId: request.sessionId,
    events,
    idempotencyKey: `server_tmux_dispatch_gate:${request.id}:${events.map((event) => event.id).join(",")}`,
    createdAt: now,
  };
}

async function dispatchServerTmuxCommandIfAllowed(
  request: ServerTmuxDispatchRequest,
  _intent: TerminalCommandIntent,
  permission: ServerPermissionGateResult,
): Promise<ServerTmuxDispatchResult> {
  if (permission.decision === "approval_required") {
    return {
      attempted: false,
      status: "pending_approval",
      reason: "tmux dispatch recorded and queued for approval",
    };
  }

  if (permission.decision === "deny") {
    return {
      attempted: false,
      status: "blocked",
      reason: permission.reason,
    };
  }

  if (request.dispatchMode !== "execute_if_approved") {
    return {
      attempted: false,
      status: "recorded",
      reason: "tmux dispatch intent recorded without executing send-keys",
    };
  }

  if (process.env.ORCHESTRATOR_TMUX_DRY_RUN === "1") {
    return {
      attempted: false,
      status: "dry_run",
      reason: "ORCHESTRATOR_TMUX_DRY_RUN accepted approved tmux dispatch without send-keys",
    };
  }

  if (process.env.ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS !== "1") {
    return {
      attempted: false,
      status: "blocked",
      reason: "ORCHESTRATOR_ENABLE_TMUX_SEND_KEYS is not enabled on this server",
    };
  }

  const scriptPath = process.env.TMUX_SWARM_SEND_SCRIPT ?? join(process.cwd(), "scripts", "swarm-send.sh");
  const timeoutMs = Number(process.env.ORCHESTRATOR_TMUX_SEND_TIMEOUT_MS ?? 15_000);

  try {
    const result = await execFileAsync(scriptPath, [request.role, request.commandPreview], {
      env: {
        ...process.env,
        AI_SWARM_SESSION: request.tmuxSessionName,
      },
      maxBuffer: 64_000,
      timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15_000,
      windowsHide: true,
    });
    return {
      attempted: true,
      status: "sent",
      reason: "tmux send-keys dispatched through swarm-send.sh",
      stdoutPreview: redactForServerPhase(result.stdout.slice(0, 2_000), "post_receive").value,
      stderrPreview: redactForServerPhase(result.stderr.slice(0, 2_000), "post_receive").value,
    };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; message?: string };
    return {
      attempted: true,
      status: "failed",
      reason: redactForServerPhase(execError.message ?? "tmux dispatch failed", "post_receive").value,
      stdoutPreview: redactForServerPhase((execError.stdout ?? "").slice(0, 2_000), "post_receive").value,
      stderrPreview: redactForServerPhase((execError.stderr ?? "").slice(0, 2_000), "post_receive").value,
    };
  }
}

async function captureServerTmuxPane(request: ServerTmuxCaptureRequest): Promise<string> {
  const scriptPath = process.env.TMUX_SWARM_CAPTURE_SCRIPT ?? join(process.cwd(), "scripts", "swarm-capture.sh");
  const timeoutMs = Number(process.env.ORCHESTRATOR_TMUX_CAPTURE_TIMEOUT_MS ?? 10_000);
  const result = await execFileAsync(scriptPath, [request.role, "--lines", String(request.lines)], {
    env: {
      ...process.env,
      AI_SWARM_SESSION: request.tmuxSessionName,
    },
    maxBuffer: 256_000,
    timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000,
    windowsHide: true,
  });

  return `${result.stdout}${result.stderr ? `\n[stderr]\n${result.stderr}` : ""}`;
}

function addSecondsIso(value: string, seconds: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  date.setSeconds(date.getSeconds() + seconds);
  return date.toISOString();
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

  if (providerProfileId === "provider_claude_code_single_owner") {
    return ["claude", "cli", "single-owner", "server-proxy", "session"];
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

  if (authMode === "local_cli") {
    return `local:${process.env.CLAUDE_BIN_PATH ?? "claude"}`;
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

  if (authMode === "local_cli") {
    return [
      `bin:${process.env.CLAUDE_BIN_PATH ?? "claude"}`,
      ...(process.env.CLAUDE_CLI_CWD ? [`cwd:${process.env.CLAUDE_CLI_CWD}`] : []),
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
  if ((config.providerProfileId === "provider_grok_oauth_dgx" || config.providerProfileId === "provider_grok_oauth_dgx_2") && process.env.NOTION_DATABASE_ID && process.env.NOTION_API_KEY) {
    const slot = config.providerProfileId === "provider_grok_oauth_dgx" ? "grok-oauth-1" : "grok-oauth-2";
    
    // Check local memory cache first to avoid Notion API overhead
    const cache = localTokenCaches[slot];
    const nowMs = Date.parse(now);
    if (cache) {
      const expiresMs = Date.parse(cache.expiresAt);
      if (expiresMs <= nowMs) {
        return "expired";
      }
      return "available";
    }

    try {
      const row = await fetchNotionTokenRow(slot);
      if (!row) {
        return "missing";
      }
      if (!row.expires_at) {
        return "available"; // Registered without expiration yet
      }
      const expiresAtMs = Date.parse(row.expires_at);
      if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
        return "expired";
      }
      return "available";
    } catch {
      return "missing";
    }
  }

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

export type DgxProviderCompletionOptions = {
  now?: string;
  vllmBaseUrl?: string;
  fetchImpl?: FetchLike;
  claudeCliRunner?: ClaudeExecRunner;
  codexCliRunner?: CodexExecRunner;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  eventStorage?: JsonlServerEventStorage;
};

// Zod schemas for memory endpoints
import {
  memoryLayerSchema,
  memoryScopeSchema,
  memoryKindSchema,
  sourceTrustSchema,
} from "@ai-orchestrator/protocol";

export const memoryRecallQueryZodSchema = z.object({
  sessionId: z.string().optional(),
  projectId: z.string().optional(),
  query: z.string(),
  layers: z.array(memoryLayerSchema).optional(),
  scopes: z.array(memoryScopeSchema).optional(),
  kinds: z.array(memoryKindSchema).optional(),
  includeUntrusted: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
});

export const memoryInputZodSchema = z.object({
  layer: memoryLayerSchema,
  scope: memoryScopeSchema.optional(),
  kind: memoryKindSchema.optional(),
  title: z.string(),
  content: z.string(),
  sourceChannel: z.enum(["desktop", "legacy_telegram", "mobile", "api", "agent"]),
  trustLevel: sourceTrustSchema,
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export function evaluateServerMemoryPermission(
  action: "memory_call" | "memory_write_request" | "memory_promote" | "memory_forget",
  callerTrustLevel: ProviderTrustLevel,
): ServerPermissionGateResult {
  const requestedLevels: PermissionLevel[] = ["memory_access" as any];
  
  if (callerTrustLevel === "untrusted") {
    return {
      action: action as any,
      approvalState: "rejected",
      decision: "deny",
      requestedLevels,
      reason: "untrusted callers are not permitted to call memory APIs directly",
    };
  }
  
  if (action === "memory_forget" || action === "memory_promote") {
    if (callerTrustLevel === "limited") {
      return {
        action: action as any,
        approvalState: "required",
        decision: "approval_required",
        requestedLevels,
        reason: `${action} operation by limited caller requires explicit approval`,
      };
    }
  }
  
  return {
    action: action as any,
    approvalState: "not_required",
    decision: "allow",
    requestedLevels,
    reason: "authorized memory access",
  };
}

export async function createDgxProviderCompletionStreamResponse(
  request: ProviderCompletionRequest,
  options: DgxProviderCompletionOptions = {},
): Promise<AsyncIterable<ProviderCompletionChunkEvent>> {
  const redactedRequest = redactForServerPhase(request, "pre_send").value as ProviderCompletionRequest;
  const vllmBaseUrl = options.vllmBaseUrl ?? process.env.DGX02_VLLM_BASE_URL ?? DEFAULT_DGX02_VLLM_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (redactedRequest.providerProfileId === "provider_dgx02_vllm") {
    const adapter: LlmAdapter = new OpenAICompatibleAdapter({
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
    if (!adapter.completeStreaming) {
      throw new Error("vLLM adapter does not support streaming");
    }
    return adapter.completeStreaming(
      { ...redactedRequest, routePreference: "server_proxy" },
      {
        resolveSecret: async () => undefined,
        abortSignal: options.abortSignal,
        timeoutMs: options.timeoutMs ?? 30_000,
      } as any,
    );
  }

  const config = serverProviderProxyConfigs.find((candidate) => candidate.providerProfileId === redactedRequest.providerProfileId);
  if (!config) {
    throw new Error("provider is not registered in the DGX-02 proxy allowlist");
  }

  const claudeSingleOwnerBlockReason = evaluateClaudeCodeSingleOwnerPolicy(redactedRequest);
  if (claudeSingleOwnerBlockReason) {
    throw new Error(`[blocked] ${claudeSingleOwnerBlockReason}`);
  }

  if (config.providerProfileId === "provider_codex_oauth") {
    const adapter: LlmAdapter = new CodexCliOAuthAdapter({
      profileId: config.providerProfileId,
      codexBinPath: process.env.CODEX_BIN_PATH ?? "codex",
      codexHome: process.env.CODEX_OAUTH_HOME ?? "~/.codex",
      cwd: process.env.CODEX_OAUTH_CWD,
      defaultTimeoutMs: parsePositiveInteger(process.env.CODEX_CLI_TIMEOUT_MS) ?? 30_000,
      modelIds: config.defaultModelIds,
      runCodexExec: options.codexCliRunner,
    });
    if (!adapter.completeStreaming) {
      throw new Error("Codex CLI adapter does not support streaming");
    }
    return adapter.completeStreaming(
      { ...redactedRequest, routePreference: "server_proxy" },
      {
        resolveSecret: async () => undefined,
        abortSignal: options.abortSignal,
        timeoutMs: options.timeoutMs ?? 30_000,
      } as any,
    );
  }

  if (config.providerProfileId === "provider_claude_code_single_owner") {
    const adapter: LlmAdapter = new ClaudeCliAdapter({
      profileId: config.providerProfileId,
      claudeBinPath: process.env.CLAUDE_BIN_PATH ?? "claude",
      claudeHome: process.env.CLAUDE_CLI_HOME,
      cwd: process.env.CLAUDE_CLI_CWD,
      defaultTimeoutMs: parsePositiveInteger(process.env.CLAUDE_CLI_TIMEOUT_MS) ?? 60_000,
      permissionMode: process.env.CLAUDE_CLI_PERMISSION_MODE === "default" ? "default" : "plan",
      modelIds: config.defaultModelIds,
      runClaudeExec: options.claudeCliRunner,
    });
    if (!adapter.completeStreaming) {
      throw new Error("Claude CLI adapter does not support streaming");
    }
    return adapter.completeStreaming(
      { ...redactedRequest, routePreference: "server_proxy" },
      {
        resolveSecret: async () => undefined,
        abortSignal: options.abortSignal,
        timeoutMs: options.timeoutMs ?? 60_000,
      } as any,
    );
  }

  let apiKey = config.noAuth ? undefined : await resolveServerProviderApiKey(config);
  let requiresAuth = !config.noAuth;

  if (config.providerProfileId === "provider_grok_oauth_dgx" || config.providerProfileId === "provider_grok_oauth_dgx_2") {
    const slot = config.providerProfileId === "provider_grok_oauth_dgx" ? "grok-oauth-1" : "grok-oauth-2";
    if (process.env.NOTION_DATABASE_ID && process.env.NOTION_API_KEY) {
      apiKey = await getFreshOAuthTokenWithNotion(slot, { fetchImpl: fetchImpl as any, now: options.now ?? new Date().toISOString() });
      requiresAuth = true;
    } else {
      apiKey = await resolveLocalOAuthAccessTokenFallback(config);
      if (apiKey) {
        requiresAuth = true;
      }
    }
  }

  if (!requiresAuth && !apiKey && config.providerProfileId !== "provider_grok_oauth_dgx" && config.providerProfileId !== "provider_grok_oauth_dgx_2") {
    throw new Error("DGX-02 provider secret was not resolved from env or key file");
  }

  if (config.apiStyle === "anthropic_messages") {
    const adapter: LlmAdapter = new AnthropicAdapter({
      profileId: config.providerProfileId,
      baseUrl: config.baseUrl,
      modelIds: config.defaultModelIds,
      requiresAuth: requiresAuth,
      defaultMaxTokens: 512,
      temperature: 0.2,
      fetchImpl,
    });
    if (!adapter.completeStreaming) {
      throw new Error("Anthropic adapter does not support streaming");
    }
    return adapter.completeStreaming(
      {
        ...redactedRequest,
        messages: [
          { role: "system", content: defaultDgxSystemPrompt },
          ...redactedRequest.messages,
        ],
      },
      {
        resolveSecret: async () => apiKey,
        abortSignal: options.abortSignal,
        timeoutMs: options.timeoutMs ?? 30_000,
      } as any,
    );
  }

  const adapter: LlmAdapter = new OpenAICompatibleAdapter({
    profileId: config.providerProfileId,
    kind: createServerProviderKind(config),
    baseUrl: config.baseUrl,
    modelIds: config.defaultModelIds,
    supportsModelList: config.supportsModelList,
    requiresAuth: requiresAuth,
    defaultSystemPrompt: defaultDgxSystemPrompt,
    maxTokens: 512,
    temperature: 0.2,
    fetchImpl,
  });
  if (!adapter.completeStreaming) {
    throw new Error("OpenAI-compatible adapter does not support streaming");
  }
  return adapter.completeStreaming(
    { ...redactedRequest, routePreference: "server_proxy" },
    {
      resolveSecret: async () => apiKey,
      abortSignal: options.abortSignal,
      timeoutMs: options.timeoutMs ?? 30_000,
    } as any,
  );
}

export async function createDgxProviderCompletionResponse(
  request: ProviderCompletionRequest,
  options: DgxProviderCompletionOptions = {},
): Promise<ProviderCompletionResponse> {
  const redactedRequest = redactForServerPhase(request, "pre_send").value as ProviderCompletionRequest;
  const vllmBaseUrl = options.vllmBaseUrl ?? process.env.DGX02_VLLM_BASE_URL ?? DEFAULT_DGX02_VLLM_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (redactedRequest.providerProfileId !== "provider_dgx02_vllm") {
    return withProviderRuntimeHints(
      redactProviderCompletionResponseForReceive(await createServerProviderProxyCompletionWithHotSwap(redactedRequest, options)),
      redactedRequest,
    );
  }

  return withProviderRuntimeHints(
    redactProviderCompletionResponseForReceive(await createOpenAICompatibleServerCompletion({
      request: redactedRequest,
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
    })),
    redactedRequest,
  );
}

function withProviderRuntimeHints(
  response: ProviderCompletionResponse,
  request: ProviderCompletionRequest,
): ProviderCompletionResponse {
  const budget = resolveProviderBudgetPolicy();
  const estimatedTokens = estimateProviderCompletionBudgetTokens(request.messages);
  const retryHint = classifyProviderRetryHint(response);
  return {
    ...response,
    runtimeHints: {
      estimatedTokens,
      budgetApprovalThresholdTokens: budget.approvalThresholdTokens,
      budgetHardLimitTokens: budget.hardLimitTokens,
      retryable: retryHint.retryable,
      retryReason: retryHint.reason,
    },
  };
}

function classifyProviderRetryHint(response: ProviderCompletionResponse): { retryable: boolean; reason?: string } {
  if (response.status !== "failed") {
    return { retryable: false };
  }
  const error = response.error?.toLowerCase() ?? "";
  if (/\b(408|409|425|429|500|502|503|504)\b/.test(error)) {
    return { retryable: true, reason: "transient_http_status" };
  }
  if (error.includes("timeout") || error.includes("econnreset") || error.includes("fetch") || error.includes("rate")) {
    return { retryable: true, reason: "transient_transport_or_rate_limit" };
  }
  return { retryable: false, reason: "non_retryable_provider_error" };
}

// Grok 세션 관리 및 핫스왑 FSM 구현
interface GrokSessionSlot {
  profileId: string;
  slotName: string; // "grok-oauth-1" | "grok-oauth-2"
  status: "active" | "suspicious" | "invalid";
  lastFailureReason?: string;
  failedAt?: string;
}

class GrokSessionManager {
  private slots: GrokSessionSlot[] = [
    { profileId: "provider_grok_oauth_dgx", slotName: "grok-oauth-1", status: "active" },
    { profileId: "provider_grok_oauth_dgx_2", slotName: "grok-oauth-2", status: "active" }
  ];

  public getSlots(): GrokSessionSlot[] {
    return this.slots;
  }

  public getActiveSlot(preferredProfileId?: string): GrokSessionSlot | null {
    if (preferredProfileId) {
      const preferred = this.slots.find(s => s.profileId === preferredProfileId && s.status === "active");
      if (preferred) return preferred;
    }
    return this.slots.find(s => s.status === "active") ?? null;
  }

  public reportFailure(profileId: string, reason: string) {
    const slot = this.slots.find(s => s.profileId === profileId);
    if (slot) {
      slot.status = "suspicious";
      slot.lastFailureReason = reason;
      slot.failedAt = new Date().toISOString();
      console.warn(`[GrokSessionManager] Slot ${slot.slotName} marked as SUSPICIOUS. Reason: ${reason}`);
    }
  }

  public markAsInvalid(profileId: string) {
    const slot = this.slots.find(s => s.profileId === profileId);
    if (slot) {
      slot.status = "invalid";
      console.error(`[GrokSessionManager] Slot ${slot.slotName} marked as INVALID. Recovery required.`);
    }
  }

  public restoreSlot(profileId: string) {
    const slot = this.slots.find(s => s.profileId === profileId);
    if (slot) {
      slot.status = "active";
      slot.lastFailureReason = undefined;
      slot.failedAt = undefined;
      console.log(`[GrokSessionManager] Slot ${slot.slotName} restored to ACTIVE.`);
    }
  }
}

export const grokSessionManager = new GrokSessionManager();

export async function createServerProviderProxyCompletionWithHotSwap(
  request: ProviderCompletionRequest,
  options: DgxProviderCompletionOptions = {},
): Promise<ProviderCompletionResponse> {
  const isGrokRequest = request.providerProfileId.includes("grok");
  
  if (!isGrokRequest) {
    return createServerProviderProxyCompletionResponse(request, options);
  }

  let attempt = 0;
  const maxAttempts = 3;
  let currentProfileId = request.providerProfileId;
  const triedSlots = new Set<string>();

  while (attempt < maxAttempts) {
    attempt++;
    
    let activeSlot = grokSessionManager.getActiveSlot(currentProfileId);
    if (!activeSlot) {
      console.info(`[Self-healing Routing] No active Grok session slots. Attempting recovery sync from L1 cache/Notion...`);
      for (const slot of grokSessionManager.getSlots()) {
        try {
          await getFreshOAuthTokenWithNotion(slot.slotName, {
            fetchImpl: options.fetchImpl,
            now: options.now ?? new Date().toISOString(),
          });
          grokSessionManager.restoreSlot(slot.profileId);
          console.info(`[Self-healing Routing] Successfully recovered slot ${slot.slotName} during recovery sync.`);
        } catch (e) {
          console.warn(`[Self-healing Routing] Recovery sync failed for slot ${slot.slotName}:`, e);
        }
      }
      activeSlot = grokSessionManager.getActiveSlot(currentProfileId);
    }

    if (!activeSlot) {
      console.error(`[Self-healing Routing] No active Grok session slots available. Initiating block item creation.`);
      await publishSessionBlockQueueItem(request, "All Grok OAuth sessions are expired or invalid.", options.eventStorage);
      return {
        id: `provider_completion_response_${crypto.randomUUID()}`,
        requestId: request.id,
        providerProfileId: request.providerProfileId,
        modelId: request.modelId,
        route: "server_proxy",
        status: "failed",
        error: "All available Grok OAuth session slots failed. Self-healing halted. Please re-authenticate.",
        createdAt: new Date().toISOString(),
      };
    }

    triedSlots.add(activeSlot.profileId);
    
    const modifiedRequest = {
      ...request,
      providerProfileId: activeSlot.profileId
    };

    console.info(`[Self-healing Routing] Attempt ${attempt}: Routing Grok request to ${activeSlot.slotName}`);
    const response = await createServerProviderProxyCompletionResponse(modifiedRequest, options);

    if (response.status === "succeeded") {
      grokSessionManager.restoreSlot(activeSlot.profileId);
      return response;
    }

    const errorMsg = response.error ?? "";
    const isSessionExpired = /unauthorized|401|invalid session|invalid oauth|expired/i.test(errorMsg);

    if (isSessionExpired) {
      console.warn(`[Self-healing Routing] Session expired on ${activeSlot.slotName}. Invalidating local cache and swapping slots.`);
      
      // Invalidate L0 and L1 caches for this slot to force sync/refresh in subsequent recovery attempts
      delete localTokenCaches[activeSlot.slotName];
      try {
        const db = getLocalDb();
        db.prepare(`
          UPDATE local_locks
          SET access_token = NULL, refresh_token = NULL, expires_at = NULL, clock_skew_ms = NULL, token_version = 0
          WHERE slot = ?
        `).run(activeSlot.slotName);
      } catch {}

      grokSessionManager.reportFailure(activeSlot.profileId, errorMsg);
      grokSessionManager.markAsInvalid(activeSlot.profileId);
      
      currentProfileId = activeSlot.profileId === "provider_grok_oauth_dgx" 
        ? "provider_grok_oauth_dgx_2" 
        : "provider_grok_oauth_dgx";
    } else {
      return response;
    }
  }

  await publishSessionBlockQueueItem(request, "Grok OAuth hot-swap failed after maximum retry attempts.", options.eventStorage);
  return {
    id: `provider_completion_response_${crypto.randomUUID()}`,
    requestId: request.id,
    providerProfileId: request.providerProfileId,
    modelId: request.modelId,
    route: "server_proxy",
    status: "failed",
    error: "Grok OAuth hot-swap failed after maximum retry attempts.",
    createdAt: new Date().toISOString(),
  };
}

async function publishSessionBlockQueueItem(
  request: ProviderCompletionRequest,
  reason: string,
  eventStorage?: JsonlServerEventStorage,
) {
  const sessionId = request.sessionId || "session_desktop_001";
  const now = new Date().toISOString();
  const workItemId = `work_item_session_block_${crypto.randomUUID()}`;

  const blockEvent = {
    id: `event_work_item_created_${crypto.randomUUID()}`,
    sessionId,
    type: "work_item.created",
    createdAt: now,
    source: "server" as const,
    sourceTrust: "trusted" as const,
    redacted: false,
    payload: {
      id: workItemId,
      title: "Grok OAuth 세션 복구 및 로그인 승인 필요",
      description: `Grok API 호출 중 세션 자가 복구에 실패했습니다. 모든 계정(Grok #1, #2)의 토큰을 갱신해주십시오. 원인: ${reason}`,
      lane: "blocked",
      status: "planned",
      createdAt: now,
      updatedAt: now,
      metadata: {
        errorReason: reason,
        actionRequired: "re_auth_grok"
      }
    }
  };

  const pushRequest = {
    id: `push_block_${crypto.randomUUID()}`,
    clientId: "server_api",
    sessionId,
    events: [blockEvent],
    idempotencyKey: `idemp_block_${workItemId}`,
    createdAt: now,
  };

  try {
    const storage = eventStorage ?? activeEventStorage ?? createJsonlServerEventStorage();
    await pushEventsToPersistentServerStorage(pushRequest, storage, now);
  } catch (error) {
    console.error("Failed to write session blocking work item:", error);
  }
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

  const claudeSingleOwnerBlockReason = evaluateClaudeCodeSingleOwnerPolicy(request);
  if (claudeSingleOwnerBlockReason) {
    return {
      id: `provider_completion_response_${crypto.randomUUID()}`,
      requestId: request.id,
      providerProfileId: request.providerProfileId,
      modelId: request.modelId,
      route: "server_proxy",
      status: "failed",
      error: `[blocked] ${claudeSingleOwnerBlockReason}`,
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

  if (config.providerProfileId === "provider_claude_code_single_owner") {
    console.info(
      `Claude Code single-owner provider dispatch user=${request.requestContext?.userId ?? "missing"} route=${request.requestContext?.routeType ?? "personal"} concurrency=single-active-session`,
    );
    const adapter = new ClaudeCliAdapter({
      profileId: config.providerProfileId,
      claudeBinPath: process.env.CLAUDE_BIN_PATH ?? "claude",
      claudeHome: process.env.CLAUDE_CLI_HOME,
      cwd: process.env.CLAUDE_CLI_CWD,
      defaultTimeoutMs: parsePositiveInteger(process.env.CLAUDE_CLI_TIMEOUT_MS) ?? 60_000,
      permissionMode: process.env.CLAUDE_CLI_PERMISSION_MODE === "default" ? "default" : "plan",
      modelIds: config.defaultModelIds,
      runClaudeExec: options.claudeCliRunner,
    });
    return adapter.complete(
      {
        ...request,
        routePreference: "server_proxy",
      },
      {
        resolveSecret: async () => undefined,
        timeoutMs: parsePositiveInteger(process.env.CLAUDE_CLI_TIMEOUT_MS) ?? 60_000,
        onRawError(status, redactedSnippet) {
          if (redactedSnippet) {
            console.warn(`Claude CLI adapter warning (${status}): ${redactedSnippet}`);
          }
        },
      },
    );
  }

  let apiKey = config.noAuth ? undefined : await resolveServerProviderApiKey(config);
  let requiresAuth = !config.noAuth;

  if (config.providerProfileId === "provider_grok_oauth_dgx" || config.providerProfileId === "provider_grok_oauth_dgx_2") {
    const slot = config.providerProfileId === "provider_grok_oauth_dgx" ? "grok-oauth-1" : "grok-oauth-2";
    if (process.env.NOTION_DATABASE_ID && process.env.NOTION_API_KEY) {
      try {
        apiKey = await getFreshOAuthTokenWithNotion(slot, { fetchImpl, now: createdAt });
        requiresAuth = true;
      } catch (e) {
        return {
          id: `provider_completion_response_${crypto.randomUUID()}`,
          requestId: request.id,
          providerProfileId: request.providerProfileId,
          modelId: request.modelId,
          route: "server_proxy",
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
          createdAt,
        };
      }
    } else {
      apiKey = await resolveLocalOAuthAccessTokenFallback(config);
      if (apiKey) {
        requiresAuth = true;
      }
    }
  }

  if (!requiresAuth && !apiKey && config.providerProfileId !== "provider_grok_oauth_dgx" && config.providerProfileId !== "provider_grok_oauth_dgx_2") {
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

  if (config.apiStyle === "anthropic_messages") {
    return createAnthropicServerCompletion({
      request,
      profileId: config.providerProfileId,
      baseUrl: config.baseUrl,
      modelIds: config.defaultModelIds,
      requiresAuth: requiresAuth,
      apiKey,
      fetchImpl,
    });
  }

  return createOpenAICompatibleServerCompletion({
    request,
    profileId: config.providerProfileId,
    kind: createServerProviderKind(config),
    baseUrl: config.baseUrl,
    modelIds: config.defaultModelIds,
    supportsModelList: config.supportsModelList,
    requiresAuth: requiresAuth,
    apiKey,
    fetchImpl,
  });
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

function createAnthropicServerCompletion(params: {
  request: ProviderCompletionRequest;
  profileId: string;
  baseUrl: string;
  modelIds: string[];
  requiresAuth: boolean;
  apiKey?: string;
  fetchImpl: FetchLike;
}) {
  const adapter = new AnthropicAdapter({
    profileId: params.profileId,
    baseUrl: params.baseUrl,
    modelIds: params.modelIds,
    requiresAuth: params.requiresAuth,
    defaultMaxTokens: 512,
    temperature: 0.2,
    fetchImpl: params.fetchImpl,
  });

  return adapter.complete(
    {
      ...params.request,
      // Prepend the same Korean-first system prompt the legacy server path
      // injected, so behavior at the SOUL/agent layer stays consistent
      // across the OpenAI-compatible and Anthropic branches.
      messages: [
        {
          role: "system",
          content:
            "Answer directly in Korean when the user writes Korean. Do not reveal reasoning or a thinking process.",
        },
        ...params.request.messages,
      ],
      routePreference: "server_proxy",
    },
    {
      resolveSecret: async () => params.apiKey,
      timeoutMs: 30_000,
      onRawError(status, redactedSnippet) {
        if (redactedSnippet) {
          console.warn(`Anthropic adapter warning (${status}): ${redactedSnippet}`);
        }
      },
    },
  );
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
  const permission = evaluateServerRemoteRunPermission(request);
  if (permission.decision !== "allow") {
    return {
      id: `remote_response_${crypto.randomUUID()}`,
      requestId: request.id,
      status: "blocked",
      targetNodeId: request.targetNodeId,
      fallbackMode: "local_cli",
      message: permission.reason,
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

class ServerEventBroker extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0);
  }

  public publishEvents(sessionId: string, events: any[]) {
    this.emit(`events:${sessionId}`, events);
    this.emit("events:all", { sessionId, events });
  }

  public subscribe(sessionId: string, listener: (events: any[]) => void) {
    this.on(`events:${sessionId}`, listener);
    return () => {
      this.off(`events:${sessionId}`, listener);
    };
  }
}

export const serverEventBroker = new ServerEventBroker();
const activeSseConnections = new Set<ServerResponse>();
export let activeEventStorage: JsonlServerEventStorage | undefined;
export let activeMemoryAdapter: MemoryAdapter | undefined;

async function callCuratorLlm(prompt: string): Promise<string> {
  const config = serverProviderProxyConfigs.find(
    (c) => c.providerProfileId === "provider_dgx02_vllm"
  );
  if (!config) {
    throw new Error("vLLM provider config not found on server");
  }
  const apiKey = config.noAuth ? undefined : await resolveServerProviderApiKey(config);
  
  const adapter = new OpenAICompatibleAdapter({
    profileId: config.providerProfileId,
    kind: createServerProviderKind(config),
    baseUrl: config.baseUrl,
    modelIds: config.defaultModelIds,
    supportsModelList: config.supportsModelList,
    requiresAuth: !config.noAuth,
  });

  const response = await adapter.complete(
    {
      id: `curator_llm_${Date.now()}`,
      createdAt: new Date().toISOString(),
      providerProfileId: config.providerProfileId,
      modelId: config.defaultModelIds[0] ?? "default",
      sessionId: "memory_curator_loop",
      messages: [
        { role: "system", content: "You are Memory Curator. Only answer in valid JSON." },
        { role: "user", content: prompt },
      ],
      source: "server" as any,
      routePreference: "server_proxy",
    },
    {
      resolveSecret: async () => apiKey,
      timeoutMs: 30_000,
    } as any
  );

  return response.content ?? "";
}

function stableIdForCurator(input: string, salt: string): string {
  let h = 0;
  const s = input + salt;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `dgx_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function containsSecrets(text: string): boolean {
  const SECRET_LIKE_PATTERNS = [
    /\bsk-[A-Za-z0-9_-]{16,}\b/,
    /\b(?:claude|anthropic|grok|xai|deepseek|ghp|gho|ghs|ghr|ghu|glpat|pat)[-_][A-Za-z0-9_-]{16,}\b/i,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
    /\b(?:API_KEY|AUTH_TOKEN|SECRET|TOKEN|PASSWORD|PRIVATE_KEY)\s*[:=]\s*[^"'\s,}]{4,}/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ];
  for (const pattern of SECRET_LIKE_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function redactSecretsInText(text: string): string {
  let redacted = text;
  const SECRET_LIKE_PATTERNS = [
    /\bsk-[A-Za-z0-9_-]{16,}\b/g,
    /\b(?:claude|anthropic|grok|xai|deepseek|ghp|gho|ghs|ghr|ghu|glpat|pat)[-_][A-Za-z0-9_-]{16,}\b/gi,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
    /\b(API_KEY|AUTH_TOKEN|SECRET|TOKEN|PASSWORD|PRIVATE_KEY)\s*([:=])\s*([^"'\s,}]{4,})/gi,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[^-]*-----END [A-Z ]*PRIVATE KEY-----/g,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  ];
  for (const pattern of SECRET_LIKE_PATTERNS) {
    if (pattern.source.includes("API_KEY|AUTH_TOKEN")) {
      redacted = redacted.replace(pattern, (match, p1, p2, p3) => `${p1}${p2}<redacted>`);
    } else {
      redacted = redacted.replace(pattern, "<redacted>");
    }
  }
  return redacted;
}

function publishAgentActivityChanged(sessionId: string, agentId: string, currentStep: string) {
  const now = new Date().toISOString();
  const event = {
    id: `activity_change_${crypto.randomUUID()}`,
    sessionId,
    type: "agent.activity.changed",
    createdAt: now,
    source: "server" as const,
    sourceTrust: "trusted" as const,
    redacted: false,
    payload: {
      agentId,
      currentStep,
      timestamp: now,
    }
  };
  serverEventBroker.publishEvents(sessionId, [event]);
}

async function publishMemoryRedactionBlockQueueItem(
  input: any,
  sessionId: string,
  eventStorage?: JsonlServerEventStorage,
) {
  const now = new Date().toISOString();
  const workItemId = `work_item_redaction_block_${crypto.randomUUID()}`;

  const blockEvent = {
    id: `event_work_item_created_${crypto.randomUUID()}`,
    sessionId,
    type: "work_item.created",
    createdAt: now,
    source: "server" as const,
    sourceTrust: "trusted" as const,
    redacted: false,
    payload: {
      id: workItemId,
      title: "민감 정보 검출 승인 대기",
      description: `저장하려는 기억 후보 "${input.title}"에 민감한 정보가 포함되어 있습니다. 마스킹 후 저장하거나 기억을 파기해 주십시오.`,
      lane: "blocked",
      status: "blocked",
      createdAt: now,
      updatedAt: now,
      metadata: {
        actionRequired: "approve_redacted_memory",
        input,
      }
    }
  };

  const pushRequest = {
    id: `push_block_${crypto.randomUUID()}`,
    clientId: "server_api",
    sessionId,
    events: [blockEvent],
    idempotencyKey: `idemp_block_${workItemId}`,
    createdAt: now,
  };

  try {
    const storage = eventStorage ?? activeEventStorage ?? createJsonlServerEventStorage();
    await pushEventsToPersistentServerStorage(pushRequest, storage, now);
    console.log(`[MemoryCurator] Created blocked work item for redaction approval: ${workItemId}`);
  } catch (error) {
    console.error("Failed to write memory redaction blocking work item:", error);
  }
}

async function runMemorySelfHealing(input: any, sessionId: string, retriesLeft = 2): Promise<any> {
  console.log(`[MemoryCurator] Self-healing memory: "${input.title}" (Retries left: ${retriesLeft})`);
  publishAgentActivityChanged(sessionId, "memory_curator", `Self-healing credentials redact (retry left: ${retriesLeft})...`);
  
  const prompt = `
Security gate flagged sensitive credentials (such as API keys, tokens, or passwords) in the proposed memory.
Please rewrite the memory content to sanitize, mask, or replace all API keys/credentials with "<redacted>" while preserving all other details.
Do not omit the context of what the key is for, just replace the literal key/token/password values.

[Original Title]
${input.title}

[Original Content]
${input.content}

Return the sanitized memory in the following JSON format:
{
  "title": "sanitized title",
  "content": "sanitized content"
}
`;

  try {
    const llmResponse = await callCuratorLlm(prompt);
    const cleanJsonStr = llmResponse.replace(/\`\`\`json|\`\`\`/g, "").trim();
    const parsed = JSON.parse(cleanJsonStr);
    
    if (parsed && parsed.title && parsed.content) {
      const sanitizedInput = {
        ...input,
        title: parsed.title,
        content: parsed.content,
      };

      if (containsSecrets(sanitizedInput.title) || containsSecrets(sanitizedInput.content)) {
        if (retriesLeft > 1) {
          return await runMemorySelfHealing(sanitizedInput, sessionId, retriesLeft - 1);
        } else {
          publishAgentActivityChanged(sessionId, "memory_curator", "Redaction Pending: Awaiting user approval...");
          await publishMemoryRedactionBlockQueueItem(input, sessionId);
          return { status: "blocked", message: "redaction_pending" };
        }
      }

      const now = new Date().toISOString();
      const recordId = stableIdForCurator(`${sanitizedInput.title}:${sanitizedInput.content}`, now);
      const record = {
        id: recordId,
        layer: sanitizedInput.layer,
        scope: sanitizedInput.scope ?? "session",
        kind: sanitizedInput.kind ?? "context",
        title: sanitizedInput.title,
        content: sanitizedInput.content,
        sourceChannel: sanitizedInput.sourceChannel,
        trustLevel: sanitizedInput.trustLevel,
        projectId: sanitizedInput.projectId,
        sessionId: sessionId,
        tags: sanitizedInput.tags ?? [],
        activationState: "active" as const,
        createdAt: now,
        pinned: false,
      };

      if (activeMemoryAdapter && (activeMemoryAdapter as any).injectRecord) {
        (activeMemoryAdapter as any).injectRecord(record);
      }

      const promotedEvent = {
        id: `curator_promoted_${crypto.randomUUID()}`,
        sessionId,
        type: "memory.archival_write.promoted",
        payload: {
          kind: "archival_write_promoted" as const,
          input: sanitizedInput,
          decisionReason: "Self-healing completed successfully",
          record,
        },
        createdAt: now,
        source: "agent" as const,
        sourceTrust: "trusted" as const,
        redacted: true,
      };
      
      if (activeEventStorage) {
        await pushEventsToPersistentServerStorage({
          id: `sync_${crypto.randomUUID()}`,
          createdAt: now,
          sessionId,
          clientId: "server_curator",
          idempotencyKey: `idem_${crypto.randomUUID()}`,
          events: [promotedEvent]
        }, activeEventStorage);
      }

      publishAgentActivityChanged(sessionId, "memory_curator", "Idle");
      return record;
    }
  } catch (err) {
    console.error("[MemoryCurator] Self-healing iteration failed:", err);
  }

  if (retriesLeft > 1) {
    return await runMemorySelfHealing(input, sessionId, retriesLeft - 1);
  } else {
    publishAgentActivityChanged(sessionId, "memory_curator", "Redaction Pending: Awaiting user approval...");
    await publishMemoryRedactionBlockQueueItem(input, sessionId);
    return { status: "blocked", message: "redaction_pending" };
  }
}

async function runMemoryCuratorLoop(event: any) {
  const payload = event.payload;
  if (!payload || payload.kind !== "archival_write_requested") return;
  const input = payload.input;
  const sessionId = event.sessionId;

  console.log(`[MemoryCurator] Processing archival write: "${input.title}"`);
  publishAgentActivityChanged(sessionId, "memory_curator", "Recalling and analyzing memory duplicates...");

  if (containsSecrets(input.title) || containsSecrets(input.content)) {
    console.log(`[MemoryCurator] Secret detected in runMemoryCuratorLoop! Initiating self-healing.`);
    await runMemorySelfHealing(input, sessionId);
    return;
  }

  if (!activeMemoryAdapter) {
    console.error("[MemoryCurator] activeMemoryAdapter is not initialized");
    return;
  }

  const ctx: MemoryAdapterContext = {
    permissionDecision: "allow",
    callerTrustLevel: "trusted",
    appendEvent: async (ev) => {
      if (activeEventStorage) {
        await pushEventsToPersistentServerStorage({
          id: `sync_${crypto.randomUUID()}`,
          createdAt: new Date().toISOString(),
          sessionId,
          clientId: "server_curator",
          idempotencyKey: `idem_${crypto.randomUUID()}`,
          events: [ev as any]
        }, activeEventStorage);
      }
    },
  };

  const recalls = await activeMemoryAdapter.recall({
    query: `${input.title} ${input.content}`,
    limit: 5,
    sessionId,
  }, ctx);

  const existingMemoriesStr = recalls.map((r, idx) => {
    return `${idx + 1}. [제목: ${r.record.title}] [내용: ${r.record.content}]`;
  }).join("\n");

  const prompt = `
당신은 지식 관리자(Memory Curator)인 레이 아야나미입니다.
새로 저장 요청된 기억 후보가 기존 기억들과 중복되거나 모순되는지 판단하십시오.

[새 기억 후보]
제목: ${input.title}
내용: ${input.content}
태그: ${(input.tags ?? []).join(", ")}

[기존 관련 기억 목록]
${existingMemoriesStr || "(기존 관련 기억 없음)"}

분석 후 반드시 다음 JSON 형식으로만 답변하십시오. 설명이나 다른 텍스트는 절대 포함하지 마십시오:
{
  "decision": "promote" | "reject",
  "reason": "결정 이유 설명",
  "isDuplicate": true | false,
  "isContradiction": true | false
}
`;

  let decisionResult = {
    decision: "promote",
    reason: "기존 기억 없음 - 자동 승격",
    isDuplicate: false,
    isContradiction: false,
  };

  if (recalls.length > 0) {
    try {
      const llmResponse = await callCuratorLlm(prompt);
      const cleanJsonStr = llmResponse.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleanJsonStr);
      if (parsed && (parsed.decision === "promote" || parsed.decision === "reject")) {
        decisionResult = parsed;
      }
    } catch (err) {
      console.warn("[MemoryCurator] LLM evaluation failed, falling back to promote:", err);
    }
  }

  const now = new Date().toISOString();
  if (decisionResult.decision === "promote") {
    console.log(`[MemoryCurator] Promoted memory: "${input.title}"`);
    
    const recordId = stableIdForCurator(`${input.title}:${input.content}`, now);
    const record = {
      id: recordId,
      layer: input.layer,
      scope: input.scope ?? "session",
      kind: input.kind ?? "context",
      title: input.title,
      content: input.content,
      sourceChannel: input.sourceChannel,
      trustLevel: input.trustLevel,
      projectId: input.projectId,
      sessionId: sessionId,
      tags: input.tags ?? [],
      activationState: "active" as const,
      createdAt: now,
      pinned: false,
    };

    const promotedEvent = {
      id: `curator_promoted_${crypto.randomUUID()}`,
      sessionId,
      type: "memory.archival_write.promoted",
      payload: {
        kind: "archival_write_promoted" as const,
        input,
        decisionReason: decisionResult.reason,
        record,
      },
      createdAt: now,
      source: "agent" as const,
      sourceTrust: "trusted" as const,
      redacted: false,
    };
    
    if (activeEventStorage) {
      await pushEventsToPersistentServerStorage({
        id: `sync_${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        sessionId,
        clientId: "server_curator",
        idempotencyKey: `idem_${crypto.randomUUID()}`,
        events: [promotedEvent]
      }, activeEventStorage);
    }

    if (activeMemoryAdapter.injectRecord) {
      activeMemoryAdapter.injectRecord(record);
    }
    publishAgentActivityChanged(sessionId, "memory_curator", "Idle");
  } else {
    console.log(`[MemoryCurator] Rejected memory: "${input.title}". Reason: ${decisionResult.reason}`);
    
    const rejectedEvent = {
      id: `curator_rejected_${crypto.randomUUID()}`,
      sessionId,
      type: "memory.archival_write.rejected",
      payload: {
        kind: "archival_write_rejected" as const,
        input,
        decisionReason: decisionResult.reason,
      },
      createdAt: now,
      source: "agent" as const,
      sourceTrust: "trusted" as const,
      redacted: false,
    };
    
    if (activeEventStorage) {
      await pushEventsToPersistentServerStorage({
        id: `sync_${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        sessionId,
        clientId: "server_curator",
        idempotencyKey: `idem_${crypto.randomUUID()}`,
        events: [rejectedEvent]
      }, activeEventStorage);
    }
    publishAgentActivityChanged(sessionId, "memory_curator", "Idle");
  }
}

serverEventBroker.on("events:all", ({ sessionId, events }) => {
  for (const event of events) {
    if (event.type === "memory.archival_write.requested") {
      runMemoryCuratorLoop(event).catch((err) => {
        console.error("[MemoryCurator] Error in background curator loop:", err);
      });
    }
  }
});

export async function pushEventsToPersistentServerStorage(
  request: EventSyncPushRequest,
  storage: JsonlServerEventStorage,
  now = new Date().toISOString(),
): Promise<EventSyncPushResponse> {
  return enqueueStorageTask(storage, async () => {
    const state = await storage.statePromise;
    const response = pushEventsToServerStorage(request, state, now);
    await appendAcceptedEventsToJsonl(request, response, storage.eventLogPath, now);

    const acceptedEvents = request.events.filter(event => 
      response.results.some(r => r.eventId === event.id && r.status === "accepted")
    );

    if (acceptedEvents.length > 0) {
      serverEventBroker.publishEvents(request.sessionId, acceptedEvents);
    }

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
  activeEventStorage = eventStorage;
  
  const memoryAdapterKind = (process.env.MEMORY_ADAPTER ?? "local_heuristic") as MemoryAdapterKind;
  let rawMemoryAdapter: MemoryAdapter;
  if (memoryAdapterKind === "memento_mcp") {
    rawMemoryAdapter = new MementoMcpAdapter({
      profileId: "server_memento_mcp",
      policy: (process.env.MEMENTO_POLICY ?? "local_cache") as any,
    });
  } else if (memoryAdapterKind === "dgx_simplemem") {
    rawMemoryAdapter = new (DgxSimpleMemMemoryAdapter as any)({
      profileId: "server_dgx_simplemem",
    });
  } else {
    rawMemoryAdapter = new LocalHeuristicAdapter("server_local_heuristic");
  }
  const memoryAdapter = withTrustEnforcement(rawMemoryAdapter, {
    allowUntrustedRecall: process.env.MEMORY_ALLOW_UNTRUSTED_RECALL === "true",
    allowUntrustedWrite: process.env.MEMORY_ALLOW_UNTRUSTED_WRITE === "true",
    requireAllowDecision: true,
  });
  activeMemoryAdapter = memoryAdapter;

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

    if (pathname === "/api/xai-oauth/status") {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        ...corsHeaders,
      });
      const slot = requestUrl.searchParams.get("slot") ?? "grok-oauth-1";
      try {
        const row = await fetchNotionTokenRow(slot);
        if (!row) {
          response.end(JSON.stringify({ authenticated: false }));
          return;
        }
        
        let label = slot;
        let expiresAt = row.expires_at;
        let tier = 1;

        if (row.encrypted_token_bundle) {
          try {
            const encryptionKey = process.env.SHARED_ENCRYPTION_KEY ?? "grok-notion-shared-key-32-chars";
            const decryptedStr = decryptToken(row.encrypted_token_bundle, row.nonce, row.key_id, encryptionKey);
            const decrypted = JSON.parse(decryptedStr);
            expiresAt = decrypted.expires_at;
            label = decrypted.label ?? slot;
            tier = decrypted.tier ?? 1;
          } catch {}
        }

        response.end(JSON.stringify({
          authenticated: true,
          label,
          expiresAt,
          tier,
        }));
      } catch (e) {
        response.end(JSON.stringify({
          authenticated: false,
          error: "Notion read error",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
      return;
    }

    if (pathname === "/api/xai-oauth/refresh" && request.method === "POST") {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        ...corsHeaders,
      });
      try {
        const body = await readJsonBody(request) as any;
        const slot = body.slot ?? "grok-oauth-1";
        const token = await getFreshOAuthTokenWithNotion(slot);
        
        const row = await fetchNotionTokenRow(slot);
        response.end(JSON.stringify({
          success: true,
          authenticated: true,
          expiresAt: row?.expires_at,
          lastVerifiedBy: row?.last_verified_by,
          lastTestResult: row?.last_test_result,
        }));
      } catch (e) {
        response.end(JSON.stringify({
          success: false,
          error: "Refresh failed",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
      return;
    }

    if (pathname === "/api/xai-oauth/logout" && request.method === "POST") {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        ...corsHeaders,
      });
      try {
        const body = await readJsonBody(request) as any;
        const slot = body.slot ?? "grok-oauth-1";
        
        const row = await fetchNotionTokenRow(slot);
        if (row) {
          await writeNotionTokenRow(slot, {
            encrypted_token_bundle: "",
            nonce: "",
            key_id: "",
            expires_at: "",
            token_version: 0,
            lock_owner: null,
            lock_until: null,
            last_verified_by: "",
            last_test_result: "logged_out",
          }, row.pageId);
        }

        delete localTokenCaches[slot];
        await deleteWAL(slot);
        
        // Also delete L1 shared cache in SQLite to prevent other processes using stale token
        try {
          const db = getLocalDb();
          db.prepare(`
            UPDATE local_locks
            SET access_token = NULL, refresh_token = NULL, expires_at = NULL, clock_skew_ms = NULL, token_version = 0
            WHERE slot = ?
          `).run(slot);
        } catch {}

        response.end(JSON.stringify({
          success: true,
          authenticated: false,
        }));
      } catch (e) {
        response.end(JSON.stringify({
          success: false,
          error: "Logout failed",
          message: e instanceof Error ? e.message : String(e),
        }));
      }
      return;
    }

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
      const permission = evaluateServerProviderCompletionPermission(payload);
      if (permission.decision !== "allow") {
        let approval: ApprovalRequest | undefined;
        if (permission.decision === "approval_required") {
          approval = createProviderCompletionApprovalRequest(payload, permission);
          try {
            await recordApprovalRequestToPersistentServerStorage(approval, eventStorage);
          } catch (error) {
            respondJson(500, {
              error: "approval_queue_write_failed",
              message: error instanceof Error ? error.message : String(error),
            });
            return;
          }
        }
        respondJson(403, {
          error: permission.decision === "deny" ? "permission_denied" : "permission_required",
          permission,
          approval,
        });
        return;
      }
      const completion = await createDgxProviderCompletionResponse(payload, { eventStorage });
      respondJson(completion.status === "succeeded" ? 200 : 502, completion);
      return;
    }

    if (pathname === "/provider-completions/stream" && request.method === "POST") {
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
      const permission = evaluateServerProviderCompletionPermission(payload);
      if (permission.decision !== "allow") {
        respondJson(403, {
          error: permission.decision === "deny" ? "permission_denied" : "permission_required",
          permission,
        });
        return;
      }

      response.writeHead(200, {
        "cache-control": "no-cache",
        "connection": "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
        ...corsHeaders,
      });

      const abortController = new AbortController();
      const onClose = () => {
        abortController.abort();
      };
      request.on("close", onClose);

      const safeWrite = (chunk: string) => {
        if (response.destroyed || response.writableEnded) {
          return;
        }
        try {
          response.write(chunk);
        } catch (error) {
          console.error("[ProviderStream] Failed to write chunk:", error);
        }
      };

      try {
        const rawStream = await createDgxProviderCompletionStreamResponse(payload, {
          abortSignal: abortController.signal,
        });
        const stream = wrapStreamWithRedaction(rawStream);
        for await (const chunk of stream) {
          safeWrite(`event: chunk\ndata: ${JSON.stringify(chunk)}\n\n`);
        }
      } catch (error) {
        const errChunk = {
          type: "error" as const,
          requestId: payload.id,
          error: {
            category: "unknown" as any,
            message: error instanceof Error ? error.message : String(error),
          }
        };
        safeWrite(`event: chunk\ndata: ${JSON.stringify(errChunk)}\n\n`);
      } finally {
        request.off("close", onClose);
        try {
          if (!response.destroyed) {
            response.end();
          }
        } catch (e) {}
      }
      return;
    }

    if (pathname === "/api/cluster-locks" && request.method === "GET") {
      try {
        const db = getLocalDb();
        const rows = db.prepare("SELECT slot, lock_owner, lock_until, token_version, clock_skew_ms, updated_at FROM local_locks").all() as any[];
        const mapped = rows.map((row) => ({
          slot: row.slot,
          lockOwner: row.lock_owner,
          lockUntil: row.lock_until,
          tokenVersion: row.token_version,
          clockSkewMs: row.clock_skew_ms,
          updatedAt: row.updated_at,
        }));
        respondJson(200, mapped);
      } catch (error) {
        respondJson(500, { error: "cluster_locks_query_failed", message: String(error) });
      }
      return;
    }

    if (pathname === "/memory/recall" && request.method === "POST") {
      let body: any;
      try {
        body = memoryRecallQueryZodSchema.parse(await readJsonBody(request));
      } catch (error) {
        respondJson(400, { error: "invalid_recall_query", message: String(error) });
        return;
      }
      const callerTrustLevel = body.callerTrustLevel ?? "trusted";
      const permission = evaluateServerMemoryPermission("memory_call", callerTrustLevel);
      if (permission.decision !== "allow") {
        respondJson(403, { error: "permission_denied", permission });
        return;
      }
      try {
        const results = await memoryAdapter.recall(body, {
          permissionDecision: permission.decision,
          callerTrustLevel,
        });
        respondJson(200, results);
      } catch (error) {
        respondJson(500, { error: "memory_recall_failed", message: String(error) });
      }
      return;
    }

    if (pathname === "/memory/remember" && request.method === "POST") {
      let body: any;
      try {
        body = memoryInputZodSchema.parse(await readJsonBody(request));
      } catch (error) {
        respondJson(400, { error: "invalid_memory_input", message: String(error) });
        return;
      }
      const callerTrustLevel = body.callerTrustLevel ?? "trusted";
      const permission = evaluateServerMemoryPermission("memory_write_request", callerTrustLevel);
      if (permission.decision !== "allow") {
        respondJson(403, { error: "permission_denied", permission });
        return;
      }
      try {
        const record = await memoryAdapter.remember(body, {
          permissionDecision: permission.decision,
          callerTrustLevel,
        });
        respondJson(200, record);
      } catch (error: any) {
        const sessionId = body.sessionId || "session_desktop_001";
        if (error instanceof Error && (error.message.includes("redaction_required") || (error as any).category === "redaction_required")) {
          console.log("[Server API] remember failed due to redaction_required. Initiating background self-healing.");
          runMemorySelfHealing(body, sessionId).catch((err) => {
             console.error("[MemoryCurator] Self-healing background error:", err);
          });
          respondJson(202, { status: "pending", message: "redaction_pending" });
        } else if (error instanceof Error && error.message.includes("promotion_pending")) {
          respondJson(202, { status: "pending", message: "promotion_pending" });
        } else if (typeof error === "object" && error !== null && (error as any).category === "promotion_pending") {
          respondJson(202, { status: "pending", message: "promotion_pending" });
        } else {
          respondJson(500, { error: "memory_remember_failed", message: String(error) });
        }
      }
      return;
    }

    if (pathname === "/memory/context" && request.method === "POST") {
      let body: any;
      try {
        body = memoryRecallQueryZodSchema.parse(await readJsonBody(request));
      } catch (error) {
        respondJson(400, { error: "invalid_recall_query", message: String(error) });
        return;
      }
      const callerTrustLevel = body.callerTrustLevel ?? "trusted";
      const permission = evaluateServerMemoryPermission("memory_call", callerTrustLevel);
      if (permission.decision !== "allow") {
        respondJson(403, { error: "permission_denied", permission });
        return;
      }
      try {
        const packet = await memoryAdapter.memoryContext(body, {
          permissionDecision: permission.decision,
          callerTrustLevel,
        });
        respondJson(200, packet);
      } catch (error) {
        respondJson(500, { error: "memory_context_failed", message: String(error) });
      }
      return;
    }

    if (pathname === "/memory/stats" && request.method === "GET") {
      const permission = evaluateServerMemoryPermission("memory_call", "trusted");
      if (permission.decision !== "allow") {
        respondJson(403, { error: "permission_denied", permission });
        return;
      }
      try {
        const stats = await memoryAdapter.stats({
          permissionDecision: permission.decision,
          callerTrustLevel: "trusted",
        });
        respondJson(200, stats);
      } catch (error) {
        respondJson(500, { error: "memory_stats_failed", message: String(error) });
      }
      return;
    }

    if (pathname === "/memory/pin" && request.method === "POST") {
      let body: any;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        respondJson(400, { error: "invalid_body" });
        return;
      }
      const recordId = body.recordId;
      if (typeof recordId !== "string") {
        respondJson(400, { error: "recordId is required" });
        return;
      }
      const callerTrustLevel = body.callerTrustLevel ?? "trusted";
      const permission = evaluateServerMemoryPermission("memory_call", callerTrustLevel);
      if (permission.decision !== "allow") {
        respondJson(403, { error: "permission_denied", permission });
        return;
      }
      try {
        await memoryAdapter.pin(recordId, {
          permissionDecision: permission.decision,
          callerTrustLevel,
        });
        respondJson(200, { success: true });
      } catch (error) {
        if (error instanceof Error && error.message.includes("promotion_pending")) {
          respondJson(202, { status: "pending", message: "promotion_pending" });
        } else if (typeof error === "object" && error !== null && (error as any).category === "promotion_pending") {
          respondJson(202, { status: "pending", message: "promotion_pending" });
        } else {
          respondJson(500, { error: "memory_pin_failed", message: String(error) });
        }
      }
      return;
    }

    if (pathname === "/memory/forget" && request.method === "POST") {
      let body: any;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        respondJson(400, { error: "invalid_body" });
        return;
      }
      const recordId = body.recordId;
      if (typeof recordId !== "string") {
        respondJson(400, { error: "recordId is required" });
        return;
      }
      const callerTrustLevel = body.callerTrustLevel ?? "trusted";
      const permission = evaluateServerMemoryPermission("memory_forget", callerTrustLevel);
      if (permission.decision !== "allow") {
        respondJson(403, { error: "permission_denied", permission });
        return;
      }
      try {
        await memoryAdapter.forget(recordId, {
          permissionDecision: permission.decision,
          callerTrustLevel,
        });
        respondJson(200, { success: true });
      } catch (error) {
        if (error instanceof Error && error.message.includes("promotion_pending")) {
          respondJson(202, { status: "pending", message: "promotion_pending" });
        } else if (typeof error === "object" && error !== null && (error as any).category === "promotion_pending") {
          respondJson(202, { status: "pending", message: "promotion_pending" });
        } else {
          respondJson(500, { error: "memory_forget_failed", message: String(error) });
        }
      }
      return;
    }

    if (pathname === "/memory/activate" && request.method === "POST") {
      let body: any;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        respondJson(400, { error: "invalid_body" });
        return;
      }
      const recordIds = body.recordIds;
      if (!Array.isArray(recordIds)) {
        respondJson(400, { error: "recordIds array is required" });
        return;
      }
      const callerTrustLevel = body.callerTrustLevel ?? "trusted";
      const permission = evaluateServerMemoryPermission("memory_promote", callerTrustLevel);
      if (permission.decision !== "allow") {
        respondJson(403, { error: "permission_denied", permission });
        return;
      }
      try {
        await memoryAdapter.activateMemories(recordIds, {
          permissionDecision: permission.decision,
          callerTrustLevel,
        });
        respondJson(200, { success: true });
      } catch (error) {
        if (error instanceof Error && error.message.includes("promotion_pending")) {
          respondJson(202, { status: "pending", message: "promotion_pending" });
        } else if (typeof error === "object" && error !== null && (error as any).category === "promotion_pending") {
          respondJson(202, { status: "pending", message: "promotion_pending" });
        } else {
          respondJson(500, { error: "memory_activate_failed", message: String(error) });
        }
      }
      return;
    }

    if (pathname === "/memory/relations" && request.method === "POST") {
      let body: any;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        respondJson(400, { error: "invalid_body" });
        return;
      }
      const recordIds = body.recordIds;
      if (!Array.isArray(recordIds)) {
        respondJson(400, { error: "recordIds array is required" });
        return;
      }
      const callerTrustLevel = body.callerTrustLevel ?? "trusted";
      const permission = evaluateServerMemoryPermission("memory_call", callerTrustLevel);
      if (permission.decision !== "allow") {
        respondJson(403, { error: "permission_denied", permission });
        return;
      }
      try {
        const relations = await memoryAdapter.createRelations(recordIds, {
          permissionDecision: permission.decision,
          callerTrustLevel,
        });
        respondJson(200, relations);
      } catch (error) {
        respondJson(500, { error: "memory_relations_failed", message: String(error) });
      }
      return;
    }

    if (pathname === "/memory/reflect" && request.method === "POST") {
      let body: any;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        respondJson(400, { error: "invalid_body" });
        return;
      }
      const sessionId = body.sessionId;
      if (typeof sessionId !== "string") {
        respondJson(400, { error: "sessionId is required" });
        return;
      }
      const callerTrustLevel = body.callerTrustLevel ?? "trusted";
      const permission = evaluateServerMemoryPermission("memory_call", callerTrustLevel);
      if (permission.decision !== "allow") {
        respondJson(403, { error: "permission_denied", permission });
        return;
      }
      try {
        if (!memoryAdapter.reflect) {
          respondJson(501, { error: "not_implemented", message: "reflection not supported by current adapter" });
          return;
        }
        const reflection = await memoryAdapter.reflect(sessionId, {
          permissionDecision: permission.decision,
          callerTrustLevel,
        });
        respondJson(200, reflection);
      } catch (error) {
        respondJson(500, { error: "memory_reflect_failed", message: String(error) });
      }
      return;
    }

    if (pathname === "/agent-delegations/execute" && request.method === "POST") {
      let payload: ServerAgentDelegationExecuteRequest;
      try {
        payload = parseServerAgentDelegationExecuteRequest(await readJsonBody(request));
      } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
          respondJson(413, { error: "payload_too_large", limit: error.limit });
          return;
        }
        respondJson(400, {
          error: "invalid_agent_delegation_payload",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      if (payload.executionMode === "mock" && process.env.NODE_ENV === "production") {
        respondJson(403, {
          error: "mock_delegation_disabled",
          message: "mock agent delegation execution is disabled in production",
        });
        return;
      }

      try {
        const completion =
          payload.executionMode === "mock"
            ? createServerAgentDelegationMockCompletionFactory()
            : (completionRequest: ProviderCompletionRequest) =>
                createServerAgentDelegationCompletionWithGate(
                  completionRequest,
                  eventStorage,
                  createServerAgentDelegationApprovalReplay(payload),
                );
        const result = await createServerAgentDelegationExecution(payload, {
          completeProvider: completion,
          now: payload.createdAt,
        });
        const eventSync = result.events.length
          ? await pushEventsToPersistentServerStorage(
              createServerAgentDelegationEventSyncRequest(payload, result.events, result.createdAt),
              eventStorage,
              result.createdAt,
            )
          : undefined;
        respondJson(202, {
          ...result,
          eventSync,
        });
      } catch (error) {
        if (error instanceof ServerAgentDelegationPermissionError) {
          respondJson(403, {
            error: error.permission.decision === "deny" ? "permission_denied" : "permission_required",
            permission: error.permission,
            approval: error.approval,
          });
          return;
        }
        respondJson(502, {
          error: "agent_delegation_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (pathname === "/approvals/replay" && request.method === "POST") {
      let payload: ApprovalDecisionRequest;
      try {
        payload = approvalDecisionRequestSchema.parse(await readJsonBody(request)) as ApprovalDecisionRequest;
      } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
          respondJson(413, { error: "payload_too_large", limit: error.limit });
          return;
        }
        respondJson(400, {
          error: "invalid_approval_replay_payload",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      try {
        const result = await replayApprovedRequestFromPersistentServerStorage(payload, eventStorage);
        respondJson(result.statusCode, result.payload);
      } catch (error) {
        if (
          error instanceof RequestBodyTooLargeError ||
          (error instanceof Error && error.message.includes("mock agent delegation execution is disabled"))
        ) {
          respondJson(403, {
            error: "approval_replay_denied",
            message: error instanceof Error ? error.message : String(error),
          });
          return;
        }
        respondJson(502, {
          error: "approval_replay_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
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
      const remoteResponse = createRemoteRunResponse(payload);
      const permission = evaluateServerRemoteRunPermission(payload);
      let approval: ApprovalRequest | undefined;
      if (permission.decision === "approval_required") {
        approval = createRemoteRunApprovalRequest(payload, permission);
        try {
          await recordApprovalRequestToPersistentServerStorage(approval, eventStorage);
        } catch (error) {
          respondJson(500, {
            error: "approval_queue_write_failed",
            message: error instanceof Error ? error.message : String(error),
          });
          return;
        }
      }
      respondJson(202, {
        ...remoteResponse,
        approval,
      });
      return;
    }

    if (
      await handleApprovalRoute({
        eventStorage,
        request,
        pathname,
        method: request.method,
        readJsonBody,
        isRequestBodyTooLargeError: (error): error is RequestBodyTooLargeError =>
          error instanceof RequestBodyTooLargeError,
        listApprovals: listApprovalsFromPersistentServerStorage,
        decideApproval: decideApprovalInPersistentServerStorage,
        respondJson,
      })
    ) {
      return;
    }

    if (pathname === "/ingress/events" && request.method === "POST") {
      let payload: ServerIngressInput;
      try {
        payload = parseServerIngressInput(await readJsonBody(request));
      } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
          respondJson(413, { error: "payload_too_large", limit: error.limit });
          return;
        }
        respondJson(400, {
          error: "invalid_ingress_payload",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      try {
        respondJson(202, await recordServerIngressToPersistentServerStorage(payload, eventStorage));
      } catch (error) {
        respondJson(500, {
          error: "ingress_event_storage_write_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (pathname === "/tmux/preflight" && request.method === "POST") {
      let payload: ServerTmuxDispatchRequest;
      try {
        payload = parseServerTmuxDispatchRequest(await readJsonBody(request));
      } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
          respondJson(413, { error: "payload_too_large", limit: error.limit });
          return;
        }
        respondJson(400, {
          error: "invalid_tmux_preflight_payload",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      respondJson(200, createServerTmuxPreflightResponse(payload));
      return;
    }

    if (
      await handleTmuxRoute({
        eventStorage,
        request,
        pathname,
        method: request.method,
        readJsonBody,
        isRequestBodyTooLargeError: (error): error is RequestBodyTooLargeError =>
          error instanceof RequestBodyTooLargeError,
        parseDispatchRequest: parseServerTmuxDispatchRequest,
        recordDispatch: recordServerTmuxDispatchToPersistentServerStorage,
        dispatchStatusCode: (result) => (result.permission.decision === "deny" ? 403 : 202),
        parseCaptureRequest: parseServerTmuxCaptureRequest,
        recordCapture: recordServerTmuxCaptureToPersistentServerStorage,
        captureStatusCode: (result) => (result.status === "failed" ? 502 : 202),
        respondJson,
      })
    ) {
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

    if (pathname === "/verify-packet" && request.method === "POST") {
      let body: any;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        respondJson(400, { error: "invalid_body" });
        return;
      }

      let packet: any;
      try {
        packet = codingPacketSchema.parse(body);
      } catch (error) {
        respondJson(400, {
          error: "invalid_coding_packet",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      let command = body.command || "corepack pnpm test";
      
      // Command Sanitization for Sandbox Safety
      try {
        const trimmed = command.trim();
        const isTestNodeCommand = trimmed === 'node -e "process.exit(0)"' || trimmed === 'node -e "process.exit(1)"';
        
        if (isTestNodeCommand) {
          command = trimmed;
        } else {
          const forbidden = [";", "&", "|", "`", "$", "<", ">", "(", ")", "{", "}", "\n", "\r", "\0"];
          for (const char of forbidden) {
            if (trimmed.includes(char)) {
              throw new Error(`Forbidden character "${char}" detected in command.`);
            }
          }
          const allowed = ["corepack pnpm", "pnpm", "vitest", "npm run", "npx vitest"];
          const isApprovedBase = allowed.some((base: string) => {
            return trimmed === base || trimmed.startsWith(base + " ");
          });
          
          if (!isApprovedBase) {
            throw new Error("Command must start with an approved build/test tool.");
          }

          const words = trimmed.split(/\s+/);
          const cleanWords = words.map((w: string) => w.replace(/['"\\^]/g, "").toLowerCase());
          
          const blockedSubcommands = ["exec", "shell", "dlx", "create", "install", "add", "update", "link", "publish", "init", "i"];
          for (const blocked of blockedSubcommands) {
            if (cleanWords.includes(blocked)) {
              throw new Error(`Subcommand or argument "${blocked}" is not allowed.`);
            }
          }

          if (cleanWords[0] === "npx" && cleanWords[1] !== "vitest") {
            throw new Error("Only vitest is allowed with npx.");
          }

          command = trimmed;
        }
      } catch (err: any) {
        respondJson(400, {
          error: "unsafe_command",
          message: err.message || "Command failed security validation.",
        });
        return;
      }

      const rootDir = process.cwd().includes("apps") ? resolve(process.cwd(), "../..") : process.cwd();

      try {
        const { exec } = await import("node:child_process");
        const execAsync = promisify(exec);
        const result = await execAsync(command, {
          cwd: rootDir,
          timeout: 30000,
        });

        const stdout = result.stdout || "";
        const stderr = result.stderr || "";
        const hasCompileError = stdout.includes("error TS") || stderr.includes("error TS");
        const hasTestFailure = stdout.includes("FAIL") || stderr.includes("FAIL") || stdout.includes("failed") || stderr.includes("failed");

        const compilerStatus = hasCompileError ? "fail" : "pass";
        const testStatus = hasTestFailure ? "fail" : "pass";

        respondJson(200, {
          status: (hasCompileError || hasTestFailure) ? "warning" : "passed",
          checks: [
            { label: "Compiler checks", status: compilerStatus },
            { label: "Unit test coverage", status: testStatus },
          ],
          stdout: stdout,
          stderr: stderr,
          exitCode: 0,
          message: "테스트 및 패킷 검증에 성공했습니다.",
        });
      } catch (error: any) {
        const stdout = error.stdout || "";
        const stderr = error.stderr || "";
        const exitCode = typeof error.code === "number" ? error.code : 1;
        const message = error.message || "테스트 검증에 실패했습니다.";

        const hasCompileError = stdout.includes("error TS") || stderr.includes("error TS");
        const hasTestFailure = stdout.includes("FAIL") || stderr.includes("FAIL") || stdout.includes("failed") || stderr.includes("failed");

        let compilerStatus: "pass" | "fail" | "warn" = "pass";
        let testStatus: "pass" | "fail" | "warn" = "pass";

        if (hasCompileError) {
          compilerStatus = "fail";
          testStatus = hasTestFailure ? "fail" : "warn";
        } else if (hasTestFailure) {
          compilerStatus = "pass";
          testStatus = "fail";
        } else {
          compilerStatus = "fail";
          testStatus = "warn";
        }

        respondJson(200, {
          status: "failed",
          checks: [
            { label: "Compiler checks", status: compilerStatus },
            { label: "Unit test coverage", status: testStatus },
          ],
          stdout: stdout,
          stderr: stderr,
          exitCode: exitCode,
          message: message,
        });
      }
      return;
    }

    if (pathname === "/control-queue/items" && request.method === "GET") {
      const sessionId = requestUrl.searchParams.get("sessionId") ?? "session_desktop_001";
      const pulled = await pullEventsFromPersistentServerStorage(sessionId, eventStorage, undefined, 0);
      
      const workItemsMap = new Map<string, any>();
      for (const envelope of [...pulled.events].reverse()) {
        if (envelope.type === "work_item.created") {
          workItemsMap.set((envelope.payload as any).id, envelope.payload);
        } else if (envelope.type === "work_item.status_changed") {
          const payload = envelope.payload as any;
          const item = workItemsMap.get(payload.workItemId);
          if (item) {
            item.status = payload.status;
            if (payload.updatedAt) {
              item.updatedAt = payload.updatedAt;
            }
          }
        }
      }
      
      const activeItems = Array.from(workItemsMap.values()).filter(
        (item) => item.status !== "archived" && item.status !== "done"
      );
      respondJson(200, activeItems);
      return;
    }

    if (pathname === "/control-queue/action" && request.method === "POST") {
      let body: any;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        respondJson(400, { error: "invalid_body" });
        return;
      }

      const { workItemId, action, payload } = body;
      if (!workItemId || !action) {
        respondJson(400, { error: "missing_fields" });
        return;
      }

      const sessionId = body.sessionId || "session_desktop_001";
      const pulled = await pullEventsFromPersistentServerStorage(sessionId, eventStorage, undefined, 0);
      
      const workItemsMap = new Map<string, any>();
      for (const envelope of [...pulled.events].reverse()) {
        if (envelope.type === "work_item.created") {
          workItemsMap.set((envelope.payload as any).id, envelope.payload);
        } else if (envelope.type === "work_item.status_changed") {
          const p = envelope.payload as any;
          const item = workItemsMap.get(p.workItemId);
          if (item) {
            item.status = p.status;
          }
        }
      }

      const item = workItemsMap.get(workItemId);
      if (!item) {
        respondJson(404, { error: "work_item_not_found" });
        return;
      }

      let nextStatus = "done";
      if (action === "provide_input") {
        nextStatus = "in_progress";
      } else if (action === "edit_payload") {
        nextStatus = "planned";
      } else if (action === "approve_delegation") {
        nextStatus = "in_progress";
      } else if (action === "resolve_block") {
        nextStatus = payload?.overrideReason ? "in_progress" : "done";
      } else if (action === "redact_and_save" || action === "discard_redacted_memory") {
        nextStatus = "done";
      }

      const now = new Date().toISOString();
      if (action === "redact_and_save") {
        const input = item.metadata?.input;
        if (input && activeMemoryAdapter) {
          const sanitizedTitle = redactSecretsInText(input.title);
          const sanitizedContent = redactSecretsInText(input.content);
          const recordId = stableIdForCurator(`${sanitizedTitle}:${sanitizedContent}`, now);
          const record = {
            id: recordId,
            layer: input.layer,
            scope: input.scope ?? "session",
            kind: input.kind ?? "context",
            title: sanitizedTitle,
            content: sanitizedContent,
            sourceChannel: input.sourceChannel,
            trustLevel: input.trustLevel,
            projectId: input.projectId,
            sessionId: sessionId,
            tags: input.tags ?? [],
            activationState: "active" as const,
            createdAt: now,
            pinned: false,
          };
          if (activeMemoryAdapter.injectRecord) {
            activeMemoryAdapter.injectRecord(record);
          }
          
          const promotedEvent = {
            id: `curator_promoted_${crypto.randomUUID()}`,
            sessionId,
            type: "memory.archival_write.promoted",
            payload: {
              kind: "archival_write_promoted" as const,
              input,
              decisionReason: "User approved redacted memory",
              record,
            },
            createdAt: now,
            source: "agent" as const,
            sourceTrust: "trusted" as const,
            redacted: true,
          };
          
          if (activeEventStorage) {
            await pushEventsToPersistentServerStorage({
              id: `sync_${crypto.randomUUID()}`,
              createdAt: now,
              sessionId,
              clientId: "server_curator",
              idempotencyKey: `idem_${crypto.randomUUID()}`,
              events: [promotedEvent]
            }, activeEventStorage);
          }
        }
      } else if (action === "discard_redacted_memory") {
        const input = item.metadata?.input;
        if (input) {
          const rejectedEvent = {
            id: `curator_rejected_${crypto.randomUUID()}`,
            sessionId,
            type: "memory.archival_write.rejected",
            payload: {
              kind: "archival_write_rejected" as const,
              input,
              decisionReason: "User discarded redacted memory",
            },
            createdAt: now,
            source: "agent" as const,
            sourceTrust: "trusted" as const,
            redacted: false,
          };
          
          if (activeEventStorage) {
            await pushEventsToPersistentServerStorage({
              id: `sync_${crypto.randomUUID()}`,
              createdAt: now,
              sessionId,
              clientId: "server_curator",
              idempotencyKey: `idem_${crypto.randomUUID()}`,
              events: [rejectedEvent]
            }, activeEventStorage);
          }
        }
      }
      const statusChangedEvent = {
        id: `event_status_changed_${crypto.randomUUID()}`,
        sessionId,
        type: "work_item.status_changed",
        createdAt: now,
        source: "server",
        sourceTrust: "trusted",
        redacted: false,
        payload: {
          workItemId,
          status: nextStatus,
          updatedAt: now,
        },
      };

      const actionResolvedEvent = {
        id: `event_action_resolved_${crypto.randomUUID()}`,
        sessionId,
        type: "work_item.action_resolved",
        createdAt: now,
        source: "server",
        sourceTrust: "trusted",
        redacted: false,
        payload: {
          workItemId,
          action,
          payload,
          resolvedAt: now,
        },
      };

      const pushRequest: EventSyncPushRequest = {
        id: `push_${crypto.randomUUID()}`,
        clientId: "server_api",
        sessionId,
        events: [statusChangedEvent, actionResolvedEvent] as any[],
        idempotencyKey: `idemp_${workItemId}_${action}_${now}`,
        createdAt: now,
      };

      try {
        await pushEventsToPersistentServerStorage(pushRequest, eventStorage, now);
        respondJson(200, { success: true, nextStatus });
      } catch (error) {
        respondJson(500, {
          error: "event_storage_write_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (pathname === "/api/export-obsidian" && request.method === "POST") {
      let body: any;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        respondJson(400, { error: "invalid_body" });
        return;
      }

      const { absolutePath, content } = body;
      if (!absolutePath || content === undefined) {
        respondJson(400, { error: "missing_fields", details: "absolutePath and content are required" });
        return;
      }

      try {
        const targetDir = dirname(absolutePath);
        await mkdir(targetDir, { recursive: true });
        await writeFile(absolutePath, content, "utf8");
        respondJson(200, { success: true });
      } catch (error) {
        respondJson(500, {
          error: "file_write_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (pathname === "/event-storage" && request.method === "GET") {
      respondJson(200, await createPersistentEventStorageSnapshot(eventStorage));
      return;
    }

    if (pathname === "/events/stream") {
      const sessionId = requestUrl.searchParams.get("sessionId") ?? "session_desktop_001";

      response.writeHead(200, {
        "cache-control": "no-cache",
        "content-type": "text/event-stream; charset=utf-8",
        "connection": "keep-alive",
        ...corsHeaders,
      });

      let cleaned = false;
      let unsubscribe: (() => void) | undefined;
      let heartbeatInterval: any;

      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (unsubscribe) unsubscribe();
        if (heartbeatInterval) globalThis.clearInterval(heartbeatInterval);
        activeSseConnections.delete(response);
        try {
          if (!response.destroyed) {
            response.end();
          }
        } catch (e) {}
      };

      const safeWrite = (chunk: string) => {
        if (response.destroyed || response.writableEnded) {
          cleanup();
          return;
        }
        try {
          response.write(chunk);
        } catch (error) {
          console.error("[SSE] Failed to write to response stream, cleaning up:", error);
          cleanup();
        }
      };

      unsubscribe = serverEventBroker.subscribe(sessionId, (events) => {
        const workItemEvents = events.filter(e => e.type.startsWith("work_item."));
        if (workItemEvents.length > 0) {
          safeWrite(`event: work_item_update\ndata: ${JSON.stringify(workItemEvents)}\n\n`);
        }
        const activityEvents = events.filter(e => e.type === "agent.activity.changed");
        if (activityEvents.length > 0) {
          safeWrite(`event: agent_activity_update\ndata: ${JSON.stringify(activityEvents)}\n\n`);
        }
      });

      if (cleaned) {
        unsubscribe();
      } else {
        safeWrite(`event: heartbeat\ndata: ${JSON.stringify(createDgxHeartbeat())}\n\n`);
        if (!cleaned) {
          activeSseConnections.add(response);
          heartbeatInterval = globalThis.setInterval(() => {
            safeWrite(`event: heartbeat\ndata: ${JSON.stringify(createDgxHeartbeat())}\n\n`);
          }, 15000);
        }
      }

      request.on("close", cleanup);
      response.on("close", cleanup);
      response.on("finish", cleanup);
      request.on("error", (err) => {
        console.error("[SSE] Request error:", err);
        cleanup();
      });
      response.on("error", (err) => {
        console.error("[SSE] Response error:", err);
        cleanup();
      });
      return;
    }

    respondJson(404, { error: "not_found" });
  });

  server.listen(port, "0.0.0.0");
  return server;
}

async function fetchWithTimeout(fetchImpl: FetchLike, input: string, init: Parameters<FetchLike>[1], timeoutMs: number) {
  const controller = new AbortController();
  let onAbort: (() => void) | undefined;

  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort();
    } else {
      onAbort = () => controller.abort();
      init.signal.addEventListener("abort", onAbort);
    }
  }

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
    if (onAbort && init?.signal) {
      init.signal.removeEventListener("abort", onAbort);
    }
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

const SERVER_REDACTION_RULES: ReadonlyArray<{
  id: string;
  pattern: RegExp;
  replacement: string;
}> = [
  ...SECRET_LIKE_PATTERNS.map((pattern, index) => ({
    id: `secret_like_${index + 1}`,
    pattern,
    replacement: "<redacted>",
  })),
  {
    id: "pii_email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    replacement: "<redacted:email>",
  },
  {
    id: "pii_phone",
    pattern: /\b(?:\+82[-\s]?)?0?1[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/,
    replacement: "<redacted:phone>",
  },
];

const SENSITIVE_KEY_PATTERN =
  /^(api[-_]?key|auth[-_]?header|authorization|bearer|cookie|password|secret|access[-_]?token|refresh[-_]?token|session[-_]?token|private[-_]?key)$/i;

export function redactForServerPhase<T>(value: T, phase: RedactionPhase): { value: T; report: ServerRedactionReport } {
  const report: ServerRedactionReport = {
    phase,
    redacted: false,
    replacementCount: 0,
    patternIds: [],
  };
  const redactedValue = redactUnknownForServer(value, report) as T;
  return {
    value: redactedValue,
    report,
  };
}

function redactProviderCompletionResponseForReceive(response: ProviderCompletionResponse): ProviderCompletionResponse {
  return redactForServerPhase(response, "post_receive").value as ProviderCompletionResponse;
}

function redactUnknownForServer(value: unknown, report: ServerRedactionReport, keyHint?: string): unknown {
  if (typeof value === "string") {
    return redactStringForServer(value, report);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactUnknownForServer(entry, report));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      if (SENSITIVE_KEY_PATTERN.test(key) || (keyHint && SENSITIVE_KEY_PATTERN.test(keyHint))) {
        report.redacted = true;
        report.replacementCount += 1;
        if (!report.patternIds.includes("sensitive_key")) {
          report.patternIds.push("sensitive_key");
        }
        return [key, "<redacted:secret_ref_only>"];
      }

      return [key, redactUnknownForServer(entry, report, key)];
    }),
  );
}

function redactStringForServer(value: string, report: ServerRedactionReport): string {
  let redacted = value;
  for (const rule of SERVER_REDACTION_RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`);
    redacted = redacted.replace(pattern, () => {
      report.redacted = true;
      report.replacementCount += 1;
      if (!report.patternIds.includes(rule.id)) {
        report.patternIds.push(rule.id);
      }
      return rule.replacement;
    });
  }
  return redacted;
}

function containsSecretLikeText(value: unknown): boolean {
  const text = fingerprintEvent(value);
  return SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(text));
}

function redactSecretsForLog(text: string): string {
  return redactStringForServer(text, {
    phase: "post_receive",
    redacted: false,
    replacementCount: 0,
    patternIds: [],
  });
}

class RedactStreamTransformer {
  private buffer = "";
  private fullText = "";
  private lastUserTextLength = 0;

  transform(delta: string): { redactedDelta: string; reasoningSnippet?: string } {
    this.fullText += delta;

    // Parse the fullText to separate user-facing text and thinking-block text.
    let userText = "";
    let thinkingText = "";
    let currentIdx = 0;
    const fullTextLen = this.fullText.length;

    while (currentIdx < fullTextLen) {
      const startIdx = this.fullText.indexOf("<thinking>", currentIdx);
      if (startIdx === -1) {
        userText += this.fullText.slice(currentIdx);
        break;
      }
      userText += this.fullText.slice(currentIdx, startIdx);
      const endIdx = this.fullText.indexOf("</thinking>", startIdx + 10);
      if (endIdx === -1) {
        thinkingText += this.fullText.slice(startIdx + 10);
        break;
      }
      thinkingText += this.fullText.slice(startIdx + 10, endIdx);
      currentIdx = endIdx + 11;
    }

    // Only append newly arrived user-facing text to this.buffer
    const newArrivalUserText = userText.slice(this.lastUserTextLength);
    this.lastUserTextLength = userText.length;
    this.buffer += newArrivalUserText;

    let reasoningSnippet: string | undefined;
    if (thinkingText) {
      const sanitizedSnippet = redactSecretsForLog(thinkingText);
      reasoningSnippet = sanitizedSnippet.trim().replace(/\n/g, " ");
      if (reasoningSnippet.length > 80) {
        reasoningSnippet = "..." + reasoningSnippet.slice(-77);
      }
    }

    const lastBoundaryIndex = Math.max(
      this.buffer.lastIndexOf(" "),
      this.buffer.lastIndexOf("\n"),
      this.buffer.lastIndexOf("\t"),
      this.buffer.lastIndexOf(","),
      this.buffer.lastIndexOf(";"),
      this.buffer.lastIndexOf('"'),
      this.buffer.lastIndexOf("'"),
      this.buffer.lastIndexOf("{"),
      this.buffer.lastIndexOf("}"),
      this.buffer.lastIndexOf("["),
      this.buffer.lastIndexOf("]")
    );

    let redactedDelta = "";
    if (lastBoundaryIndex === -1) {
      if (this.buffer.length > 256) {
        const toFlush = this.buffer;
        this.buffer = "";
        redactedDelta = redactSecretsForLog(toFlush);
      } else {
        redactedDelta = "";
      }
    } else {
      const toProcess = this.buffer.slice(0, lastBoundaryIndex + 1);
      this.buffer = this.buffer.slice(lastBoundaryIndex + 1);
      redactedDelta = redactSecretsForLog(toProcess);
    }

    return { redactedDelta, reasoningSnippet };
  }

  flush(): string {
    const toFlush = this.buffer;
    this.buffer = "";
    return redactSecretsForLog(toFlush);
  }
}

export async function* wrapStreamWithRedaction(
  stream: AsyncIterable<ProviderCompletionChunkEvent>
): AsyncGenerator<ProviderCompletionChunkEvent & { reasoningSnippet?: string }, void, unknown> {
  const transformer = new RedactStreamTransformer();

  for await (const chunk of stream) {
    if (chunk.type === "delta") {
      const { redactedDelta, reasoningSnippet } = transformer.transform(chunk.delta);
      yield {
        ...chunk,
        delta: redactedDelta,
        reasoningSnippet,
      };
    } else if (chunk.type === "done") {
      const flushed = transformer.flush();
      if (flushed) {
        yield {
          type: "delta",
          requestId: chunk.requestId,
          sequence: 99999,
          delta: flushed,
        };
      }
      yield {
        ...chunk,
        finalContent: redactSecretsForLog(chunk.finalContent),
      };
    } else {
      yield chunk;
    }
  }
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

// ==========================================
// Notion-based Encrypted OAuth Token Sync Helpers
// ==========================================
import { tmpdir } from "node:os";

const MY_DEVICE_ID = process.env.MY_DEVICE_ID ?? crypto.randomUUID();

type LocalTokenCache = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  tokenVersion: number;
};

const localTokenCaches: Record<string, LocalTokenCache> = {};

export function clearLocalTokenCaches(): void {
  for (const key of Object.keys(localTokenCaches)) {
    delete localTokenCaches[key];
  }
  clockSkewMs = 0;
  try {
    const db = getLocalDb();
    db.exec("DELETE FROM local_locks");
  } catch {}
}

// Module-level clock skew tracker: Notion Server Time - Local Client Time
let clockSkewMs = 0;

/**
 * Gets the current date adjusted by the tracked Notion server clock skew.
 * This guarantees consistent lease/lock time comparisons across multiple devices.
 */
export function getNotionSyncedNow(): Date {
  return new Date(Date.now() + clockSkewMs);
}

/**
 * Encrypts token bundle using AES-256-GCM.
 */
export function encryptToken(tokenData: string, keyString: string): { ciphertext: string; nonce: string; tag: string } {
  try {
    // Ensure exactly 32-bytes key (256-bit)
    const key = Buffer.from(keyString.padEnd(32, "0").slice(0, 32), "utf8");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    
    let ciphertext = cipher.update(tokenData, "utf8", "hex");
    ciphertext += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");
    const nonce = iv.toString("hex");
    
    return { ciphertext, nonce, tag };
  } catch (err) {
    throw new Error(`Encryption failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Decrypts token bundle using AES-256-GCM, validating payload lengths and catching errors.
 */
export function decryptToken(ciphertext: string, nonceString: string, tagString: string, keyString: string): string {
  try {
    const key = Buffer.from(keyString.padEnd(32, "0").slice(0, 32), "utf8");
    const iv = Buffer.from(nonceString, "hex");
    const tag = Buffer.from(tagString, "hex");

    if (iv.length !== 12) {
      throw new Error(`Invalid IV length: expected 12 bytes, got ${iv.length}`);
    }
    if (tag.length !== 16) {
      throw new Error(`Invalid auth tag length: expected 16 bytes, got ${tag.length}`);
    }
    
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    throw new Error(`Failed to decrypt token: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * A robust fetch wrapper for all Notion requests that handles rate limiting (HTTP 429)
 * with exponential backoff + jitter, and measures clock skew via response headers.
 */
export async function notionFetchWithRetry(
  url: string,
  options: any,
  fetchImpl: any = fetch,
  maxRetries = 5
): Promise<any> {
  let attempt = 0;
  while (true) {
    attempt++;
    let response: any;
    const startMs = Date.now();
    try {
      response = await fetchImpl(url, options);
    } catch (err) {
      if (attempt >= maxRetries) {
        throw err;
      }
      const baseBackoff = 1000 * Math.pow(2, attempt);
      const backoff = Math.floor(baseBackoff / 2 + Math.random() * (baseBackoff / 2));
      await new Promise(resolve => setTimeout(resolve, backoff));
      continue;
    }
    const latencyMs = Date.now() - startMs;

    // Extract Date header to measure clock skew (Notion Server Time - Local Client Time)
    if (response?.headers) {
      let dateHeader: string | null = null;
      if (typeof response.headers.get === "function") {
        dateHeader = response.headers.get("date") || response.headers.get("Date");
      } else {
        const keys = Object.keys(response.headers);
        for (const k of keys) {
          if (k.toLowerCase() === "date") {
            dateHeader = response.headers[k];
            break;
          }
        }
      }
      if (dateHeader) {
        const serverTimeMs = Date.parse(dateHeader);
        if (!isNaN(serverTimeMs)) {
          // Adjust clock skew considering network round-trip latency (assume symmetric latency)
          clockSkewMs = (serverTimeMs + latencyMs / 2) - Date.now();
        }
      }
    }

    // Handle Notion Rate Limit (HTTP 429)
    if (response.status === 429) {
      if (attempt >= maxRetries) {
        return response;
      }

      let retryAfterStr: string | null = null;
      if (response.headers && typeof response.headers.get === "function") {
        retryAfterStr = response.headers.get("retry-after") || response.headers.get("Retry-After");
      } else if (response.headers) {
        const keys = Object.keys(response.headers);
        for (const k of keys) {
          if (k.toLowerCase() === "retry-after") {
            retryAfterStr = response.headers[k];
            break;
          }
        }
      }

      let delayMs = 1000 * Math.pow(2, attempt);
      delayMs = Math.floor(delayMs / 2 + Math.random() * (delayMs / 2)); // Equal Jitter

      if (retryAfterStr) {
        const seconds = parseInt(retryAfterStr, 10);
        if (!isNaN(seconds)) {
          const baseRetryMs = seconds * 1000;
          const jitterRange = Math.max(1000, Math.floor(baseRetryMs * 0.2)); // 20% of retry-after or at least 1s
          delayMs = baseRetryMs + Math.floor(Math.random() * jitterRange);
        }
      }

      console.warn(`[Notion Rate Limited] HTTP 429 received. Retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }

    return response;
  }
}

export async function fetchNotionTokenRow(slot: string, fetchImpl: any = fetch): Promise<any> {
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId || !process.env.NOTION_API_KEY) {
    throw new Error("Notion API Key or Database ID is missing");
  }

  const url = `https://api.notion.com/v1/databases/${databaseId}/query`;
  const response = await notionFetchWithRetry(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    } as any,
    body: JSON.stringify({
      filter: {
        property: "slot",
        rich_text: {
          equals: slot,
        },
      },
    }),
  }, fetchImpl);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Notion Database Query failed: ${response.status} ${errText}`);
  }

  const data = await response.json() as any;
  const page = data.results?.[0];
  if (!page) {
    return null;
  }

  const getPropText = (propName: string): string => {
    const prop = page.properties?.[propName];
    if (prop?.type === "rich_text") {
      return prop.rich_text?.[0]?.text?.content ?? "";
    }
    if (prop?.type === "title") {
      return prop.title?.[0]?.text?.content ?? "";
    }
    return "";
  };

  const getPropNumber = (propName: string): number => {
    const prop = page.properties?.[propName];
    return prop?.type === "number" ? prop.number ?? 0 : 0;
  };

  return {
    pageId: page.id,
    slot: getPropText("slot"),
    encrypted_token_bundle: getPropText("encrypted_token_bundle"),
    nonce: getPropText("nonce"),
    key_id: getPropText("key_id"),
    expires_at: getPropText("expires_at"),
    token_version: getPropNumber("token_version"),
    lock_owner: getPropText("lock_owner"),
    lock_until: getPropText("lock_until"),
    last_verified_by: getPropText("last_verified_by"),
    last_test_result: getPropText("last_test_result"),
  };
}

export async function writeNotionTokenRow(
  slot: string,
  fields: {
    encrypted_token_bundle?: string;
    nonce?: string;
    key_id?: string;
    expires_at?: string;
    token_version?: number;
    lock_owner?: string | null;
    lock_until?: string | null;
    last_verified_by?: string;
    last_test_result?: string;
  },
  existingPageId?: string,
  fetchImpl: any = fetch,
): Promise<void> {
  const databaseId = process.env.NOTION_DATABASE_ID;
  const apiKey = process.env.NOTION_API_KEY;
  if (!databaseId || !apiKey) {
    throw new Error("Notion API Key or Database ID is missing");
  }

  const properties: Record<string, any> = {};
  
  const setRichText = (name: string, value: string | null) => {
    properties[name] = {
      rich_text: [
        {
          text: {
            content: value ?? "",
          },
        },
      ],
    };
  };

  const setTitle = (name: string, value: string) => {
    properties[name] = {
      title: [
        {
          text: {
            content: value,
          },
        },
      ],
    };
  };

  const setNumber = (name: string, value: number) => {
    properties[name] = {
      number: value,
    };
  };

  setTitle("slot", slot);

  if (fields.encrypted_token_bundle !== undefined) setRichText("encrypted_token_bundle", fields.encrypted_token_bundle);
  if (fields.nonce !== undefined) setRichText("nonce", fields.nonce);
  if (fields.key_id !== undefined) setRichText("key_id", fields.key_id);
  if (fields.expires_at !== undefined) setRichText("expires_at", fields.expires_at);
  if (fields.token_version !== undefined) setNumber("token_version", fields.token_version);
  if (fields.lock_owner !== undefined) setRichText("lock_owner", fields.lock_owner);
  if (fields.lock_until !== undefined) setRichText("lock_until", fields.lock_until);
  if (fields.last_verified_by !== undefined) setRichText("last_verified_by", fields.last_verified_by);
  if (fields.last_test_result !== undefined) setRichText("last_test_result", fields.last_test_result);

  let url: string;
  let method: string;
  let body: any;

  if (existingPageId) {
    url = `https://api.notion.com/v1/pages/${existingPageId}`;
    method = "PATCH";
    body = { properties };
  } else {
    url = `https://api.notion.com/v1/pages`;
    method = "POST";
    body = {
      parent: { database_id: databaseId },
      properties,
    };
  }

  const response = await notionFetchWithRetry(url, {
    method,
    headers: {
      "Authorization": `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    } as any,
    body: JSON.stringify(body),
  }, fetchImpl);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Notion Write Row failed: ${response.status} ${errText}`);
  }
}

async function readJsonWithRetry(path: string, maxAttempts = 5): Promise<any | null> {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw);
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return null;
      }
      if (attempt >= maxAttempts) {
        console.warn(`[Read Collision] Failed to read or parse JSON at ${path} after ${maxAttempts} attempts:`, err);
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 20 + Math.floor(Math.random() * 50)));
    }
  }
  return null;
}

async function writeJsonAtomic(path: string, data: any): Promise<void> {
  const tmpPath = `${path}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(tmpPath, JSON.stringify(data), "utf8");
    await rename(tmpPath, path);
  } catch (err) {
    try {
      await unlink(tmpPath);
    } catch {}
    throw err;
  }
}

export async function writeWAL(slot: string, data: any): Promise<void> {
  const path = join(tmpdir(), `grok-oauth-wal-${slot}.json`);
  await writeJsonAtomic(path, data);
}

export async function readWAL(slot: string): Promise<any | null> {
  const path = join(tmpdir(), `grok-oauth-wal-${slot}.json`);
  return readJsonWithRetry(path);
}

export async function deleteWAL(slot: string): Promise<void> {
  const path = join(tmpdir(), `grok-oauth-wal-${slot}.json`);
  try {
    await unlink(path);
  } catch {}
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e.code === "EPERM";
  }
}

let localDb: DatabaseSync | null = null;

export function getLocalDb(): DatabaseSync {
  if (localDb) return localDb;
  const { tmpdir } = require("node:os");
  const dbPath = join(tmpdir(), "grok-oauth-local-store.db");
  localDb = new DatabaseSync(dbPath);
  localDb.exec("PRAGMA journal_mode = WAL");
  localDb.exec("PRAGMA synchronous = NORMAL");
  
  localDb.exec(`
    CREATE TABLE IF NOT EXISTS local_locks (
      slot TEXT PRIMARY KEY,
      lock_owner TEXT,
      lock_until TEXT,
      token_version INTEGER,
      access_token TEXT,
      refresh_token TEXT,
      expires_at TEXT,
      clock_skew_ms INTEGER,
      updated_at TEXT
    );
  `);
  
  return localDb;
}

async function acquireL1LocalLock(slot: string, maxWaitMs = 15000): Promise<boolean> {
  const db = getLocalDb();
  const start = Date.now();
  const owner = `${process.pid}:${MY_DEVICE_ID}`;
  
  while (Date.now() - start < maxWaitMs) {
    try {
      db.exec("BEGIN IMMEDIATE TRANSACTION");
      try {
        const row = db.prepare("SELECT * FROM local_locks WHERE slot = ?").get(slot) as any;
        const now = new Date().toISOString();
        
        if (row) {
          const expiresMs = row.lock_until ? Date.parse(row.lock_until) : 0;
          const isExpired = Date.now() > expiresMs;
          
          let isOwnerAlive = true;
          if (row.lock_owner) {
            const parts = row.lock_owner.split(":");
            const pid = parseInt(parts[0] || "", 10);
            const lockDeviceId = parts[1];
            if (!isNaN(pid) && pid !== process.pid && lockDeviceId === MY_DEVICE_ID) {
              isOwnerAlive = isPidAlive(pid);
            }
          }
          
          if (!isOwnerAlive || isExpired) {
            const newLockUntil = new Date(Date.now() + 120000).toISOString(); // 2 minutes lease
            db.prepare(`
              UPDATE local_locks 
              SET lock_owner = ?, lock_until = ?, updated_at = ? 
              WHERE slot = ?
            `).run(owner, newLockUntil, now, slot);
            db.exec("COMMIT");
            return true;
          }
          
          db.exec("ROLLBACK");
          // Lock is held by another process
        } else {
          const newLockUntil = new Date(Date.now() + 120000).toISOString();
          db.prepare(`
            INSERT INTO local_locks (slot, lock_owner, lock_until, token_version, updated_at)
            VALUES (?, ?, ?, 0, ?)
          `).run(slot, owner, newLockUntil, now);
          db.exec("COMMIT");
          return true;
        }
      } catch (innerError) {
        db.exec("ROLLBACK");
        throw innerError;
      }
    } catch (e: any) {
      // If transaction failed due to SQLite busy (database locked), wait for backoff retry.
    }
    await new Promise(resolve => setTimeout(resolve, 100 + Math.floor(Math.random() * 200)));
  }
  return false;
}

async function releaseL1LocalLock(slot: string): Promise<void> {
  try {
    const db = getLocalDb();
    const owner = `${process.pid}:${MY_DEVICE_ID}`;
    db.prepare(`
      UPDATE local_locks 
      SET lock_owner = NULL, lock_until = NULL, updated_at = ? 
      WHERE slot = ? AND lock_owner = ?
    `).run(new Date().toISOString(), slot, owner);
  } catch {}
}

async function readL1SharedCache(slot: string): Promise<any | null> {
  try {
    const db = getLocalDb();
    const row = db.prepare("SELECT * FROM local_locks WHERE slot = ?").get(slot) as any;
    if (row && row.access_token) {
      return {
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        expiresAt: row.expires_at,
        tokenVersion: row.token_version,
        clockSkewMs: row.clock_skew_ms,
      };
    }
  } catch {}
  return null;
}

async function writeL1SharedCache(slot: string, data: any): Promise<void> {
  try {
    const db = getLocalDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO local_locks (slot, token_version, access_token, refresh_token, expires_at, clock_skew_ms, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slot) DO UPDATE SET
        token_version = excluded.token_version,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        clock_skew_ms = excluded.clock_skew_ms,
        updated_at = excluded.updated_at
    `).run(
      slot,
      data.tokenVersion || 0,
      data.accessToken || "",
      data.refreshToken || "",
      data.expiresAt || "",
      data.clockSkewMs || 0,
      now
    );
  } catch {}
}

export async function fetchNotionTokenPageById(pageId: string, fetchImpl: any = fetch): Promise<any> {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    throw new Error("Notion API Key is missing");
  }

  const url = `https://api.notion.com/v1/pages/${pageId}`;
  const response = await notionFetchWithRetry(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
    } as any,
  }, fetchImpl);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Notion Page Retrieval failed: ${response.status} ${errText}`);
  }

  const page = await response.json() as any;

  const getPropText = (propName: string): string => {
    const prop = page.properties?.[propName];
    if (prop?.type === "rich_text") {
      return prop.rich_text?.[0]?.text?.content ?? "";
    }
    if (prop?.type === "title") {
      return prop.title?.[0]?.text?.content ?? "";
    }
    return "";
  };

  const getPropNumber = (propName: string): number => {
    const prop = page.properties?.[propName];
    return prop?.type === "number" ? prop.number ?? 0 : 0;
  };

  return {
    pageId: page.id,
    slot: getPropText("slot"),
    encrypted_token_bundle: getPropText("encrypted_token_bundle"),
    nonce: getPropText("nonce"),
    key_id: getPropText("key_id"),
    expires_at: getPropText("expires_at"),
    token_version: getPropNumber("token_version"),
    lock_owner: getPropText("lock_owner"),
    lock_until: getPropText("lock_until"),
    last_verified_by: getPropText("last_verified_by"),
    last_test_result: getPropText("last_test_result"),
  };
}

export async function getFreshOAuthTokenWithNotion(
  slot: string, 
  options: { fetchImpl?: FetchLike; now?: string } = {}
): Promise<string> {
  const fetchImpl = (options.fetchImpl ?? fetch) as any;
  const encryptionKey = process.env.SHARED_ENCRYPTION_KEY ?? "grok-notion-shared-key-32-chars";

  // 1. Check L0 memory cache
  let cache = localTokenCaches[slot];
  if (cache && typeof cache.accessToken === "string" && typeof cache.expiresAt === "string") {
    const expiresMs = Date.parse(cache.expiresAt);
    const checkNowMs = options.now ? Date.parse(options.now) : Date.now();
    if (expiresMs - (checkNowMs + clockSkewMs) > 10 * 60 * 1000) {
      const profileId = slot === "grok-oauth-1" ? "provider_grok_oauth_dgx" : "provider_grok_oauth_dgx_2";
      grokSessionManager.restoreSlot(profileId);
      return cache.accessToken;
    }
  }

  // 2. Check L1 file-based shared cache
  const sharedCache = await readL1SharedCache(slot);
  if (sharedCache && typeof sharedCache.accessToken === "string" && typeof sharedCache.expiresAt === "string") {
    const tempSkew = sharedCache.clockSkewMs !== undefined ? sharedCache.clockSkewMs : clockSkewMs;
    const expiresMs = Date.parse(sharedCache.expiresAt);
    const checkNowMs = options.now ? Date.parse(options.now) : Date.now();
    if (expiresMs - (checkNowMs + tempSkew) > 10 * 60 * 1000) {
      clockSkewMs = tempSkew; // Only adopt if fresh!
      cache = {
        accessToken: sharedCache.accessToken,
        refreshToken: sharedCache.refreshToken,
        expiresAt: sharedCache.expiresAt,
        tokenVersion: sharedCache.tokenVersion,
      };
      localTokenCaches[slot] = cache;
      const profileId = slot === "grok-oauth-1" ? "provider_grok_oauth_dgx" : "provider_grok_oauth_dgx_2";
      grokSessionManager.restoreSlot(profileId);
      return cache.accessToken;
    }
  }

  // 3. Acquire L1 file lock to prevent concurrent Notion requests from same host
  const hasL1Lock = await acquireL1LocalLock(slot);
  if (!hasL1Lock) {
    // If lock fails, poll the shared cache while the other process performs Notion sync
    let attempts = 0;
    while (attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const latestShared = await readL1SharedCache(slot);
      if (latestShared && typeof latestShared.accessToken === "string" && typeof latestShared.expiresAt === "string") {
        const tempSkew = latestShared.clockSkewMs !== undefined ? latestShared.clockSkewMs : clockSkewMs;
        const expiresMs = Date.parse(latestShared.expiresAt);
        const checkNowMs = options.now ? Date.parse(options.now) : Date.now();
        if (expiresMs - (checkNowMs + tempSkew) > 10 * 60 * 1000) {
          clockSkewMs = tempSkew; // Only adopt if fresh!
          cache = {
            accessToken: latestShared.accessToken,
            refreshToken: latestShared.refreshToken,
            expiresAt: latestShared.expiresAt,
            tokenVersion: latestShared.tokenVersion,
          };
          localTokenCaches[slot] = cache;
          const profileId = slot === "grok-oauth-1" ? "provider_grok_oauth_dgx" : "provider_grok_oauth_dgx_2";
          grokSessionManager.restoreSlot(profileId);
          return cache.accessToken;
        }
      }
      attempts++;
    }
    throw new Error(`Failed to acquire L1 local lock and no fresh token found in L1 cache for slot ${slot}`);
  }

  try {
    const token = await executeL2NotionOAuthSync(slot, encryptionKey, fetchImpl, cache, options.now);
    const profileId = slot === "grok-oauth-1" ? "provider_grok_oauth_dgx" : "provider_grok_oauth_dgx_2";
    grokSessionManager.restoreSlot(profileId);
    return token;
  } finally {
    if (hasL1Lock) {
      await releaseL1LocalLock(slot);
    }
  }
}

async function executeL2NotionOAuthSync(
  slot: string,
  encryptionKey: string,
  fetchImpl: any,
  initialCache: any,
  nowOption?: string,
): Promise<string> {
  let cache = initialCache;
  let row: any;
  try {
    row = await fetchNotionTokenRow(slot, fetchImpl);
  } catch (e) {
    if (cache && typeof cache.expiresAt === "string" && Date.parse(cache.expiresAt) - getNotionSyncedNow().getTime() > 5 * 60 * 1000) {
      return cache.accessToken;
    }
    throw new Error(`OAuth access token expired or refresh failed. Reconnect/paste a new token block. (Notion fetch error: ${e instanceof Error ? e.message : String(e)})`);
  }

  const baseNow = nowOption ? Date.parse(nowOption) : Date.now();
  const nowMs = baseNow + clockSkewMs;

  // 1. Decrypt existing Notion token to see if it is already fresh.
  // If it's already fresh, we can return it immediately without waiting for any locks.
  if (row && row.encrypted_token_bundle) {
    try {
      const decryptedStr = decryptToken(row.encrypted_token_bundle, row.nonce, row.key_id, encryptionKey);
      const decrypted = JSON.parse(decryptedStr);
      
      const notionExpiresMs = Date.parse(decrypted.expires_at);
      if (row.token_version > (cache?.tokenVersion ?? -1)) {
        cache = {
          accessToken: decrypted.access_token,
          refreshToken: decrypted.refresh_token,
          expiresAt: decrypted.expires_at,
          tokenVersion: row.token_version,
        };
        localTokenCaches[slot] = cache;
        await writeL1SharedCache(slot, { ...cache, clockSkewMs });
      }
      
      if (notionExpiresMs - nowMs > 10 * 60 * 1000 && cache) {
        return cache.accessToken;
      }
    } catch (e) {
      console.warn(`[Decryption Failed] Decrypting Notion token bundle failed for slot ${slot}:`, e);
    }
  }

  // 2. If it is not fresh, check if it is locked by another node. If so, wait.
  // By waiting before reading/deleting WAL, we ensure we don't interfere with the active lock holder.
  if (row && row.lock_until) {
    let lockUntilMs = Date.parse(row.lock_until);
    if (lockUntilMs > nowMs && row.lock_owner !== MY_DEVICE_ID) {
      let attempts = 0;
      while (attempts < 5) {
        const hashSeed = MY_DEVICE_ID.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const baseDelay = 1000 * Math.pow(2, attempts);
        const jitter = (hashSeed % 300) + Math.floor(Math.random() * baseDelay * 0.3);
        const delay = baseDelay + jitter;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        if (row?.pageId) {
          row = await fetchNotionTokenPageById(row.pageId, fetchImpl);
        } else {
          row = await fetchNotionTokenRow(slot, fetchImpl);
        }
        
        const currentNowMs = Date.now() + clockSkewMs;
        lockUntilMs = row && row.lock_until ? Date.parse(row.lock_until) : 0;
        
        if (!row || !row.lock_until || lockUntilMs <= currentNowMs) {
          break;
        }
        
        if (row.encrypted_token_bundle) {
          try {
            const decryptedStr = decryptToken(row.encrypted_token_bundle, row.nonce, row.key_id, encryptionKey);
            const decrypted = JSON.parse(decryptedStr);
            if (Date.parse(decrypted.expires_at) - currentNowMs > 10 * 60 * 1000) {
              cache = {
                accessToken: decrypted.access_token,
                refreshToken: decrypted.refresh_token,
                expiresAt: decrypted.expires_at,
                tokenVersion: row.token_version,
              };
              localTokenCaches[slot] = cache;
              await writeL1SharedCache(slot, { ...cache, clockSkewMs });
              
              // Clean up WAL if we recovered a newer/equal token via Notion
              const walData = await readWAL(slot);
              if (walData && walData.access_token !== "pending_refresh") {
                if (Date.parse(decrypted.expires_at) >= Date.parse(walData.expires_at)) {
                  await deleteWAL(slot);
                }
              }
              return cache.accessToken;
            }
          } catch {}
        }
        attempts++;
      }
    }
  }

  // 3. Now we are the lock owner, or the lock has expired, or we are going to acquire the lock.
  // Check WAL recovery to see if there's a refreshed token that was not saved to Notion.
  let pendingWALRecovery: any = null;
  const walData = await readWAL(slot);
  if (walData) {
    if (walData.access_token === "pending_refresh") {
      await deleteWAL(slot);
    } else {
      let isNotionAlreadyUpdated = false;
      if (row && row.encrypted_token_bundle) {
        try {
          const decryptedStr = decryptToken(row.encrypted_token_bundle, row.nonce, row.key_id, encryptionKey);
          const decrypted = JSON.parse(decryptedStr);
          if (Date.parse(decrypted.expires_at) >= Date.parse(walData.expires_at)) {
            isNotionAlreadyUpdated = true;
          }
        } catch {}
      }

      if (isNotionAlreadyUpdated) {
        await deleteWAL(slot);
      } else {
        pendingWALRecovery = walData;
      }
    }
  }

  // 4. Acquire the lock on Notion
  const currentNowMs = Date.now() + clockSkewMs;
  const lockUntilStr = new Date(currentNowMs + 60 * 1000).toISOString();
  try {
    await writeNotionTokenRow(slot, {
      lock_owner: MY_DEVICE_ID,
      lock_until: lockUntilStr,
    }, row?.pageId, fetchImpl);

    let confirmRow: any;
    if (row?.pageId) {
      confirmRow = await fetchNotionTokenPageById(row.pageId, fetchImpl);
    } else {
      confirmRow = await fetchNotionTokenRow(slot, fetchImpl);
    }

    if (!confirmRow || confirmRow.lock_owner !== MY_DEVICE_ID) {
      // Lock conflict, wait and retry execution
      await new Promise(resolve => setTimeout(resolve, 500 + Math.floor(Math.random() * 500)));
      return executeL2NotionOAuthSync(slot, encryptionKey, fetchImpl, cache, nowOption);
    }
    row = confirmRow;
  } catch (e) {
    throw new Error(`OAuth access token expired or refresh failed. Reconnect/paste a new token block. (Notion lock write error: ${e instanceof Error ? e.message : String(e)})`);
  }

  let freshTokenData: any;
  const nextVersion = (row?.token_version ?? 0) + 1;

  if (pendingWALRecovery) {
    freshTokenData = pendingWALRecovery;
  } else {
    try {
      const currentRefreshToken = cache?.refreshToken || (row ? (() => {
        try {
          const decryptedStr = decryptToken(row.encrypted_token_bundle, row.nonce, row.key_id, encryptionKey);
          return JSON.parse(decryptedStr).refresh_token;
        } catch {
          return "";
        }
      })() : "");

      if (!currentRefreshToken) {
        throw new Error("No refresh token available");
      }

      const oauthUrl = process.env.GROK_OAUTH_TOKEN_URL ?? "https://api.x.ai/oauth2/token";
      const clientId = process.env.GROK_OAUTH_CLIENT_ID ?? "grok-media-studio-client-id";
      
      await writeWAL(slot, {
        access_token: "pending_refresh",
        refresh_token: currentRefreshToken,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });

      const tokenResponse = await fetchImpl(oauthUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: currentRefreshToken,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        throw new Error(`xAI OAuth token API returned error ${tokenResponse.status}: ${errText}`);
      }

      const tokenResJson = await tokenResponse.json();
      const newExpiresAt = new Date(getNotionSyncedNow().getTime() + (tokenResJson.expires_in ?? 3600) * 1000).toISOString();

      freshTokenData = {
        access_token: tokenResJson.access_token,
        refresh_token: tokenResJson.refresh_token ?? currentRefreshToken,
        expires_at: newExpiresAt,
        label: slot,
        tier: tokenResJson.tier ?? (cache?.tokenVersion ? 5 : 1),
      };

      await writeWAL(slot, freshTokenData);
    } catch (e) {
      try {
        await writeNotionTokenRow(slot, {
          lock_owner: null,
          lock_until: null,
        }, row?.pageId, fetchImpl);
      } catch {}
      await deleteWAL(slot);
      throw new Error(`OAuth access token expired or refresh failed. Reconnect/paste a new token block. (Refresh request failed: ${e instanceof Error ? e.message : String(e)})`);
    }
  }

  let testResult = "failed";
  try {
    const testUrl = process.env.GROK_CHAT_TEST_URL ?? "https://api.x.ai/v1/chat/completions";
    const testRes = await fetchImpl(testUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${freshTokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-4",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
    });
    if (testRes.ok) {
      testResult = "valid";
    }
  } catch {
    testResult = "unverified";
  }

  try {
    const encrypted = encryptToken(JSON.stringify(freshTokenData), encryptionKey);
    await writeNotionTokenRow(slot, {
      encrypted_token_bundle: encrypted.ciphertext,
      nonce: encrypted.nonce,
      key_id: encrypted.tag,
      expires_at: freshTokenData.expires_at,
      token_version: nextVersion,
      lock_owner: null,
      lock_until: null,
      last_verified_by: MY_DEVICE_ID,
      last_test_result: testResult,
    }, row?.pageId, fetchImpl);

    cache = {
      accessToken: freshTokenData.access_token,
      refreshToken: freshTokenData.refresh_token,
      expiresAt: freshTokenData.expires_at,
      tokenVersion: nextVersion,
    };
    localTokenCaches[slot] = cache;
    await writeL1SharedCache(slot, { ...cache, clockSkewMs });
    await deleteWAL(slot);

    return freshTokenData.access_token;
  } catch (e) {
    try {
      await writeNotionTokenRow(slot, {
        lock_owner: null,
        lock_until: null,
      }, row?.pageId, fetchImpl);
    } catch {}
    throw new Error(`OAuth access token expired or refresh failed. Reconnect/paste a new token block. (Notion save error: ${e instanceof Error ? e.message : String(e)})`);
  }
}

async function resolveLocalOAuthAccessTokenFallback(config: ServerProviderProxyConfig): Promise<string | undefined> {
  const authFilePath = getServerProviderOAuthAuthFilePath(config);
  if (!authFilePath) return undefined;
  try {
    const raw = await readFile(expandHomePath(authFilePath), "utf8");
    const parsed = JSON.parse(raw);
    const entries = parsed && typeof parsed === "object" ? Object.values(parsed as Record<string, unknown>) : [];
    const authRecord = entries.find((entry): entry is Record<string, any> => Boolean(entry && typeof entry === "object"));
    return authRecord?.access_token ?? authRecord?.accessToken ?? authRecord?.refresh_token;
  } catch {
    return undefined;
  }
}


