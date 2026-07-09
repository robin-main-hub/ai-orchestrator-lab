import { createServer } from "node:http";
import { z } from "zod";
import { mkdir, readFile, appendFile, stat, rename, readdir, unlink, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveSwarmScriptPath, swarmScriptCwd } from "./swarmScriptPath.js";
import {
  ACTIVE_EVENT_LOG,
  DEFAULT_EVENT_LOG_KEEP_SEGMENTS,
  DEFAULT_EVENT_LOG_MAX_BYTES,
  orderLogFilesOldestFirst,
  rotatedSegmentName,
  segmentsToPrune,
  shouldRotateEventLog,
} from "./eventLogRotation.js";
import * as crypto from "node:crypto";
import { connect as netConnect } from "node:net";
import { spawn as childSpawn } from "node:child_process";
import { get as httpGet } from "node:http";
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
  OperatorCockpitSnapshot,
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
  analyzeVisualQa,
  approvalDecisionRequestSchema,
  approvalRequestSchema,
  buildObsidianSkillNote,
  codingPacketSchema,
  deriveMissionTrace,
  deriveRmasTrace,
  eventSyncPushRequestSchema,
  designBlueprintInputSchema,
  parseAgentDelegationEventPayload,
  parseTerminalCommandEventPayload,
  providerCompletionRequestSchema,
  remoteExecutionRequestSchema,
  terminalCommandIntentSchema,
  terminalTimelineBlockSchema,
  type ProviderCompletionChunkEvent,
  operatorCockpitSnapshotSchema,
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
  SimpleMemAdapter,
} from "@ai-orchestrator/simplememo";
import type {
  MemoryAdapter,
  MemoryAdapterContext,
  MemoryAdapterKind,
} from "@ai-orchestrator/simplememo";
import type { LlmAdapter } from "@ai-orchestrator/providers";
import { sseSessionRegistry } from "./events/sseSession.js";
import { createCorsHeaders } from "./http/cors.js";
import { RequestBodyTooLargeError, readJsonBody, readRawBody } from "./http/requestBody.js";
import { handleApprovalRoute } from "./routes/approvals.js";
import { handleMissionRoute } from "./routes/missions.js";
import { handleRmasRoute } from "./routes/rmas.js";
import { handleGithubRoute } from "./routes/github.js";
import { createGithubReadonlyClient } from "./integrations/githubReadonlyClient.js";
import { parseRepoAllowlist } from "./integrations/githubCommentWriteGuards.js";
import { createGithubCommentWritePlanStore } from "./integrations/githubCommentWritePlanStore.js";
import { createGithubBranchCreatePlanStore } from "./integrations/githubBranchCreatePlanStore.js";
import { createGithubFileChangePlanStore } from "./integrations/githubFileChangePlanStore.js";
import { createGithubPullRequestCreatePlanStore } from "./integrations/githubPullRequestCreatePlanStore.js";
import { createGithubPullRequestUpdatePlanStore } from "./integrations/githubPullRequestUpdatePlanStore.js";
import { createGithubPullRequestLabelsUpdatePlanStore } from "./integrations/githubPullRequestLabelsUpdatePlanStore.js";
import { parsePrBaseAllowlist } from "./integrations/githubPullRequestWriteGuards.js";

// W1: GitHub comment write plan store — process scope, in-memory, 10분 TTL.
// 영속화하지 않는 이유: plan은 작업 의도일 뿐 진실(observed)이 아님. 재시작 후엔 다시 plan.
const githubCommentWritePlanStoreInstance = createGithubCommentWritePlanStore();
// W2: branch create plan store — 같은 이유로 in-memory. W1과 독립 인스턴스.
const githubBranchCreatePlanStoreInstance = createGithubBranchCreatePlanStore();
// W3a: file change plan store — 같은 이유로 in-memory. 세 스토어를 분리하는 이유는
// 한 표면의 비정상 상태가 다른 표면에 영향을 주지 않게 격리하기 위함.
const githubFileChangePlanStoreInstance = createGithubFileChangePlanStore();
// W4a: PR create plan store — 동일 패턴. 네 표면을 독립 격리.
const githubPullRequestCreatePlanStoreInstance = createGithubPullRequestCreatePlanStore();
// W5c: PR title/body update plan store — PR create와 별도 인스턴스(섞이지 않도록).
const githubPullRequestUpdatePlanStoreInstance = createGithubPullRequestUpdatePlanStore();
// W5d-Phase-1: PR labels update plan store — title/body와도 분리(섞이지 않도록).
const githubPullRequestLabelsUpdatePlanStoreInstance = createGithubPullRequestLabelsUpdatePlanStore();
import { createMissionStore, type MissionStore } from "./missions/missionStore.js";
import { missionTraceBus } from "./missions/missionTraceBus.js";
import { createRmasRunStore, type RmasRunStore } from "./rmas/rmasRunStore.js";
import { rmasTraceBus } from "./rmas/rmasTraceBus.js";
import { createRmasRunController, type RmasRunController } from "./rmas/rmasRunController.js";
import {
  disposeAllPreviews,
  startPreviewProcess,
  stopPreviewProcess,
  type PreviewProcessRegistry,
  type PreviewSpawnFn,
  type PreviewHttpProbe,
} from "./missions/previewProcessRunner.js";
import { applyScaffold as applyScaffoldRunner, planScaffold as planScaffoldRunner } from "./missions/scaffoldRunner.js";
import { createPlaywrightProbeDriver, runBrowserProbe } from "./missions/visualQaBrowserProbe.js";
import type { LocalExecFn } from "./missions/localSandboxRunner.js";
import {
  runRegistryMissionVerification,
  selectVerificationRunner,
} from "./missions/verificationRunnerRegistry.js";
import { executeMerge, parseAllowedRepoRoots, type GitExecFn } from "./missions/gitWorktreeMergeRunner.js";
import { createMissionCheckpoint, executeMissionRollback } from "./missions/gitCheckpointRunner.js";
import { handleTmuxRoute } from "./routes/tmux.js";
import { acquireStorageLock } from "./storage/storageLock.js";
import { AuthRateLimiter, resolveClientKey } from "./security/authRateLimiter.js";
import { timingSafeStringEqual } from "./security/timingSafeCompare.js";
import { createSecurityHeaders } from "./http/securityHeaders.js";
import { handleVerifyPacketRoute } from "./routes/verifyPacket.js";
import { handleLearningGatePreviewRoute } from "./routes/learningGatePreview.js";
export { pickAllowedOrigin, resolveAllowedOrigins } from "./http/cors.js";

export type ServerCapability =
  | "health"
  | "model-registry"
  | "provider-registry"
  | "provider-completion-proxy"
  | "agent-delegation-endpoint"
  | "vllm-health"
  | "vllm-health-degraded"
  | "runtime-status"
  | "remote-run-request"
  | "tmux-dispatch-gate"
  | "tmux-capture-gate"
  | "approval-queue"
  | "cockpit-readonly-snapshot"
  | "event-storage-sync"
  | "event-stream"
  | "memory-sync";

export type ServerHealthResponse = {
  service: "ai-orchestrator-dgx-server";
  status: "ok" | "degraded";
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

/**
 * 미션 checkpoint/rollback용 git 실행기 — merge 러너와 같은 execFile(shell:false) +
 * env 화이트리스트 + 타임아웃. 인젝션 방지.
 */
const missionCheckpointGitExec: GitExecFn = async (repoRoot, args) => {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["-C", repoRoot, ...args], {
      env: getFilteredSubprocessEnv({}),
      timeout: Number(process.env.MISSION_MERGE_TIMEOUT_MS ?? 60_000),
      maxBuffer: 4_000_000,
      windowsHide: true,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number | string; stdout?: string; stderr?: string };
    return { exitCode: typeof e.code === "number" ? e.code : 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
};

/**
 * D5a preview 프로세스 — 워크스페이스당 하나의 dev 프로세스를 추적한다(프로세스 단위
 * 상태라 module-level). 서버 종료 시 disposeAllPreviews로 유령 dev 서버를 막는다.
 */
const previewProcessRegistry: PreviewProcessRegistry = new Map();

/** preview 명령을 셸 없이 spawn — 포트는 PORT env로 전달, stderr preview만 보관. */
const realPreviewSpawn: PreviewSpawnFn = ({ command, argv, cwd, port }) => {
  const child = childSpawn(command, argv, {
    cwd,
    env: { ...getFilteredSubprocessEnv({}), PORT: String(port) },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-2_000);
  });
  child.stdout?.on("data", () => {
    /* drain */
  });
  child.on("error", () => {
    /* spawn 실패는 onExit/probe 타임아웃으로 흡수 */
  });
  return {
    kill: () => {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    },
    onExit: (cb) => child.once("exit", (code) => cb(code)),
    stderrPreview: () => stderr,
  };
};

/** preview 포트를 HTTP GET으로 probe — 어떤 응답이든 오면 서빙 중(observed). */
const realPreviewHttpProbe: PreviewHttpProbe = ({ host, port }) =>
  new Promise<boolean>((resolvePromise) => {
    const req = httpGet({ host, port, path: "/", timeout: 1_500 }, (res) => {
      res.resume();
      resolvePromise(true);
    });
    req.once("timeout", () => {
      req.destroy();
      resolvePromise(false);
    });
    req.once("error", () => resolvePromise(false));
  });

const realPreviewWait = (ms: number) => new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));

/** D5b: observed preview URL의 HTML을 가져온다(HTTP-tier visual QA). 본문은 200KB 제한. */
function fetchPreviewHtml(url: string): Promise<{ ok: boolean; status: number; html: string }> {
  return new Promise((resolvePromise) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      resolvePromise({ ok: false, status: 0, html: "" });
      return;
    }
    const req = httpGet(
      { host: parsed.hostname, port: Number(parsed.port) || 80, path: parsed.pathname || "/", timeout: 3_000 },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          if (body.length < 200_000) body += String(chunk);
        });
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          resolvePromise({ ok: status >= 200 && status < 400, status, html: body });
        });
      },
    );
    req.once("timeout", () => {
      req.destroy();
      resolvePromise({ ok: false, status: 0, html: "" });
    });
    req.once("error", () => resolvePromise({ ok: false, status: 0, html: "" }));
  });
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
  /**
   * When true, a completion may target a modelId outside defaultModelIds as long
   * as it appears in the provider's live-discovered /models list (cached with a
   * short TTL). Only meaningful together with supportsModelList. Providers without
   * this flag keep the strict defaultModelIds-only allowlist (fail closed).
   */
  allowDiscoveredModels?: boolean;
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

const tmuxDispatchApprovalReplayFields: Array<keyof ServerTmuxDispatchRequest> = [
  "id",
  "sessionId",
  "terminalSessionId",
  "role",
  "host",
  "paneId",
  "requestedBy",
  "commandPreview",
  "dispatchMode",
  "tmuxSessionName",
  "createdAt",
];

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
    defaultModelIds: ["claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-code-compatible", "claude-sonnet-reseller", "claude-haiku-reseller"],
    supportsModelList: false,
  },
  {
    providerProfileId: "provider_apifun_claude_b",
    baseUrl: process.env.APIKEYFUN_ANTHROPIC_BASE_URL ?? process.env.APIFUN_BASE_URL ?? "https://api.apikey.fun",
    apiKeyEnvNames: ["ANTHROPIC_API_KEY_ALT", "APIKEYFUN_CLAUDE_B_KEY"],
    envFilePaths: ["~/openclaws/2/env"],
    apiKeyFileEnvName: "APIFUN_CLAUDE_B_API_KEY_FILE",
    apiStyle: "anthropic_messages",
    defaultModelIds: ["claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-code-compatible", "claude-sonnet-reseller", "claude-haiku-reseller"],
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
    providerProfileId: "provider_mimo_token_openai",
    baseUrl: process.env.MIMO_OPENAI_BASE_URL ?? "https://token-plan-sgp.xiaomimimo.com/v1",
    apiKeyEnvNames: ["MIMO_API_KEY", "XIAOMI_MIMO_API_KEY"],
    apiKeyFileEnvName: "MIMO_API_KEY_FILE",
    apiStyle: "openai_chat",
    defaultModelIds: ["mimo-v2.5-pro", "mimo-v2.5", "mimo-v2.5-asr"],
    supportsModelList: true,
  },
  {
    providerProfileId: "provider_mimo_token_anthropic",
    baseUrl: process.env.MIMO_ANTHROPIC_BASE_URL ?? "https://token-plan-sgp.xiaomimimo.com/anthropic",
    apiKeyEnvNames: ["MIMO_API_KEY", "XIAOMI_MIMO_API_KEY"],
    apiKeyFileEnvName: "MIMO_API_KEY_FILE",
    apiStyle: "anthropic_messages",
    defaultModelIds: ["mimo-v2.5-pro", "mimo-v2.5"],
    supportsModelList: false,
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
  {
    // RecursiveMAS serving moved back to dgx-02 as of 2026-07-09 (dgx-02 8001 vLLM
    // stopped, freeing GPU); stable providerProfileId kept to avoid localStorage/seed churn.
    providerProfileId: "provider_rmas_dgx02",
    baseUrl: process.env.RMAS_DGX02_BASE_URL ?? "http://100.71.215.84:4041/v1",
    apiKeyEnvNames: [],
    noAuth: true,
    apiStyle: "openai_chat",
    defaultModelIds: ["rmas-sequential-light"],
    supportsModelList: true,
  },
  {
    // Local codexopen proxy (fork on :10200). No auth, OpenAI-compatible /v1.
    // It advertises many models across vendors (ids may contain "/", e.g.
    // "anthropic/claude-opus-4-8"), so allowDiscoveredModels lets any live-listed
    // model be selected/swapped freely instead of freezing on the static seven.
    providerProfileId: "provider_codexopen",
    baseUrl: process.env.CODEXOPEN_BASE_URL ?? "http://127.0.0.1:10200/v1",
    apiKeyEnvNames: [],
    noAuth: true,
    apiStyle: "openai_chat",
    defaultModelIds: [
      "gpt-5.5",
      "gpt-5.4-mini",
      "anthropic/claude-opus-4-8",
      "anthropic/claude-sonnet-5",
      "xiaomi/mimo-v2.5-pro",
      "kimi/kimi-k2.7-code",
      "google-vertex/gemini-3.5-flash",
    ],
    supportsModelList: true,
    allowDiscoveredModels: true,
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
      : `DGX-02 server reachable but vLLM probe failed: ${probe?.error ?? "오류 원문 없음"}`,
    updatedAt: now,
  };
}

export function createHealthResponse(now = new Date().toISOString(), probe?: DgxVllmProbe): ServerHealthResponse {
  const vllmReachable = probe?.status !== "unreachable";
  const dgxCapabilities: ServerCapability[] = vllmReachable
    ? ["provider-completion-proxy", "vllm-health", "remote-run-request"]
    : ["vllm-health-degraded"];

  return {
    service: "ai-orchestrator-dgx-server",
    status: vllmReachable ? "ok" : "degraded",
    runtime: createRuntimeSnapshot(now, probe),
    capabilities: [
      "health",
      "model-registry",
      "provider-registry",
      "agent-delegation-endpoint",
      "runtime-status",
      ...dgxCapabilities,
      "tmux-dispatch-gate",
      "tmux-capture-gate",
      "approval-queue",
      "cockpit-readonly-snapshot",
      "event-storage-sync",
      "event-stream",
      "memory-sync",
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
      : [`DGX-02 vLLM probe failed: ${probe?.error ?? "오류 원문 없음"}`],
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
      source: "static_fallback",
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
      source: "static_fallback",
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
      status: fellBackToStatic ? "failed" : "succeeded",
      source: fellBackToStatic ? "static_fallback" : "remote_probe",
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
    source: "static_fallback",
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

export async function createServerOperatorCockpitSnapshot(
  options: DgxProviderCompletionOptions & { eventStorage?: ServerEventStorageSnapshot } = {},
): Promise<OperatorCockpitSnapshot> {
  const timestamp = options.now ?? new Date().toISOString();
  const [runtime, providerRegistry] = await Promise.all([
    createLiveRuntimeSnapshot({
      now: timestamp,
      vllmBaseUrl: options.vllmBaseUrl,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    }),
    createServerProviderRegistrySnapshot({
      now: timestamp,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    }),
  ]);
  const selectedProvider =
    providerRegistry.entries.find((entry) => entry.secretAvailability === "available" && entry.selectedModelId) ??
    providerRegistry.entries.find((entry) => entry.selectedModelId) ??
    providerRegistry.entries[0];
  const missingSecrets = providerRegistry.entries.filter((entry) => entry.secretAvailability === "missing");
  const expiredSecrets = providerRegistry.entries.filter((entry) => entry.secretAvailability === "expired");
  const revokedSecrets = providerRegistry.entries.filter((entry) => entry.secretAvailability === "revoked");
  const unavailableProviders = [...missingSecrets, ...expiredSecrets, ...revokedSecrets];
  const outboxCount = runtime.syncTopology.clients.reduce((sum, client) => sum + client.outboxCount, 0);
  const dgxMirrorHealth =
    runtime.dgxStatus === "online"
      ? runtime.memorySyncStatus === "degraded"
        ? "degraded"
        : "healthy"
      : "disconnected";
  const outboxSyncStatus =
    runtime.memorySyncStatus === "offline"
      ? "failed"
      : runtime.memorySyncStatus === "syncing" || outboxCount > 0
        ? "pending"
        : "synced";
  const vllmWorkerStatus = runtime.dgxStatus === "online" ? "idle" : "error";
  const providerWorkerStatus = providerRegistry.summary.ready > 0 ? "idle" : "blocked";
  const eventStorageStatus = options.eventStorage
    ? options.eventStorage.revision > 0 || options.eventStorage.sessionCount > 0
      ? "idle"
      : "waiting_approval"
    : "waiting_approval";
  const selectedModelId = selectedProvider?.selectedModelId ?? selectedProvider?.defaultModelIds[0] ?? "unavailable";
  const healthIndicators = [
    `Provider registry: ${providerRegistry.summary.ready}/${providerRegistry.summary.total} ready`,
    options.eventStorage
      ? `Event storage: ${options.eventStorage.mode}, ${options.eventStorage.eventCount} events, revision ${options.eventStorage.revision}`
      : "Event storage: unavailable in this snapshot",
    runtime.dgxStatus === "online" ? "DGX runtime reachable" : "DGX runtime unreachable; desktop fallback remains authoritative",
  ];

  if (runtime.recentError) {
    healthIndicators.push(`Runtime warning: ${redactSecretsForLog(runtime.recentError).slice(0, 180)}`);
  }

  const snapshot: OperatorCockpitSnapshot = {
    id: `server-cockpit-${timestamp.replace(/[-:.TZ]/g, "")}`,
    timestamp,
    fleet: [
      {
        workerId: "server-provider-registry",
        role: "orchestrator",
        status: providerWorkerStatus,
        statusRingColor: providerRegistry.summary.ready > 0 ? "green" : "red",
        blockedReason: providerRegistry.summary.ready > 0 ? undefined : "No server-backed providers are ready",
        securityTier: "tmux",
      },
      {
        workerId: "server-event-storage",
        role: "memory_curator",
        status: eventStorageStatus,
        statusRingColor: eventStorageStatus === "idle" ? "green" : "yellow",
        securityTier: "container",
      },
      {
        workerId: "server-dgx-runtime",
        role: "executor",
        status: vllmWorkerStatus,
        statusRingColor: vllmWorkerStatus === "idle" ? "green" : "red",
        blockedReason: vllmWorkerStatus === "error" ? "DGX runtime probe is unreachable" : undefined,
        securityTier: "tmux",
      },
    ],
    approvals: unavailableProviders.map((entry) => ({
      blockReason: `${entry.name} credential is ${entry.secretAvailability}`,
      evidenceRefs: [
        {
          id: `provider:${entry.providerProfileId}`,
          kind: "routine_reference",
          reference: entry.providerProfileId,
          summary: `${entry.authMode} provider registry readiness`,
          observedAt: entry.updatedAt,
        },
      ],
      commandPreview: entry.modelDiscoveryEndpoint ? `GET ${entry.modelDiscoveryEndpoint}` : undefined,
      payloadBindingStatus: "unbound",
      tamperWarning: false,
      securityRisk: "Provider is unavailable until the server-side secret/session is restored.",
    })),
    handoffs: [],
    memory: {
      contextReasons: [
        "Server provider registry readiness",
        "DGX runtime reachability",
        "Persistent event storage revision",
      ],
      macBookAuthorityEnabled: runtime.syncTopology.authorityLabel === "MacBook Pro",
      dgxMirrorHealth,
      contradictionWarnings: runtime.recentError ? [redactSecretsForLog(runtime.recentError).slice(0, 180)] : [],
    },
    routing: {
      selectedModelId,
      fallbackStatus: providerRegistry.summary.ready > 1 ? "available" : "none",
      costBadge: selectedModelId.toLowerCase().includes("opus") ? "high" : "medium",
      speedBadge: selectedModelId.toLowerCase().includes("mini") ? "fast" : "average",
      trustBadge: selectedProvider?.trustLevel ?? "limited",
    },
    recovery: {
      offlineResumeSupported: runtime.syncTopology.offlineWritePolicy === "append_local_outbox_when_offline",
      outboxSyncStatus,
      healthIndicators,
    },
    dispatchHistory: [],
  };

  return operatorCockpitSnapshotSchema.parse(snapshot) as OperatorCockpitSnapshot;
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
    provider_mimo_token_openai: "MiMo Token Plan OpenAI",
    provider_mimo_token_anthropic: "MiMo Token Plan Anthropic",
    provider_openclaw_dgx: "DGX-02 OpenClaw vLLM",
    provider_rmas_dgx02: "RMAS DGX-02 (latent MAS)",
    provider_codexopen: "codexopen 프록시",
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
  if (providerProfileId.includes("mimo_token")) {
    return "trusted";
  }

  if (providerProfileId.includes("apifun")) {
    return "untrusted";
  }

  if (providerProfileId.includes("openrouter") || providerProfileId.includes("apikeyfun") || providerProfileId.includes("mimo")) {
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

type DiscoveredModelCacheEntry = { modelIds: Set<string>; expiresAt: number };

const discoveredModelCacheByProviderId = new Map<string, DiscoveredModelCacheEntry>();
const DISCOVERED_MODEL_CACHE_TTL_MS = 60_000;
const DISCOVERED_MODEL_CACHE_FAILURE_TTL_MS = 5_000;

function getCachedDiscoveredModelIds(providerProfileId: string, now = Date.now()): Set<string> | undefined {
  const cached = discoveredModelCacheByProviderId.get(providerProfileId);
  if (!cached || cached.expiresAt <= now) {
    return undefined;
  }
  return cached.modelIds;
}

/**
 * Synchronous allowlist check used by the completion gate. A modelId is allowed
 * when it is in the static defaultModelIds, or (only when allowDiscoveredModels
 * is set) when a fresh cached discovery snapshot advertises it. A cold or expired
 * cache fails closed to defaults-only until refreshed out of band.
 */
export function isServerProviderModelAllowed(config: ServerProviderProxyConfig, modelId: string): boolean {
  if (config.defaultModelIds.includes(modelId)) {
    return true;
  }
  if (!config.allowDiscoveredModels) {
    return false;
  }
  const discovered = getCachedDiscoveredModelIds(config.providerProfileId);
  return discovered ? discovered.has(modelId) : false;
}

/**
 * Refreshes and caches the discovered-model allowlist for an allowDiscoveredModels
 * provider by reusing the existing model-discovery path (OpenAICompatibleAdapter
 * discoverModels + static fallback). On any non-remote-probe result we fail closed
 * to defaultModelIds only, with a short failure TTL so a transient outage recovers.
 */
export async function refreshDiscoveredModelCacheForProvider(
  providerProfileId: string,
  options: DgxProviderCompletionOptions = {},
): Promise<Set<string>> {
  const config = serverProviderProxyConfigs.find((candidate) => candidate.providerProfileId === providerProfileId);
  if (!config || !config.allowDiscoveredModels || !config.supportsModelList) {
    return new Set(config?.defaultModelIds ?? []);
  }

  const now = Date.now();
  let succeeded = false;
  let allowedIds = new Set(config.defaultModelIds);
  try {
    const discovery = await createServerProviderModelDiscoveryResponse(providerProfileId, options);
    succeeded = discovery.status === "succeeded" && discovery.source === "remote_probe";
    if (succeeded) {
      allowedIds = new Set([...config.defaultModelIds, ...discovery.models.map((model) => model.id)]);
    }
  } catch {
    // fail closed: keep defaults-only allowance on discovery failure
    succeeded = false;
    allowedIds = new Set(config.defaultModelIds);
  }

  discoveredModelCacheByProviderId.set(providerProfileId, {
    modelIds: allowedIds,
    expiresAt: now + (succeeded ? DISCOVERED_MODEL_CACHE_TTL_MS : DISCOVERED_MODEL_CACHE_FAILURE_TTL_MS),
  });
  return allowedIds;
}

/**
 * Primes the discovered-model cache before a gate evaluation when the request
 * targets a non-default model on an allowDiscoveredModels provider. Callers invoke
 * this from their async context; the gate itself stays synchronous and only reads
 * the cache. Discovery failures are swallowed so the gate fails closed to defaults.
 */
export async function ensureDiscoveredModelAllowance(
  request: ProviderCompletionRequest,
  options: DgxProviderCompletionOptions = {},
): Promise<void> {
  const config = serverProviderProxyConfigs.find(
    (candidate) => candidate.providerProfileId === request.providerProfileId,
  );
  if (!config || !config.allowDiscoveredModels) {
    return;
  }
  if (config.defaultModelIds.includes(request.modelId)) {
    return;
  }
  if (getCachedDiscoveredModelIds(request.providerProfileId)) {
    return;
  }
  try {
    await refreshDiscoveredModelCacheForProvider(request.providerProfileId, options);
  } catch {
    // leave cache empty so the gate denies the non-default model (fail closed)
  }
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

  if (config && !isServerProviderModelAllowed(config, request.modelId)) {
    return {
      action: "provider_completion",
      approvalState: "rejected",
      decision: "deny",
      requestedLevels,
      reason: "provider model is not registered in the DGX-02 proxy allowlist",
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
  await ensureDiscoveredModelAllowance(request);
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
        ? `쿠루미이 하위 에이전트에게 확인할게. <delegate to="researcher">${request.messages.at(-1)?.content ?? "조사"}</delegate>`
        : callCount === 2
          ? "마오마오 조사 결과: 핵심 근거 3개와 리스크 1개를 확인했어."
          : "쿠루미 최종 정리: 하위 에이전트 확인까지 반영해서 바로 실행 가능한 결론으로 묶었어.";
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

function tmuxDispatchApprovalReplayMatchesRequest(
  approval: ApprovalRequest,
  request: ServerTmuxDispatchRequest,
): boolean {
  const replay = approval.replay;
  if (!replay || replay.kind !== "tmux_dispatch" || replay.endpoint !== "/tmux/dispatch" || replay.method !== "POST") {
    return false;
  }
  if (!replay.payload || typeof replay.payload !== "object" || Array.isArray(replay.payload)) {
    return false;
  }

  const payload = replay.payload as Partial<Record<keyof ServerTmuxDispatchRequest, unknown>>;
  if (payload.approvalState !== "approved") {
    return false;
  }

  return tmuxDispatchApprovalReplayFields.every((field) => payload[field] === request[field]);
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
    let replayPayloadMismatch = false;
    if (storageState) {
      const approvalsList = listApprovalsFromServerStorage(storageState, actualNow);
      const matchedApproval = approvalsList.approvals.find(
        (a) => a.id === createApprovalId(request.id) || a.sourceItemId === request.id
      );
      if (matchedApproval && matchedApproval.state === "approved") {
        if (tmuxDispatchApprovalReplayMatchesRequest(matchedApproval, request)) {
          isApproved = true;
        } else {
          replayPayloadMismatch = true;
        }
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
        reason: replayPayloadMismatch
          ? "tmux dispatch approval bypass attempt detected: approval replay payload mismatch"
          : "tmux dispatch approval bypass attempt detected: approval state 'approved' not found in event store",
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
    reason: "tmux 디스패치는 send-keys 실행 전 명시적 승인이 필요합니다",
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
  if (delegationRequest.executionMode === "mock" && !isMockAgentDelegationEnabled()) {
    throw new Error("mock agent delegation execution requires ENABLE_MOCK_AGENT_DELEGATION=true");
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
  if (source === "api" || source === "external_legacy") return "external_channel";
  if (source === "server") return "server";
  return "user";
}

function sourceTrustFromEventSource(source: ProviderCompletionRequest["source"]): SourceTrust {
  if (source === "external_legacy" || source === "api") return "untrusted";
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
  if (value === "external_legacy" || value === "mobile" || value === "api" || value === "webhook") {
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
  if (channel === "external_legacy") return "external_legacy";
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

  const scriptPath = resolveSwarmScriptPath("swarm-send.sh", { envOverride: process.env.TMUX_SWARM_SEND_SCRIPT });
  const timeoutMs = Number(process.env.ORCHESTRATOR_TMUX_SEND_TIMEOUT_MS ?? 15_000);

  try {
    const result = await execFileAsync(scriptPath, [request.role, request.commandPreview], {
      cwd: swarmScriptCwd(scriptPath),
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
  const scriptPath = resolveSwarmScriptPath("swarm-capture.sh", {
    envOverride: process.env.TMUX_SWARM_CAPTURE_SCRIPT,
  });
  const timeoutMs = Number(process.env.ORCHESTRATOR_TMUX_CAPTURE_TIMEOUT_MS ?? 10_000);
  const result = await execFileAsync(scriptPath, [request.role, "--lines", String(request.lines)], {
    cwd: swarmScriptCwd(scriptPath),
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

  if (providerProfileId.includes("mimo_token")) {
    return [
      "dgx-secret-ref",
      "server-proxy",
      "mimo",
      "token-plan",
      providerProfileId.includes("anthropic") ? "anthropic-compatible" : "openai-compatible",
    ];
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
  sourceChannel: z.enum(["desktop", "external_legacy", "mobile", "api", "agent"]),
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
      defaultMaxTokens: 4096,
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
    maxTokens: 4096,
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

/** LLM content에서 첫 JSON 객체만 뽑는다(코드펜스/잡설 제거). 없으면 null. */
function extractJsonObject(text: string): string | null {
  const fenced = text.replace(/```(?:json)?/gi, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return fenced.slice(start, end + 1);
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

  if (!isServerProviderModelAllowed(config, request.modelId)) {
    return {
      id: `provider_completion_response_${crypto.randomUUID()}`,
      requestId: request.id,
      providerProfileId: request.providerProfileId,
      modelId: request.modelId,
      route: "server_proxy",
      status: "failed",
      error: "provider model is not registered in the DGX-02 proxy allowlist",
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
    extraBody: config.providerProfileId === "provider_mimo_token_openai"
      ? {
          // MiMo는 max_tokens보다 이 필드를 우선한다 — 요청 rider를 따르고,
          // 없으면 4096 (512 고정은 표/코드가 든 대화 답변을 중간에 끊었다)
          max_completion_tokens: request.maxOutputTokens ?? 4096,
          thinking: {
            type: "disabled",
          },
          top_p: 0.95,
        }
      : undefined,
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
    maxTokens: 4096,
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
      timeoutMs: 120_000,
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
    defaultMaxTokens: 4096,
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
      timeoutMs: 120_000,
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

function isMockAgentDelegationEnabled() {
  return process.env.ENABLE_MOCK_AGENT_DELEGATION === "true";
}

export function createRemoteRunResponse(
  request: RemoteExecutionRequest,
  runtime = createRuntimeSnapshot(),
  options: { workerAck?: boolean } = {},
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

  if (!options.workerAck) {
    return {
      id: `remote_response_${crypto.randomUUID()}`,
      requestId: request.id,
      status: "blocked",
      targetNodeId: request.targetNodeId,
      fallbackMode: request.kind === "model_inference" ? "local_model" : "local_cli",
      message: "remote worker queue acknowledgement is unavailable; use the tmux dispatch gate or local fallback",
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
  const eventLogPath = join(resolvedStorageDir, ACTIVE_EVENT_LOG);
  return {
    mode: "jsonl",
    storageDir: resolvedStorageDir,
    eventLogPath,
    loadedAt: new Date().toISOString(),
    // 활성 파일 + 회전된 모든 세그먼트를 오래된 것부터 스트리밍으로 복원
    statePromise: loadServerEventStorageStateFromDir(resolvedStorageDir),
    queue: Promise.resolve(),
  };
}

/** 한 JSONL 파일을 줄 단위 스트리밍으로 읽어 상태에 누적한다(메모리 스파이크 없음). */
async function streamEventRecordsIntoState(state: ServerEventStorageState, filePath: string): Promise<void> {
  let stream: ReturnType<typeof createReadStream>;
  try {
    stream = createReadStream(filePath, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return;
    }
    throw error;
  }

  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
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
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") {
      throw error;
    }
  } finally {
    rl.close();
  }
}

/** 단일 파일 복원 — 시그니처 유지(기존 테스트/호출부 호환). 내부는 스트리밍. */
export async function loadServerEventStorageStateFromJsonl(eventLogPath: string): Promise<ServerEventStorageState> {
  const state = createServerEventStorageState();
  await streamEventRecordsIntoState(state, eventLogPath);
  return state;
}

/** 디렉터리의 활성 파일 + 회전 세그먼트 전체를 오래된 것부터 스트리밍 복원. */
export async function loadServerEventStorageStateFromDir(storageDir: string): Promise<ServerEventStorageState> {
  const state = createServerEventStorageState();
  let entries: string[];
  try {
    entries = await readdir(storageDir);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return state;
    }
    throw error;
  }

  for (const fileName of orderLogFilesOldestFirst(entries)) {
    await streamEventRecordsIntoState(state, join(storageDir, fileName));
  }
  return state;
}

function resolveEventLogRotationPolicy(): { maxBytes: number; keepSegments: number } {
  const maxBytes = Number(process.env.EVENT_LOG_MAX_BYTES ?? DEFAULT_EVENT_LOG_MAX_BYTES);
  const keepSegments = Number(process.env.EVENT_LOG_KEEP_SEGMENTS ?? DEFAULT_EVENT_LOG_KEEP_SEGMENTS);
  return {
    maxBytes: Number.isFinite(maxBytes) && maxBytes >= 0 ? maxBytes : DEFAULT_EVENT_LOG_MAX_BYTES,
    keepSegments:
      Number.isFinite(keepSegments) && keepSegments >= 0 ? Math.floor(keepSegments) : DEFAULT_EVENT_LOG_KEEP_SEGMENTS,
  };
}

/**
 * append 직전 호출: 활성 파일이 임계에 닿았으면 타임스탬프 세그먼트로 회전하고,
 * 보관 한도를 넘긴 가장 오래된 세그먼트를 정리한다. 회전/정리는 best-effort라
 * 실패해도 append 자체를 막지 않는다(로그만). append 경로가 큐로 직렬화돼 있어
 * 동시 회전은 일어나지 않는다.
 */
async function rotateEventLogIfNeeded(eventLogPath: string, nowMs: number): Promise<void> {
  const { maxBytes, keepSegments } = resolveEventLogRotationPolicy();
  const dir = dirname(eventLogPath);

  let activeSize = 0;
  try {
    activeSize = (await stat(eventLogPath)).size;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return; // 아직 활성 파일 없음 — 회전 불필요
    }
    throw error;
  }

  if (!shouldRotateEventLog(activeSize, maxBytes)) {
    return;
  }

  // 같은 ms 충돌 시 빈 이름을 찾을 때까지 ms를 밀어 데이터 덮어쓰기를 막는다
  let stampMs = nowMs;
  let targetPath = join(dir, rotatedSegmentName(stampMs));
  for (;;) {
    try {
      await stat(targetPath);
      stampMs += 1;
      targetPath = join(dir, rotatedSegmentName(stampMs));
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        break;
      }
      throw error;
    }
  }

  try {
    await rename(eventLogPath, targetPath);
    console.log(`event log rotated: ${ACTIVE_EVENT_LOG} (${activeSize} bytes) -> ${rotatedSegmentName(stampMs)}`);
  } catch (error) {
    console.warn(
      `event log rotation failed (continuing to append): ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  try {
    const entries = await readdir(dir);
    for (const stale of segmentsToPrune(entries, keepSegments)) {
      await unlink(join(dir, stale));
      console.log(`event log segment pruned (over keep=${keepSegments}): ${stale}`);
    }
  } catch (error) {
    console.warn(`event log prune failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`);
  }
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

/**
 * Mission store를 기존 Event Storage 위에 조립한다. 미션은 append-only
 * mission.* 이벤트로만 저장되고(events.jsonl + 회전 세그먼트), 읽기는
 * materialized view 재구성이다 — 서버 재시작 후에도 GET /missions가 살아난다.
 */
export function createServerMissionStore(storage: JsonlServerEventStorage): MissionStore {
  return createMissionStore({
    loadEvents: async () => {
      const state = await storage.statePromise;
      return [...state.eventsById.values()];
    },
    appendEvents: async (sessionId, envelopes) => {
      const first = envelopes[0];
      if (!first) {
        return;
      }
      const response = await pushEventsToPersistentServerStorage(
        {
          id: `sync_missions_${first.id}`,
          clientId: "server_missions",
          sessionId,
          events: envelopes,
          idempotencyKey: `server_missions:${sessionId}:${first.id}`,
          createdAt: first.createdAt,
        },
        storage,
        first.createdAt,
      );
      const rejected = response.results.filter(
        (result) => result.status !== "accepted" && result.status !== "duplicate",
      );
      if (rejected.length > 0) {
        throw new Error(
          `mission events rejected: ${rejected.map((result) => `${result.eventId}:${result.status}`).join(", ")}`,
        );
      }
    },
    // L1: append 직후 미션 trace를 그 미션을 구독 중인 SSE 스트림에만 push한다.
    // 새 저장소 없음 — traceEventFromMissionEnvelope로 EventStorage에서 파생.
    onEventsCommitted: (missionId, envelopes) => {
      missionTraceBus.publish(missionId, [...envelopes]);
    },
    // L3: verify/merge 전 자동 checkpoint. ORCHESTRATOR_ALLOWED_REPO_ROOTS가 없으면
    // skipped(이 배포엔 미적용 — 회귀 0). 있으면 실제 git rev-parse로 observed sha를
    // 관측해 checkpoint로 기록한다(합성 sha 금지). 자동 rollback은 절대 하지 않는다.
    autoCheckpoint: async (missionId, reason) => {
      const allowedRepoRoots = parseAllowedRepoRoots(process.env.ORCHESTRATOR_ALLOWED_REPO_ROOTS);
      const repoRoot = (process.env.ORCHESTRATOR_CHECKPOINT_REPO_ROOT ?? allowedRepoRoots[0])?.trim();
      if (!repoRoot || allowedRepoRoots.length === 0) {
        return { status: "skipped", reason: "checkpoint repo root가 구성되지 않았습니다 (ORCHESTRATOR_ALLOWED_REPO_ROOTS 비어있음)" };
      }
      const result = await createMissionCheckpoint({
        id: `checkpoint_${missionId}_${Date.now()}`,
        missionId,
        repoRoot,
        gitRef: "HEAD",
        reason,
        allowedRepoRoots,
        now: () => new Date().toISOString(),
        git: missionCheckpointGitExec,
      });
      return result.ok ? { status: "created", checkpoint: result.checkpoint } : { status: "failed", reason: result.reason };
    },
    // L4: 에러 카드 runner 라벨 — 선택된 sandbox runner와 일치(기본 local).
    verificationRunnerKind: () => (process.env.ORCHESTRATOR_SANDBOX_RUNNER ?? "local").trim().toLowerCase() || "local",
    // L6: curator 승인(approved/pinned) skill을 Obsidian vault로 export(idempotent path).
    // ORCHESTRATOR_SKILL_EXPORT_DIR 미설정이면 export 생략(큐는 그대로 approved 유지).
    exportApprovedSkill: async (candidate) => {
      const dir = process.env.ORCHESTRATOR_SKILL_EXPORT_DIR?.trim();
      if (!dir) return;
      const note = buildObsidianSkillNote(candidate); // path = skills/<id>.md (서버 생성 id, 안전)
      const target = resolve(dir, note.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, note.content, "utf8");
    },
    // E1+L2: 검증 명령을 runner registry가 고른 sandbox에서 실행하고 종료코드를 관측한다.
    // ORCHESTRATOR_SANDBOX_RUNNER=local|docker|gvisor 정책을 따르며, docker/gVisor가
    // unavailable이면 fake fallback 없이 blocked/observed:false로 남긴다(local로 몰래
    // 떨어지지 않음). 명령 allowlist(safeCommandPolicy)는 각 runner 내부 게이트가 책임진다.
    runVerification: async ({ commands, missionId, verifierAgentId, verifierCapabilityMode, reportId }) => {
      const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
      // 검증을 실행할 작업 디렉터리 — 기본은 서버 repo root, ORCHESTRATOR_VERIFY_CWD로
      // 격리된 worktree/temp repo를 가리킬 수 있다(스모크가 실제 repo를 안 건드리게).
      const verifyCwd = process.env.ORCHESTRATOR_VERIFY_CWD?.trim() || repoRoot;
      const timeoutMs = Number(process.env.MISSION_VERIFY_TIMEOUT_MS ?? 180_000);
      const selection = selectVerificationRunner({
        requested: process.env.ORCHESTRATOR_SANDBOX_RUNNER,
        dockerEnabled: process.env.ORCHESTRATOR_ENABLE_DOCKER_RUNNER === "1",
        gvisorEnabled: process.env.ORCHESTRATOR_ENABLE_GVISOR_RUNNER === "1",
        image: process.env.ORCHESTRATOR_SANDBOX_IMAGE,
        allowedImages: parseAllowedRepoRoots(process.env.ORCHESTRATOR_ALLOWED_DOCKER_IMAGES),
      });
      // 호스트에서 명령을 직접 실행 (local runner). 셸 없이 execFile.
      const localExec: LocalExecFn = async (cmd, args) => {
        try {
          const { stdout, stderr } = await execFileAsync(cmd, args, {
            cwd: verifyCwd,
            env: getFilteredSubprocessEnv({}),
            timeout: timeoutMs,
            maxBuffer: 4_000_000,
            windowsHide: true,
          });
          return { exitCode: 0, stdout, stderr, timedOut: false };
        } catch (error) {
          const e = error as { code?: number | string; killed?: boolean; signal?: string; stdout?: string; stderr?: string };
          return {
            exitCode: typeof e.code === "number" ? e.code : e.code ? 1 : null,
            stdout: e.stdout ?? "",
            stderr: e.stderr ?? "",
            timedOut: e.killed === true || e.signal === "SIGTERM",
          };
        }
      };
      // `docker` 바이너리 실행기 (docker/gVisor runner). docker가 없으면 throw → runner가
      // 정직하게 failed/observed:false로 떨어진다(local fallback 없음).
      const dockerExec: LocalExecFn = async (cmd, args) => {
        try {
          const { stdout, stderr } = await execFileAsync(cmd, args, {
            env: getFilteredSubprocessEnv({}),
            timeout: timeoutMs,
            maxBuffer: 4_000_000,
            windowsHide: true,
          });
          return { exitCode: 0, stdout, stderr, timedOut: false };
        } catch (error) {
          const e = error as { code?: number | string; killed?: boolean; signal?: string; stdout?: string; stderr?: string };
          return {
            exitCode: typeof e.code === "number" ? e.code : e.code ? 1 : null,
            stdout: e.stdout ?? "",
            stderr: e.stderr ?? "",
            timedOut: e.killed === true || e.signal === "SIGTERM",
          };
        }
      };
      return runRegistryMissionVerification({
        selection,
        commands,
        missionId,
        verifierAgentId,
        verifierCapabilityMode,
        reportId,
        localExec,
        dockerExec,
        // runsc(gVisor) 프로브 — `docker info`의 Runtimes에 runsc가 있으면 사용 가능.
        // docker 자체가 없으면 false → gVisor runner가 blocked로 떨어진다(가짜 gVisor 금지).
        probeRunsc: async () => {
          try {
            const { stdout } = await execFileAsync(
              "docker",
              ["info", "--format", "{{json .Runtimes}}"],
              { env: getFilteredSubprocessEnv({}), timeout: 10_000, maxBuffer: 1_000_000, windowsHide: true },
            );
            return /runsc/.test(stdout);
          } catch {
            return false;
          }
        },
        worktreePath: verifyCwd,
        timeoutMs,
        now: () => new Date().toISOString(),
      });
    },
    // D4a: 실제 git merge. repoRoot는 ORCHESTRATOR_ALLOWED_REPO_ROOTS에 명시된
    // 것만 허용 — 미명시면 runner가 dry_run으로 떨어진다(합성 sha 금지). 모든
    // git 호출은 execFile(shell:false).
    runMerge: async ({ item, missionTitle }) => {
      const allowedRepoRoots = parseAllowedRepoRoots(process.env.ORCHESTRATOR_ALLOWED_REPO_ROOTS);
      const allowedTargetBranches = parseAllowedRepoRoots(process.env.ORCHESTRATOR_ALLOWED_MERGE_TARGETS).length
        ? parseAllowedRepoRoots(process.env.ORCHESTRATOR_ALLOWED_MERGE_TARGETS)
        : ["main", "develop"];
      const result = await executeMerge({
        item,
        missionTitle,
        allowedRepoRoots,
        allowedTargetBranches,
        now: () => new Date().toISOString(),
        git: async (repoRoot, args) => {
          try {
            const { stdout, stderr } = await execFileAsync("git", ["-C", repoRoot, ...args], {
              env: getFilteredSubprocessEnv({}),
              timeout: Number(process.env.MISSION_MERGE_TIMEOUT_MS ?? 60_000),
              maxBuffer: 4_000_000,
              windowsHide: true,
            });
            return { exitCode: 0, stdout, stderr };
          } catch (error) {
            const e = error as { code?: number | string; stdout?: string; stderr?: string };
            return {
              exitCode: typeof e.code === "number" ? e.code : 1,
              stdout: e.stdout ?? "",
              stderr: e.stderr ?? "",
            };
          }
        },
      });
      return {
        status: result.status,
        mergeCommitSha: result.mergeCommitSha,
        reason: result.reason,
        conflictFiles: result.conflictFiles,
        completedAt: result.completedAt,
      };
    },
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

function isServerOwnedApprovalEventType(eventType: string): boolean {
  return eventType === "approval.requested" || eventType === "approval.granted" || eventType === "approval.rejected";
}

function containsServerOwnedApprovalEvents(request: EventSyncPushRequest): boolean {
  return request.events.some((event) => isServerOwnedApprovalEventType(event.type));
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
  maxCapacityScan?: number;
  now?: () => number;
};

export class NonceRegistry {
  private nonces = new Map<string, number>();
  private readonly maxCapacityScan: number;
  private readonly maxNonces: number;
  private readonly now: () => number;
  private readonly cleanupInterval?: ReturnType<typeof setInterval>;

  constructor(options: NonceRegistryOptions = {}) {
    this.maxNonces = options.maxNonces ?? 100_000;
    this.maxCapacityScan = Math.max(1, Math.trunc(options.maxCapacityScan ?? 64));
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
      const now = this.now();
      let evicted = false;
      let scanned = 0;
      for (const [key, expiry] of this.nonces.entries()) {
        scanned += 1;
        if (now > expiry) {
          this.nonces.delete(key);
          evicted = true;
          break;
        }
        if (scanned >= this.maxCapacityScan) {
          break;
        }
      }
      if (!evicted && this.nonces.size >= this.maxNonces) {
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
      }
    }
  }
}

export function startServer(port = Number(process.env.PORT ?? 4317)) {
  const eventStorage = createJsonlServerEventStorage();
  const missionStore = createServerMissionStore(eventStorage);

  // RMAS autonomous goal-loop stack — a thin parallel to the mission stack over
  // the SAME EventStorage (no second store). The store persists rmas.* events;
  // the controller owns the in-memory background loops + concurrency gate; the
  // trace bus streams committed events to subscribed SSE sessions.
  const rmasRunStore: RmasRunStore = createRmasRunStore({
    loadEvents: async () => {
      const state = await eventStorage.statePromise;
      return [...state.eventsById.values()];
    },
    appendEvents: async (sessionId, envelopes) => {
      const first = envelopes[0];
      if (!first) {
        return;
      }
      const response = await pushEventsToPersistentServerStorage(
        {
          id: `sync_rmas_${first.id}`,
          clientId: "server_rmas",
          sessionId,
          events: envelopes,
          idempotencyKey: `server_rmas:${sessionId}:${first.id}`,
          createdAt: first.createdAt,
        },
        eventStorage,
        first.createdAt,
      );
      const rejected = response.results.filter(
        (result) => result.status !== "accepted" && result.status !== "duplicate",
      );
      if (rejected.length > 0) {
        throw new Error(`rmas events rejected: ${rejected.map((result) => `${result.eventId}:${result.status}`).join(", ")}`);
      }
    },
    // L1: broadcast committed rmas.* events to that run's SSE subscribers.
    onEventsCommitted: (runId, envelopes) => {
      rmasTraceBus.publish(runId, [...envelopes]);
    },
  });

  // Single GPU host → default 1 concurrent run. POST /rmas/runs returns 429 when busy.
  const rmasMaxConcurrent = Math.max(1, Number(process.env.RMAS_MAX_CONCURRENT_RUNS ?? 1) || 1);
  const rmasController: RmasRunController = createRmasRunController({
    // Bind the loop's completion path to the DGX proxy, threading the run's
    // abort signal so in-flight calls cancel on stop / wall-clock.
    complete: (request, ctx) => createDgxProviderCompletionResponse(request, { abortSignal: ctx.abortSignal }),
    appendEvent: (runId, event) => rmasRunStore.appendEvent(runId, event),
    maxConcurrent: rmasMaxConcurrent,
  });

  // Boot reconciliation (§1.1): any run left non-terminal by a previous process
  // lifetime gets rmas.run.interrupted{server_restart}. We never auto-resume
  // (resuming mid-completion risks double-spend).
  void rmasRunStore
    .reconcileInterrupted()
    .then((runIds) => {
      if (runIds.length > 0) {
        console.info(`[orchestrator-server] reconciled ${runIds.length} interrupted RMAS run(s): ${runIds.join(", ")}`);
      }
    })
    .catch((error) => {
      console.warn(`[orchestrator-server] RMAS reconcile failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`);
    });

  // Advisory single-writer guard: two servers sharing one EVENT_STORAGE_DIR
  // interleave JSONL writes and corrupt approval state. Warn (or refuse, when
  // ORCHESTRATOR_STORAGE_LOCK_STRICT=1) instead of corrupting shared state.
  void mkdir(eventStorage.storageDir, { recursive: true })
    .then(() =>
      acquireStorageLock({
        lockPath: join(eventStorage.storageDir, "events.lock"),
        port,
        host: process.env.ORCHESTRATOR_HOST,
        strict: process.env.ORCHESTRATOR_STORAGE_LOCK_STRICT === "1",
      }),
    )
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      // Only a strict-mode contention refusal should take the process down.
      // Otherwise this best-effort guard must never exit (it would also kill
      // test runners that start the server in-process).
      if (process.env.ORCHESTRATOR_STORAGE_LOCK_STRICT === "1") {
        process.exit(1);
      }
    });


  const memoryAdapterKind = (process.env.MEMORY_ADAPTER ?? "local_heuristic") as MemoryAdapterKind;
  let rawMemoryAdapter: MemoryAdapter;
  if (memoryAdapterKind === "memento_mcp") {
    rawMemoryAdapter = new MementoMcpAdapter({
      profileId: "server_memento_mcp",
      policy: (process.env.MEMENTO_POLICY ?? "local_cache") as any,
    });
  } else if (memoryAdapterKind === "dgx_simplemem") {
    rawMemoryAdapter = new (SimpleMemAdapter as any)({
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
  const authRateLimiter = new AuthRateLimiter();

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
        ...createSecurityHeaders(),
        ...corsHeaders,
      });
      response.end(JSON.stringify(payload));
    };

    const requireAuth = async (): Promise<boolean> => {
      const clientKey = resolveClientKey(request);
      if (authRateLimiter.isBlocked(clientKey)) {
        response.setHeader("retry-after", String(Math.ceil(authRateLimiter.windowMs / 1000)));
        respondJson(429, { error: "too_many_failed_auth_attempts" });
        return false;
      }

      // Counts toward the per-client failed-auth budget. Body-shape errors
      // (413/400) and capacity errors (503) are not auth failures and respond
      // directly without touching the limiter.
      const denyAuth = (payload: unknown): false => {
        authRateLimiter.recordFailure(clientKey);
        respondJson(401, payload);
        return false;
      };

      if (
        typeof request.headers.authorization === "string" &&
        timingSafeStringEqual(request.headers.authorization, expectedAuthorization)
      ) {
        authRateLimiter.recordSuccess(clientKey);
        return true;
      }

      const signatureHeader = request.headers["x-dgx-signature"];
      const timestampHeader = request.headers["x-dgx-timestamp"];
      const nonceHeader = request.headers["x-dgx-nonce"];
      const bodyHashHeader = request.headers["x-dgx-body-sha256"];

      if (signatureHeader && timestampHeader && nonceHeader && bodyHashHeader) {
        const userSig = typeof signatureHeader === "string" ? signatureHeader : "";
        const nonce = typeof nonceHeader === "string" ? nonceHeader : "";
        const bodyHash = typeof bodyHashHeader === "string" ? bodyHashHeader : "";
        const hexSha256Pattern = /^[0-9a-fA-F]{64}$/;

        if (!hexSha256Pattern.test(bodyHash) || !nonce) {
          return denyAuth({ error: "unauthorized" });
        }

        const timestamp = Number(timestampHeader);
        const driftWindowMs = Number(process.env.DGX_ORCHESTRATOR_DRIFT_WINDOW_MS) || 300_000;
        const now = Date.now();

        if (isNaN(timestamp) || Math.abs(now - timestamp) > driftWindowMs) {
          return denyAuth({ error: "clock_drift_exceeded" });
        }

        const signedPath = `${pathname}${requestUrl.search}`;
        const message = [request.method?.toUpperCase() || "", signedPath, bodyHash.toLowerCase(), String(timestampHeader), nonce].join("\n");
        const expectedHmac = crypto.createHmac("sha256", apiToken).update(message).digest("hex");

        const expectedBuffer = crypto.createHash("sha256").update(expectedHmac).digest();
        const userBuffer = crypto.createHash("sha256").update(userSig).digest();
        const signaturesMatch = crypto.timingSafeEqual(expectedBuffer, userBuffer) && hexSha256Pattern.test(userSig);

        if (!signaturesMatch) {
          return denyAuth({ error: "unauthorized" });
        }

        if (nonceRegistry.has(nonce)) {
          response.setHeader("connection", "close");
          return denyAuth({ error: "replay_detected" });
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
          return denyAuth({ error: "unauthorized" });
        }

        if (nonceRegistry.has(nonce)) {
          response.setHeader("connection", "close");
          return denyAuth({ error: "replay_detected" });
        }

        try {
          nonceRegistry.add(nonce, driftWindowMs * 2);
        } catch (error) {
          respondJson(503, { error: error instanceof Error ? error.message : "nonce_registry_capacity_exceeded" });
          return false;
        }
        authRateLimiter.recordSuccess(clientKey);
        return true;
      }

      return denyAuth({ error: "unauthorized" });
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

    // D8: 컨트롤 스트립 가용성 — runner는 env에서 정직하게 파생(없으면 미노출 → blocked).
    if (pathname === "/controls/availability" && request.method === "GET") {
      const runners: string[] = ["local", "tmux_observation"];
      if (process.env.ORCHESTRATOR_ENABLE_DOCKER_RUNNER === "1") runners.push("docker");
      if (process.env.ORCHESTRATOR_ENABLE_GVISOR_RUNNER === "1") runners.push("gvisor");
      respondJson(200, {
        runners,
        defaults: {
          mode: "plan", // 안전 기본값 — 실행 아님
          thinking: "auto",
          toolPermission: "read_only",
          runner: (process.env.ORCHESTRATOR_SANDBOX_RUNNER ?? "local").trim().toLowerCase() || "local",
        },
      });
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

    if (pathname === "/cockpit/snapshot" && request.method === "GET") {
      const storageSnapshot = redactInternalPathsForPublicHealth(await createPersistentEventStorageSnapshot(eventStorage));
      respondJson(200, await createServerOperatorCockpitSnapshot({ eventStorage: storageSnapshot }));
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
      await ensureDiscoveredModelAllowance(payload);
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
      await ensureDiscoveredModelAllowance(payload);
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

      if (payload.executionMode === "mock" && !isMockAgentDelegationEnabled()) {
        respondJson(403, {
          error: "mock_delegation_disabled",
          message: "mock agent delegation execution requires ENABLE_MOCK_AGENT_DELEGATION=true",
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

    if (
      await handleLearningGatePreviewRoute({
        request,
        pathname,
        method: request.method,
        searchParams: requestUrl.searchParams,
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

    if (
      await handleGithubRoute({
        pathname,
        method: request.method,
        // 토큰은 서버 env에만 — 클라이언트로 전달되지 않는다. read/write 토큰 단일(W1).
        createClient: () => createGithubReadonlyClient({ token: process.env.GITHUB_TOKEN }),
        respondJson,
        request,
        readJsonBody,
        planStore: githubCommentWritePlanStoreInstance,
        branchPlanStore: githubBranchCreatePlanStoreInstance,
        fileChangePlanStore: githubFileChangePlanStoreInstance,
        prPlanStore: githubPullRequestCreatePlanStoreInstance,
        prUpdatePlanStore: githubPullRequestUpdatePlanStoreInstance,
        prLabelsUpdatePlanStore: githubPullRequestLabelsUpdatePlanStoreInstance,
        writeRepoAllowlist: parseRepoAllowlist(process.env.GITHUB_WRITE_REPO_ALLOWLIST),
        prBaseAllowlist: parsePrBaseAllowlist(process.env.GITHUB_PR_BASE_ALLOWLIST),
        verifyApproval: async (approvalId) => {
          const { approvals } = await listApprovalsFromPersistentServerStorage(eventStorage, new Date().toISOString());
          return approvals.some((approval) => approval.id === approvalId && approval.state === "approved");
        },
      })
    ) {
      return;
    }

    if (
      await handleMissionRoute({
        store: missionStore,
        request,
        pathname,
        method: request.method,
        readJsonBody,
        isRequestBodyTooLargeError: (error): error is RequestBodyTooLargeError =>
          error instanceof RequestBodyTooLargeError,
        respondJson,
        // checkpoint/rollback — 실제 git(execFile shell:false) + repoRoot allowlist + 승인 게이트
        runCheckpoint: async (missionId, req) =>
          createMissionCheckpoint({
            id: `checkpoint_${missionId}_${Date.now()}`,
            missionId,
            workerId: req.workerId,
            repoRoot: req.repoRoot,
            gitRef: req.gitRef,
            reason: req.reason,
            allowedRepoRoots: parseAllowedRepoRoots(process.env.ORCHESTRATOR_ALLOWED_REPO_ROOTS),
            now: () => new Date().toISOString(),
            git: missionCheckpointGitExec,
          }),
        runRollback: async (missionId, req) => {
          const stamp = new Date().toISOString();
          // 자동 rollback 금지 — approvalId가 실제로 grant(approved)된 것이어야만 실행
          const { approvals } = await listApprovalsFromPersistentServerStorage(eventStorage, stamp);
          const granted = approvals.some((approval) => approval.id === req.approvalId && approval.state === "approved");
          if (!granted) {
            return {
              missionId,
              status: "blocked",
              reason: `approvalId '${req.approvalId}'가 승인되지 않았습니다 — rollback 거부`,
              observed: true,
              completedAt: stamp,
            };
          }
          return executeMissionRollback({
            missionId,
            repoRoot: req.repoRoot,
            targetSha: req.targetSha,
            approvalId: req.approvalId,
            allowedRepoRoots: parseAllowedRepoRoots(process.env.ORCHESTRATOR_ALLOWED_REPO_ROOTS),
            now: () => new Date().toISOString(),
            git: missionCheckpointGitExec,
          });
        },
        // D4: preview 포트 실제 바인딩 probe(TCP connect). 연결되면 observed running,
        // 아니면 정직하게 미바인딩(가짜 running 금지). dev 서버 spawn은 하지 않는다(관측만).
        probePreview: async ({ host, port }) =>
          new Promise<boolean>((resolvePromise) => {
            const socket = netConnect({ host, port });
            const finish = (ok: boolean) => {
              socket.destroy();
              resolvePromise(ok);
            };
            socket.setTimeout(2_000);
            socket.once("connect", () => finish(true));
            socket.once("timeout", () => finish(false));
            socket.once("error", () => finish(false));
          }),
        // D5a: preview dev 프로세스 start(repoRoot allowlist + preview 명령 정책 뒤) →
        // 포트 HTTP probe 성공 시에만 observed running. 아니면 failed/configured(가짜 금지).
        startPreview: async ({ workspaceId, command, cwd, host, port }) =>
          startPreviewProcess({
            workspaceId,
            command,
            cwd,
            host,
            port,
            allowedRepoRoots: parseAllowedRepoRoots(process.env.ORCHESTRATOR_ALLOWED_REPO_ROOTS),
            allowedPreviewPrefixes: parseAllowedRepoRoots(process.env.ORCHESTRATOR_ALLOWED_PREVIEW_COMMANDS),
            registry: previewProcessRegistry,
            spawn: realPreviewSpawn,
            probe: realPreviewHttpProbe,
            wait: realPreviewWait,
            now: () => new Date().toISOString(),
            readyTimeoutMs: Number(process.env.ORCHESTRATOR_PREVIEW_READY_TIMEOUT_MS ?? 15_000),
            pollIntervalMs: 300,
          }),
        stopPreview: async ({ workspaceId }) => stopPreviewProcess(workspaceId, previewProcessRegistry),
        // D5b: observed preview HTML을 가져와 분석한다. 브라우저(Playwright) probe는 아직
        // 미연결이라 브라우저 의존 검사는 skipped로 남는다(가짜 visual pass 금지).
        runVisualQa: async ({ missionId, workspaceId, previewUrl }) => {
          const http = await fetchPreviewHtml(previewUrl);
          // browser-tier(Playwright)는 env 플래그일 때만 시도. 미설치/실행실패면 undefined →
          // 브라우저 검사 skipped(가짜 observed pass 금지).
          let browser;
          if (process.env.ORCHESTRATOR_VISUAL_QA_BROWSER === "1") {
            const screenshotDir = join(
              process.env.ORCHESTRATOR_VISUAL_QA_SCREENSHOT_DIR ?? join(eventStorage.storageDir, "visual-qa"),
              workspaceId,
            );
            browser = await runBrowserProbe({
              url: previewUrl,
              screenshotDir,
              launch: createPlaywrightProbeDriver(),
              mkdir: async (dir) => {
                await mkdir(dir, { recursive: true });
              },
            });
          }
          return analyzeVisualQa({
            id: `visualqa_${workspaceId}_${Date.now()}`,
            missionId,
            workspaceId,
            obs: { previewObserved: true, previewUrl, http, browser },
            now: () => new Date().toISOString(),
          });
        },
        // D7: 스캐폴드 plan(쓰기 없음). repoRoot allowlist 게이트는 runner가 한다.
        planScaffold: async ({ missionId, workspaceId, templateId, input, repoRoot }) =>
          planScaffoldRunner({
            id: `scaffold_${workspaceId}_${Date.now()}`,
            missionId,
            workspaceId,
            templateId,
            templateInput: input,
            repoRoot,
            allowedRepoRoots: parseAllowedRepoRoots(process.env.ORCHESTRATOR_ALLOWED_REPO_ROOTS),
            fileExists: async (absPath) => {
              try {
                await stat(absPath);
                return true;
              } catch {
                return false;
              }
            },
            now: () => new Date().toISOString(),
          }),
        // D7: 스캐폴드 apply — overwrite는 grant된 approvalId일 때만, 적용 전 checkpoint.
        applyScaffold: async ({ plan, approvalId }) => {
          let approvedOverwrite = false;
          if (approvalId) {
            const stamp = new Date().toISOString();
            const { approvals } = await listApprovalsFromPersistentServerStorage(eventStorage, stamp);
            approvedOverwrite = approvals.some((approval) => approval.id === approvalId && approval.state === "approved");
          }
          return applyScaffoldRunner({
            plan,
            allowedRepoRoots: parseAllowedRepoRoots(process.env.ORCHESTRATOR_ALLOWED_REPO_ROOTS),
            approvedOverwrite,
            writeFile: (absPath, content) => writeFile(absPath, content, "utf8"),
            mkdir: async (absDir) => {
              await mkdir(absDir, { recursive: true });
            },
            checkpoint: async () => {
              const cp = await createMissionCheckpoint({
                id: `checkpoint_${plan.missionId}_${Date.now()}`,
                missionId: plan.missionId,
                repoRoot: plan.repoRootRef,
                gitRef: "HEAD",
                reason: "before_write",
                allowedRepoRoots: parseAllowedRepoRoots(process.env.ORCHESTRATOR_ALLOWED_REPO_ROOTS),
                now: () => new Date().toISOString(),
                git: missionCheckpointGitExec,
              });
              return cp.ok ? cp.checkpoint.headSha : undefined;
            },
            now: () => new Date().toISOString(),
          });
        },
        // Preview Run vertical: scaffold/latest 안전 파일들을 임시 디렉터리로 풀어 Preview를 띄울 수 있게 한다.
        // 정직성:
        //   - missionId 정규화(허용 charset 외 모두 _) — 임의 missionId가 절대경로/디렉터리 traversal로
        //     번지지 않게.
        //   - 파일 path는 traversal/절대경로 검사를 한 번 더(scaffoldForTemplate가 안전한 path만 내지만
        //     IO 직전 1차 가드는 유지).
        resolvePreviewRepoRoot: ({ missionId }) => {
          const safe = (missionId ?? "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "unknown";
          return join(tmpdir(), "ai-orchestrator-preview", safe);
        },
        materializeScaffoldFiles: async ({ repoRoot, files }) => {
          await mkdir(repoRoot, { recursive: true });
          let written = 0;
          for (const file of files) {
            if (typeof file.path !== "string" || !file.path) continue;
            // 절대경로/traversal 차단.
            if (file.path.startsWith("/") || file.path.startsWith("\\")) continue;
            if (file.path.includes("..")) continue;
            const absPath = join(repoRoot, file.path);
            await mkdir(dirname(absPath), { recursive: true });
            await writeFile(absPath, file.content, "utf8");
            written += 1;
          }
          return { written };
        },
        // 3순위: "AI로 초안 채우기" — 단발 LLM(비스트리밍)으로 대화를 DesignBlueprintInput으로 보강.
        // 어떤 실패(호출 실패·빈응답·JSON 파싱 실패·스키마 무효)든 null → 라우터가 결정적 stub으로 폴백.
        // provider/model은 클라이언트가 지정(인프라 하드코딩 안 함). 4~16 LLM 자동 발사 아님 — 정확히 1콜.
        enrichBlueprintWithAi: async ({ messages, draft, targetSurface, sessionId, providerProfileId, modelId, baseline }) => {
          try {
            const transcript = messages
              .filter((message) => message.content.trim().length > 0)
              .slice(-12)
              .map((message) => `${message.role}: ${message.content.trim().slice(0, 1_500)}`)
              .join("\n");
            const prompt = [
              "너는 제품 디자이너다. 아래 대화를 바탕으로 앱 화면 설계 초안(JSON)을 만든다.",
              "반드시 아래 TypeScript 타입과 정확히 일치하는 JSON 객체 하나만 출력한다(코드펜스/설명 금지):",
              "{ title: string; userIntent: string; targetSurface: " +
                '"conversation"|"dashboard"|"mission_board"|"cockpit"|"theater"|"settings"|"new_app";' +
                " screens: { name: string; purpose: string; primaryAction: string; secondaryActions: string[]; dataNeeded: string[]; emptyState: string; errorState: string }[];" +
                ' designTokens: { density: "compact"|"balanced"|"spacious"; tone: "cyber_glass"|"clean_builder"|"anime_os"|"minimal"; motion: "none"|"subtle"|"expressive" };' +
                " acceptanceCriteria: string[] }",
              `targetSurface 기본값은 "${targetSurface ?? "new_app"}". 화면은 1~5개로 구체화하고, 각 화면의 빈/오류 상태와 주요 액션을 채운다.`,
              draft ? `사용자 현재 입력: ${draft.slice(0, 1_000)}` : "",
              `기준 초안(title/intent 시드): ${JSON.stringify({ title: baseline.title, userIntent: baseline.userIntent })}`,
              "대화:",
              transcript,
            ]
              .filter(Boolean)
              .join("\n");
            const completionRequest = providerCompletionRequestSchema.parse({
              id: `blueprint_draft_${sessionId}_${Date.now()}`,
              sessionId,
              providerProfileId,
              modelId,
              messages: [{ role: "user", content: prompt }],
              source: "agent",
              routePreference: "server_proxy",
              createdAt: new Date().toISOString(),
            });
            const completion = await createDgxProviderCompletionResponse(completionRequest);
            if (completion.status !== "succeeded" || !completion.content) return null;
            // 구조화 출력 헬퍼가 없으므로 content를 직접 파싱·검증한다(모델을 신뢰하지 않음).
            const jsonText = extractJsonObject(completion.content);
            if (!jsonText) return null;
            const parsed = designBlueprintInputSchema.safeParse(JSON.parse(jsonText));
            return parsed.success ? parsed.data : null;
          } catch {
            return null; // 어떤 예외든 stub 폴백(정직)
          }
        },
      })
    ) {
      return;
    }

    if (
      await handleRmasRoute({
        store: rmasRunStore,
        controller: rmasController,
        maxConcurrent: rmasMaxConcurrent,
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

      if (containsServerOwnedApprovalEvents(payload)) {
        respondJson(403, {
          error: "server_owned_event_type",
          message: "Approval events must be created through server approval routes.",
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

    // L1: 한 미션의 라이브 trace 스트림(SSE). 초기 스냅샷(현재 redacted trace) 후
    // mission.* 이벤트가 커밋될 때마다 증분 trace를 push한다. /trace(GET)와 같은
    // 소스(EventStorage 파생)를 쓴다. raw command/log/secret은 싣지 않는다.
    const traceStreamMatch = /^\/missions\/([^/]+)\/trace\/stream$/.exec(pathname);
    if (traceStreamMatch && request.method === "GET") {
      const missionId = decodeURIComponent(traceStreamMatch[1]!);
      const record = await missionStore.get(missionId);
      if (!record) {
        respondJson(404, { error: "mission_not_found", missionId });
        return;
      }
      const session = sseSessionRegistry.createSession({
        request,
        response,
        headers: corsHeaders,
        heartbeatPayload: () => ({ type: "heartbeat", missionId, at: new Date().toISOString() }),
      });
      session.start();
      // 초기 스냅샷 — 재연결/늦은 구독자도 현재 상태를 곧바로 본다.
      session.writeEvent("mission.trace.snapshot", deriveMissionTrace(record));
      missionTraceBus.subscribe(missionId, session);
      // 세션 종료 시 구독 해제(메모리/유령 구독 방지).
      request.once("close", () => missionTraceBus.unsubscribe(missionId, session));
      request.once("aborted", () => missionTraceBus.unsubscribe(missionId, session));
      return;
    }

    // RMAS live trace stream (SSE) — mirror of the mission trace stream. Initial
    // snapshot (current redacted trace, replayed from events → reattach works for
    // a run started hours ago) followed by an incremental trace event per commit.
    // Same source as GET /rmas/runs/:id (EventStorage-derived); no raw content on
    // the wire. Sits behind the same top-level requireAuth() gate as /missions.
    const rmasTraceStreamMatch = /^\/rmas\/runs\/([^/]+)\/trace\/stream$/.exec(pathname);
    if (rmasTraceStreamMatch && request.method === "GET") {
      const runId = decodeURIComponent(rmasTraceStreamMatch[1]!);
      const record = await rmasRunStore.get(runId);
      if (!record) {
        respondJson(404, { error: "rmas_run_not_found", runId });
        return;
      }
      const session = sseSessionRegistry.createSession({
        request,
        response,
        headers: corsHeaders,
        heartbeatPayload: () => ({ type: "heartbeat", runId, at: new Date().toISOString() }),
      });
      session.start();
      session.writeEvent("rmas.trace.snapshot", deriveRmasTrace(record));
      rmasTraceBus.subscribe(runId, session);
      request.once("close", () => rmasTraceBus.unsubscribe(runId, session));
      request.once("aborted", () => rmasTraceBus.unsubscribe(runId, session));
      return;
    }

    respondJson(404, { error: "not_found" });
  });

  server.on("close", () => {
    nonceRegistry.dispose();
    disposeAllPreviews(previewProcessRegistry); // 유령 preview dev 서버 정리
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
  // append 전에 회전 체크 — 활성 파일이 임계에 닿으면 세그먼트로 옮기고 새로 시작.
  // 큐(enqueueStorageTask)로 직렬화돼 있어 동시 회전 경쟁이 없다.
  await rotateEventLogIfNeeded(eventLogPath, Date.now());
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
  // 부팅 스모크: `node dist/index.js --verify-boot` 는 listen 없이 즉시 종료한다.
  // 여기까지 도달했다는 건 모든 ESM import(상대 .js 확장자 포함)가 해석됐다는
  // 뜻 — build 스크립트가 이걸 호출해, 확장자 누락 같은 "타입체크는 통과하고
  // 런타임에만 죽는" 회귀를 서버 부팅 루프가 아니라 빌드 시점에 잡는다.
  if (process.argv.includes("--verify-boot")) {
    console.log("AI Orchestrator runtime server boot check OK");
  } else {
    const server = startServer();
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : "unknown";
    console.log(`AI Orchestrator runtime server listening on ${port}`);
  }
}
