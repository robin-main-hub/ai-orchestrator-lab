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
  RemoteExecutionRequest,
  RemoteExecutionResponse,
  RuntimeSnapshot,
} from "@ai-orchestrator/protocol";
import { eventSyncPushRequestSchema } from "@ai-orchestrator/protocol";

export type ServerCapability =
  | "health"
  | "model-registry"
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
const DEFAULT_DGX_MODEL_ID = "qwen36-gio-wiki-rag-prisma";

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
      eventStoreMode: "server_authoritative_with_local_outbox",
      offlineWritePolicy: "append_local_outbox",
      conflictPolicy: "server_revision_lww_with_conflict_events",
      clients: [
        {
          id: "dgx-02",
          label: "DGX-02",
          kind: "server",
          status: vllmReachable ? "online" : "degraded",
          syncRole: "authority",
          localStore: "sqlite",
          outboxMode: "authority",
          failurePolicy: "authority_recovery",
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
      throw new Error(`vLLM /models failed: ${response.status} ${rawText.slice(0, 240)}`);
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

type DgxCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export type DgxProviderCompletionOptions = {
  now?: string;
  vllmBaseUrl?: string;
  fetchImpl?: FetchLike;
};

export async function createDgxProviderCompletionResponse(
  request: ProviderCompletionRequest,
  options: DgxProviderCompletionOptions = {},
): Promise<ProviderCompletionResponse> {
  const createdAt = options.now ?? new Date().toISOString();
  const vllmBaseUrl = options.vllmBaseUrl ?? process.env.DGX02_VLLM_BASE_URL ?? DEFAULT_DGX02_VLLM_BASE_URL;
  const endpoint = `${vllmBaseUrl.replace(/\/$/, "")}/chat/completions`;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (request.providerProfileId !== "provider_dgx02_vllm") {
    return {
      id: `provider_completion_response_${crypto.randomUUID()}`,
      requestId: request.id,
      providerProfileId: request.providerProfileId,
      modelId: request.modelId,
      route: "server_proxy",
      status: "failed",
      error: "server proxy only accepts provider_dgx02_vllm in this stage",
      createdAt,
    };
  }

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createServerDgxVllmRequestBody(request.modelId, request.messages)),
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
        error: `DGX-02 vLLM request failed: ${response.status} ${rawText.slice(0, 240)}`,
        createdAt,
      };
    }

    const parsed = JSON.parse(rawText) as DgxCompletionResponse;
    const content = parsed.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return {
        id: `provider_completion_response_${crypto.randomUUID()}`,
        requestId: request.id,
        providerProfileId: request.providerProfileId,
        modelId: request.modelId,
        route: "server_proxy",
        status: "failed",
        endpoint,
        error: "DGX-02 vLLM returned an empty response",
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
      usage: {
        inputTokens: parsed.usage?.prompt_tokens,
        outputTokens: parsed.usage?.completion_tokens,
        totalTokens: parsed.usage?.total_tokens,
      },
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

function createServerDgxVllmRequestBody(modelId: string, messages: ProviderCompletionMessage[]) {
  return {
    model: modelId,
    messages: [
      {
        role: "system",
        content: "Answer directly in Korean when the user writes Korean. Do not reveal reasoning or a thinking process.",
      },
      ...messages.slice(-8).map((message) => ({
        role: message.role === "assistant" || message.role === "system" || message.role === "tool" ? message.role : "user",
        content: message.content,
      })),
    ],
    max_tokens: 512,
    temperature: 0.2,
    chat_template_kwargs: {
      enable_thinking: false,
    },
  };
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

      return {
        sessionId,
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
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const pathname = requestUrl.pathname;

    if (request.method === "OPTIONS") {
      response.writeHead(204, createCorsHeaders());
      response.end();
      return;
    }

    if (pathname === "/health") {
      writeJson(response, 200, {
        ...(await createLiveHealthResponse()),
        eventStorage: await createPersistentEventStorageSnapshot(eventStorage),
      } satisfies ServerHealthResponse);
      return;
    }

    if (pathname === "/runtime") {
      writeJson(response, 200, await createLiveRuntimeSnapshot());
      return;
    }

    if (pathname === "/heartbeat") {
      const runtime = await createLiveRuntimeSnapshot();
      writeJson(response, 200, createDgxHeartbeat(runtime));
      return;
    }

    if (pathname === "/models") {
      writeJson(response, 200, await createLiveDgxModelDiscovery());
      return;
    }

    if (pathname === "/provider-completions" && request.method === "POST") {
      const payload = (await readJsonBody(request)) as ProviderCompletionRequest;
      const completion = await createDgxProviderCompletionResponse(payload);
      writeJson(response, completion.status === "succeeded" ? 200 : 502, completion);
      return;
    }

    if (pathname === "/remote-runs" && request.method === "POST") {
      const payload = (await readJsonBody(request)) as RemoteExecutionRequest;
      writeJson(response, 202, createRemoteRunResponse(payload));
      return;
    }

    if (pathname === "/events/sync" && request.method === "POST") {
      let payload: EventSyncPushRequest;
      try {
        payload = eventSyncPushRequestSchema.parse(await readJsonBody(request)) as EventSyncPushRequest;
      } catch (error) {
        writeJson(response, 400, {
          error: "invalid_event_sync_payload",
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      try {
        writeJson(response, 202, await pushEventsToPersistentServerStorage(payload, eventStorage));
      } catch (error) {
        writeJson(response, 500, {
          error: "event_storage_write_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (pathname === "/events" && request.method === "GET") {
      const sessionId = requestUrl.searchParams.get("sessionId") ?? "session_desktop_001";
      const afterRevision = Number(requestUrl.searchParams.get("afterRevision") ?? 0);
      writeJson(response, 200, await pullEventsFromPersistentServerStorage(sessionId, eventStorage, undefined, afterRevision));
      return;
    }

    if (pathname === "/sessions" && request.method === "GET") {
      writeJson(response, 200, await listPersistentEventStorageSessions(eventStorage));
      return;
    }

    if (pathname === "/event-storage" && request.method === "GET") {
      writeJson(response, 200, await createPersistentEventStorageSnapshot(eventStorage));
      return;
    }

    if (pathname === "/events/stream") {
      response.writeHead(200, {
        "cache-control": "no-cache",
        "content-type": "text/event-stream; charset=utf-8",
        ...createCorsHeaders(),
      });
      response.end(`event: heartbeat\ndata: ${JSON.stringify(createDgxHeartbeat())}\n\n`);
      return;
    }

    writeJson(response, 404, { error: "not_found" });
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

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function createCorsHeaders() {
  return {
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT",
    "access-control-allow-origin": "*",
    "access-control-max-age": "600",
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

function getDefaultEventStorageDir() {
  return process.env.EVENT_STORAGE_DIR ?? join(process.cwd(), "data", "events");
}

function containsSecretLikeText(value: unknown): boolean {
  const text = fingerprintEvent(value);
  return /\bsk-[A-Za-z0-9_-]{8,}\b/.test(text) ||
    /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/i.test(text) ||
    /\b(?:API_KEY|AUTH_TOKEN|SECRET|TOKEN)\s*=\s*[^"'\s]+/i.test(text);
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
