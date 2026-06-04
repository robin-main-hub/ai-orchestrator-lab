import { createServer } from "node:http";
import { z } from "zod";
import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as crypto from "node:crypto";
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
  MemoryInput,
  MemoryRecord,
  MemorySyncRequest,
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
  isMemoryAdapterError,
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
import { sseSessionRegistry } from "./events/sseSession";
import { createCorsHeaders } from "./http/cors";
import { RequestBodyTooLargeError, readJsonBody, readRawBody } from "./http/requestBody";
import { handleApprovalRoute } from "./routes/approvals";
import { handleTmuxRoute } from "./routes/tmux";
import { handleVerifyPacketRoute } from "./routes/verifyPacket";
export { pickAllowedOrigin, resolveAllowedOrigins } from "./http/cors";

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

export function getFilteredSubprocessEnv(customEnv?: Record<string, string>): NodeJS.ProcessEnv {
  const ALLOWLIST = [
    "PATH", "HOME", "USER", "LOGNAME",
    "AI_SWARM_SESSION", "AI_SWARM_STATE_DIR", "AI_SWARM_CAPTURE_LINES",
    "LANG", "LC_ALL", "LC_CTYPE",
    "TMPDIR", "TEMP", "TMP"
  ];

  const filteredEnv: NodeJS.ProcessEnv = {};
  for (const key of ALLOWLIST) {
    if (process.env[key] !== undefined) {
      filteredEnv[key] = process.env[key];
    }
  }
  if (customEnv) {
    for (const [key, value] of Object.entries(customEnv)) {
      if (ALLOWLIST.includes(key)) {
        filteredEnv[key] = value;
      }
    }
  }
  return filteredEnv;
}


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
  return createDgxProviderCompletionResponse(request);
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

export function evaluateServerTmuxDispatchPermission(
  request: ServerTmuxDispatchRequest,
  storageStateOrNow?: ServerEventStorageState | string,
  now = new Date().toISOString(),
): ServerPermissionGateResult {
  let storageState: ServerEventStorageState | undefined;
  let actualNow = now;
  if (typeof storageStateOrNow === "string") {
    actualNow = storageStateOrNow;
  } else if (storageStateOrNow && typeof storageStateOrNow === "object") {
    storageState = storageStateOrNow;
  }

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
    let isApproved = false;
    if (storageState) {
      const approvalsList = listApprovalsFromServerStorage(storageState, actualNow);
      const matchedApproval = approvalsList.approvals.find(
        (a) => a.id === createApprovalId(request.id) || a.sourceItemId === request.id
      );
      if (matchedApproval && matchedApproval.state === "approved") {
        isApproved = true;
      }
    }

    if (isApproved) {
      return {
        action: "terminal_run",
        approvalState: "approved",
        decision: "allow",
        requestedLevels,
        reason: "tmux dispatch was explicitly approved",
      };
    } else {
      return {
        action: "terminal_run",
        approvalState: "rejected",
        decision: "deny",
        requestedLevels,
        reason: "tmux dispatch approval bypass attempt detected: approval state 'approved' not found in event store",
      };
    }
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
  storageStateOrNow?: ServerEventStorageState | string,
  now = new Date().toISOString(),
): ServerTmuxDispatchSnapshot {
  let storageState: ServerEventStorageState | undefined;
  let actualNow = now;
  if (typeof storageStateOrNow === "string") {
    actualNow = storageStateOrNow;
  } else if (storageStateOrNow && typeof storageStateOrNow === "object") {
    storageState = storageStateOrNow;
  }
  const permission = evaluateServerTmuxDispatchPermission(request, storageState, actualNow);
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
    permission.decision === "approval_required" ? createTmuxDispatchApprovalRequest(request, permission, actualNow) : undefined;
  const events: EventEnvelope[] = [
    createTmuxCommandIntentEvent(intent, request.role, request.host, request.tmuxSessionName),
  ];

  if (permission.decision === "deny") {
    events.push(createTmuxCommandBlockedEvent(intent, permission.reason, request.role, request.host, actualNow));
  }

  if (approval) {
    events.push(createApprovalRequestedEvent(approval));
  }
  const timelineBlocks = createTmuxDispatchTimelineBlocks(request, intent, permission, approval, events, actualNow);

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
  storageStateOrNow?: ServerEventStorageState | string,
  now = new Date().toISOString(),
): ServerTmuxPreflightResponse {
  const snapshot = createServerTmuxDispatchSnapshot(request, storageStateOrNow, now);
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
  const storageState = await storage.statePromise;
  const snapshot = createServerTmuxDispatchSnapshot(request, storageState, now);
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
    const result = await createDgxProviderCompletionResponse(completionRequest);

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
      env: getFilteredSubprocessEnv({
        AI_SWARM_SESSION: request.tmuxSessionName,
      }),
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
    env: getFilteredSubprocessEnv({
      AI_SWARM_SESSION: request.tmuxSessionName,
    }),
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
};

// Zod schemas for memory endpoints
import {
  memoryLayerSchema,
  memoryScopeSchema,
  memoryKindSchema,
  memorySyncRequestSchema,
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

export type MemoryRecordSyncStatus = "accepted" | "promotion_pending" | "failed";

export type MemoryRecordSyncResult = {
  inputIndex: number;
  status: MemoryRecordSyncStatus;
  record?: MemoryRecord;
  serverRevision?: number;
  reason?: string;
};

export type MemorySyncResponse = {
  requestId: string;
  sessionId: string;
  serverRevision: number;
  accepted: number;
  promotionPending: number;
  failed: number;
  results: MemoryRecordSyncResult[];
  createdAt: string;
};

export async function syncMemoryRecords(
  request: MemorySyncRequest,
  adapter: MemoryAdapter,
  options: { serverRevision?: number; now?: string } = {},
): Promise<MemorySyncResponse> {
  const createdAt = options.now ?? new Date().toISOString();
  const serverRevision = options.serverRevision ?? 0;
  const results: MemoryRecordSyncResult[] = [];

  for (const [inputIndex, input] of request.inputs.entries()) {
    try {
      const record = await adapter.remember(input, {
        permissionDecision: "allow",
        callerTrustLevel: "trusted",
        now: () => createdAt,
      });
      results.push({
        inputIndex,
        status: "accepted",
        record,
        serverRevision,
      });
    } catch (error) {
      if (isPromotionPendingMemoryError(error)) {
        results.push({
          inputIndex,
          status: "promotion_pending",
          record: createPendingMemoryRecord(input, error, createdAt),
          serverRevision,
          reason: error instanceof Error ? error.message : "promotion_pending",
        });
        continue;
      }

      results.push({
        inputIndex,
        status: "failed",
        serverRevision,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    requestId: request.id,
    sessionId: request.sessionId,
    serverRevision,
    accepted: results.filter((result) => result.status === "accepted").length,
    promotionPending: results.filter((result) => result.status === "promotion_pending").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
    createdAt,
  };
}

function isPromotionPendingMemoryError(error: unknown): error is Error & { meta?: { recordId?: string } } {
  if (isMemoryAdapterError(error)) {
    return error.category === "promotion_pending";
  }
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as { category?: unknown }).category === "promotion_pending",
  );
}

function createPendingMemoryRecord(
  input: MemoryInput,
  error: { meta?: { recordId?: string } },
  createdAt: string,
): MemoryRecord {
  return {
    id: error.meta?.recordId ?? `pending_${stableServerId(`${input.title}:${input.content}:${createdAt}`)}`,
    layer: input.layer,
    scope: input.scope,
    kind: input.kind ?? "context",
    title: input.title,
    content: input.content,
    sourceChannel: input.sourceChannel,
    trustLevel: input.trustLevel,
    projectId: input.projectId,
    sessionId: input.sessionId,
    tags: input.tags ?? [],
    activationState: "suggested",
    createdAt,
    pinned: false,
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

  const apiKey = config.noAuth ? undefined : await resolveServerProviderApiKey(config);
  if (!config.noAuth && !apiKey) {
    throw new Error("DGX-02 provider secret was not resolved from env or key file");
  }

  if (config.apiStyle === "anthropic_messages") {
    const adapter: LlmAdapter = new AnthropicAdapter({
      profileId: config.providerProfileId,
      baseUrl: config.baseUrl,
      modelIds: config.defaultModelIds,
      requiresAuth: !config.noAuth,
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
    requiresAuth: !config.noAuth,
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
      redactProviderCompletionResponseForReceive(await createServerProviderProxyCompletionResponse(redactedRequest, options)),
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

  if (config.apiStyle === "anthropic_messages") {
    return createAnthropicServerCompletion({
      request,
      profileId: config.providerProfileId,
      baseUrl: config.baseUrl,
      modelIds: config.defaultModelIds,
      requiresAuth: !config.noAuth,
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
    requiresAuth: !config.noAuth,
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

type NonceRegistryOptions = {
  maxNonces?: number;
  cleanupIntervalMs?: number | false;
  now?: () => number;
};

export class NonceRegistry {
  private nonces = new Map<string, number>();
  private readonly maxNonces: number;
  private readonly now: () => number;
  private readonly cleanupInterval?: ReturnType<typeof setInterval>;

  constructor(options: NonceRegistryOptions = {}) {
    this.maxNonces = options.maxNonces ?? 100_000;
    this.now = options.now ?? Date.now;
    const cleanupIntervalMs = options.cleanupIntervalMs ?? 60_000;
    if (cleanupIntervalMs !== false) {
      this.cleanupInterval = setInterval(() => {
        this.cleanupExpired();
      }, cleanupIntervalMs);
      this.cleanupInterval.unref?.();
    }
  }

  has(nonce: string): boolean {
    const expiry = this.nonces.get(nonce);
    if (!expiry) return false;
    if (this.now() > expiry) {
      this.nonces.delete(nonce);
      return false;
    }
    return true;
  }

  add(nonce: string, ttlMs: number) {
    if (!this.nonces.has(nonce) && this.nonces.size >= this.maxNonces) {
      this.cleanupExpired();
      if (this.nonces.size >= this.maxNonces) {
        throw new Error("nonce_registry_capacity_exceeded");
      }
    }
    this.nonces.set(nonce, this.now() + ttlMs);
  }

  dispose() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  private cleanupExpired() {
    const now = this.now();
    for (const [nonce, expiry] of this.nonces.entries()) {
      if (now > expiry) {
        this.nonces.delete(nonce);
      } else {
        break; // FIFO eviction/cleanup optimization: stop at first non-expired nonce
      }
    }
  }
}

export function startServer(port = Number(process.env.PORT ?? 4317)) {
  const eventStorage = createJsonlServerEventStorage();
  
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

  const nonceRegistry = new NonceRegistry();

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

    const requireAuth = async (): Promise<boolean> => {
      if (request.headers.authorization === expectedAuthorization) return true;

      const signatureHeader = request.headers["x-dgx-signature"];
      const timestampHeader = request.headers["x-dgx-timestamp"];
      const nonceHeader = request.headers["x-dgx-nonce"];
      const bodyHashHeader = request.headers["x-dgx-body-sha256"];

      if (signatureHeader && timestampHeader && nonceHeader && bodyHashHeader) {
        const userSig = typeof signatureHeader === "string" ? signatureHeader : "";
        const nonce = typeof nonceHeader === "string" ? nonceHeader : "";
        const bodyHash = typeof bodyHashHeader === "string" ? bodyHashHeader : "";
        const hexSha256Pattern = /^[0-9a-fA-F]{64}$/;

        if (!hexSha256Pattern.test(userSig) || !hexSha256Pattern.test(bodyHash) || !nonce) {
          respondJson(401, { error: "unauthorized" });
          return false;
        }

        const timestamp = Number(timestampHeader);
        const driftWindowMs = Number(process.env.DGX_ORCHESTRATOR_DRIFT_WINDOW_MS) || 300_000;
        const now = Date.now();

        if (isNaN(timestamp) || Math.abs(now - timestamp) > driftWindowMs) {
          respondJson(401, { error: "clock_drift_exceeded" });
          return false;
        }

        const signedPath = `${pathname}${requestUrl.search}`;
        const message = [request.method?.toUpperCase() || "", signedPath, bodyHash.toLowerCase(), String(timestampHeader), nonce].join("\n");
        const expectedHmac = crypto.createHmac("sha256", apiToken).update(message).digest("hex");

        let expectedBuffer: Buffer;
        let userBuffer: Buffer;

        if (expectedHmac.length !== userSig.length) {
          expectedBuffer = crypto.createHash("sha256").update(expectedHmac).digest();
          userBuffer = crypto.createHash("sha256").update(userSig).digest();
        } else {
          expectedBuffer = Buffer.from(expectedHmac, "hex");
          userBuffer = Buffer.from(userSig, "hex");
        }

        const signaturesMatch = crypto.timingSafeEqual(expectedBuffer, userBuffer) && expectedHmac.length === userSig.length;

        if (!signaturesMatch) {
          respondJson(401, { error: "unauthorized" });
          return false;
        }

        if (nonceRegistry.has(nonce)) {
          respondJson(401, { error: "replay_detected" });
          return false;
        }

        let rawBody: string;
        try {
          rawBody = await readRawBody(request);
        } catch (error) {
          if (error instanceof RequestBodyTooLargeError) {
            respondJson(413, { error: "payload_too_large", limit: error.limit });
            return false;
          }
          respondJson(400, {
            error: "invalid_json_body",
            message: error instanceof Error ? error.message : String(error),
          });
          return false;
        }

        const actualBodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");
        const expectedBodyHashBuffer = Buffer.from(actualBodyHash, "hex");
        const userBodyHashBuffer = Buffer.from(bodyHash, "hex");

        if (!crypto.timingSafeEqual(expectedBodyHashBuffer, userBodyHashBuffer)) {
          respondJson(401, { error: "unauthorized" });
          return false;
        }

        if (nonceRegistry.has(nonce)) {
          respondJson(401, { error: "replay_detected" });
          return false;
        }

        try {
          nonceRegistry.add(nonce, driftWindowMs * 2);
        } catch (error) {
          respondJson(503, { error: error instanceof Error ? error.message : "nonce_registry_capacity_exceeded" });
          return false;
        }
        return true;
      }

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

    if (!(await requireAuth())) return;

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
      const completion = await createDgxProviderCompletionResponse(payload);
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
      request.on("close", () => {
        abortController.abort();
      });

      try {
        const stream = await createDgxProviderCompletionStreamResponse(payload, {
          abortSignal: abortController.signal,
        });
        for await (const chunk of stream) {
          response.write(`event: chunk\ndata: ${JSON.stringify(chunk)}\n\n`);
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
        response.write(`event: chunk\ndata: ${JSON.stringify(errChunk)}\n\n`);
      } finally {
        response.end();
      }
      return;
    }

    if (pathname === "/memory/sync" && request.method === "POST") {
      let body: MemorySyncRequest;
      try {
        body = memorySyncRequestSchema.parse(await readJsonBody(request)) as MemorySyncRequest;
      } catch (error) {
        respondJson(400, { error: "invalid_memory_sync_request", message: String(error) });
        return;
      }
      const callerTrustLevel = "trusted";
      const permission = evaluateServerMemoryPermission("memory_write_request", callerTrustLevel);
      if (permission.decision !== "allow") {
        respondJson(403, { error: "permission_denied", permission });
        return;
      }
      try {
        const storageState = await eventStorage.statePromise;
        const syncResponse = await syncMemoryRecords(body, memoryAdapter, {
          serverRevision: storageState.revision,
        });
        respondJson(syncResponse.failed > 0 ? 207 : 202, syncResponse);
      } catch (error) {
        respondJson(500, { error: "memory_sync_failed", message: String(error) });
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
      } catch (error) {
        if (error instanceof Error && error.message.includes("promotion_pending")) {
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
        respondJson(500, { error: "memory_pin_failed", message: String(error) });
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
        respondJson(500, { error: "memory_forget_failed", message: String(error) });
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
        respondJson(500, { error: "memory_activate_failed", message: String(error) });
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

    if (
      await handleVerifyPacketRoute({
        request,
        pathname,
        method: request.method,
        readJsonBody,
        isRequestBodyTooLargeError: (error): error is RequestBodyTooLargeError =>
          error instanceof RequestBodyTooLargeError,
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
      const storageState = await eventStorage.statePromise;
      respondJson(200, createServerTmuxPreflightResponse(payload, storageState));
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

    if (pathname === "/event-storage" && request.method === "GET") {
      respondJson(200, await createPersistentEventStorageSnapshot(eventStorage));
      return;
    }

    if (pathname === "/events/stream") {
      const session = sseSessionRegistry.createSession({
        request,
        response,
        headers: corsHeaders,
        heartbeatPayload: () => createDgxHeartbeat(),
      });
      session.start();
      return;
    }

    respondJson(404, { error: "not_found" });
  });

  server.on("close", () => {
    nonceRegistry.dispose();
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

export function redactInternalPathsForPublicHealth(
  snapshot: ServerEventStorageSnapshot,
): ServerEventStorageSnapshot {
  return {
    ...snapshot,
    storageDir: "",
    eventLogPath: "",
  };
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
