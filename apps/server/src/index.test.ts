import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createEventStorageSnapshot,
  createDgxProviderCompletionResponse,
  createDgxHeartbeat,
  createDgxModelDiscovery,
  createHealthResponse,
  createJsonlServerEventStorage,
  createLiveHealthResponse,
  createRemoteRunResponse,
  createRuntimeSnapshot,
  createServerEventStorageState,
  listEventStorageSessions,
  loadServerEventStorageStateFromJsonl,
  pullEventsFromServerStorage,
  probeDgxVllm,
  pullEventsFromPersistentServerStorage,
  pushEventsToPersistentServerStorage,
  pushEventsToServerStorage,
} from "./index";

describe("server health placeholder", () => {
  it("returns MacBook authority with DGX-02 projection runtime status", () => {
    const health = createHealthResponse();

    expect(health.status).toBe("ok");
    expect(health.runtime.status).toBe("degraded");
    expect(health.runtime.syncTopology.authorityNodeId).toBe("client_macbook");
    expect(health.runtime.syncTopology.conflictPolicy).toBe("macbook_authority_wins");
    expect(health.capabilities).toContain("remote-run-request");
    expect(health.capabilities).toContain("model-registry");
    expect(health.capabilities).toContain("vllm-health");
    expect(health.capabilities).toContain("event-storage-sync");
    expect(health.eventStorage.mode).toBe("memory");
    expect(health.eventStorage.revision).toBe(0);
  });

  it("publishes the DGX-02 vLLM model registry", () => {
    const discovery = createDgxModelDiscovery("2026-05-24T00:00:00.000Z");

    expect(discovery.providerProfileId).toBe("provider_dgx02_vllm");
    expect(discovery.source).toBe("remote_probe");
    expect(discovery.models[0]?.id).toBe("qwen36-gio-wiki-rag-prisma");
    expect(discovery.redactionApplied).toBe(true);
  });

  it("blocks remote runs until approval is granted", () => {
    const response = createRemoteRunResponse({
      id: "remote_request_1",
      runId: "run_1",
      kind: "workspace_run",
      targetNodeId: "dgx-02",
      commandPreview: "pnpm test",
      approvalState: "required",
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(response.status).toBe("blocked");
    expect(response.fallbackMode).toBe("local_cli");
  });

  it("queues approved runs when DGX is online", () => {
    const response = createRemoteRunResponse({
      id: "remote_request_2",
      runId: "run_2",
      kind: "workspace_run",
      targetNodeId: "dgx-02",
      commandPreview: "pnpm test",
      approvalState: "approved",
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(response.status).toBe("queued");
    expect(response.fallbackMode).toBe("none");
  });

  it("reports heartbeat state from runtime", () => {
    const heartbeat = createDgxHeartbeat(createRuntimeSnapshot("2026-05-24T00:00:00.000Z"));

    expect(heartbeat.nodeId).toBe("dgx-02");
    expect(heartbeat.status).toBe("connected");
  });

  it("proxies DGX-02 vLLM completions without receiving raw endpoints from desktop", async () => {
    const response = await createDgxProviderCompletionResponse(
      {
        id: "provider_completion_request_1",
        sessionId: "session_1",
        providerProfileId: "provider_dgx02_vllm",
        modelId: "qwen36-gio-wiki-rag-prisma",
        messages: [{ role: "user", content: "Reply OK only" }],
        source: "desktop",
        routePreference: "server_proxy",
        createdAt: "2026-05-24T00:00:00.000Z",
      },
      {
        now: "2026-05-24T00:00:00.000Z",
        vllmBaseUrl: "http://127.0.0.1:8001/v1",
        fetchImpl: async (url, init) => {
          expect(url).toBe("http://127.0.0.1:8001/v1/chat/completions");
          expect(String(init?.body)).not.toContain("sk-");
          expect(String(init?.body)).toContain("\"enable_thinking\":false");
          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify({
                choices: [{ message: { content: "OK" } }],
                usage: { prompt_tokens: 12, completion_tokens: 2, total_tokens: 14 },
              });
            },
          };
        },
      },
    );

    expect(response.status).toBe("succeeded");
    expect(response.route).toBe("server_proxy");
    expect(response.content).toBe("OK");
    expect(response.usage?.totalTokens).toBe(14);
  });

  it("routes APIFun Claude through DGX-02 secret refs without leaking the token into the request body", async () => {
    const previousKey = process.env.APIFUN_API_KEY;
    process.env.APIFUN_API_KEY = "apifun-test-secret";

    try {
      const response = await createDgxProviderCompletionResponse(
        {
          id: "provider_completion_request_apifun",
          sessionId: "session_1",
          providerProfileId: "provider_apifun_claude",
          modelId: "claude-code-compatible",
          messages: [{ role: "user", content: "테스트 응답" }],
          source: "desktop",
          routePreference: "server_proxy",
          createdAt: "2026-05-24T00:00:00.000Z",
        },
        {
          now: "2026-05-24T00:00:00.000Z",
          fetchImpl: async (url, init) => {
            expect(url).toBe("https://api.apikey.fun/v1/messages");
            expect(init?.headers?.authorization).toBe("Bearer apifun-test-secret");
            expect(String(init?.body)).not.toContain("apifun-test-secret");
            expect(String(init?.body)).toContain("\"model\":\"claude-code-compatible\"");
            return {
              ok: true,
              status: 200,
              async text() {
                return JSON.stringify({
                  content: [{ type: "text", text: "APIFun OK" }],
                  usage: { input_tokens: 10, output_tokens: 3 },
                });
              },
            };
          },
        },
      );

      expect(response.status).toBe("succeeded");
      expect(response.content).toBe("APIFun OK");
      expect(response.usage?.totalTokens).toBe(13);
    } finally {
      if (previousKey === undefined) {
        delete process.env.APIFUN_API_KEY;
      } else {
        process.env.APIFUN_API_KEY = previousKey;
      }
    }
  });

  it("probes vLLM /models before publishing live health", async () => {
    const fetchImpl = async (url: string) => {
      expect(url).toBe("http://127.0.0.1:8001/v1/models");
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ data: [{ id: "qwen36-gio-wiki-rag-prisma" }] });
        },
      };
    };

    const probe = await probeDgxVllm({
      now: "2026-05-24T00:00:00.000Z",
      vllmBaseUrl: "http://127.0.0.1:8001/v1",
      fetchImpl,
    });
    const health = await createLiveHealthResponse({
      now: "2026-05-24T00:00:00.000Z",
      vllmBaseUrl: "http://127.0.0.1:8001/v1",
      fetchImpl,
    });

    expect(probe.status).toBe("connected");
    expect(health.runtime.dgxStatus).toBe("online");
    expect(health.runtime.runtimeNodes[0]?.models).toContain("qwen36-gio-wiki-rag-prisma");
  });

  it("marks the server degraded when vLLM is not reachable", async () => {
    const health = await createLiveHealthResponse({
      now: "2026-05-24T00:00:00.000Z",
      vllmBaseUrl: "http://127.0.0.1:8001/v1",
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });

    expect(health.runtime.dgxStatus).toBe("degraded");
    expect(health.runtime.runtimeNodes[0]?.status).toBe("degraded");
    expect(health.runtime.recentError).toContain("vLLM probe failed");
  });

  it("accepts Event Storage sync pushes idempotently", () => {
    const state = createServerEventStorageState();
    const event = {
      id: "event_sync_1",
      sessionId: "session_1",
      type: "conversation.message.created",
      payload: { messageId: "message_1", redaction: "applied" },
      createdAt: "2026-05-24T00:00:00.000Z",
      source: "desktop" as const,
      sourceTrust: "trusted" as const,
      redacted: true,
    };
    const request = {
      id: "sync_request_1",
      clientId: "client_macbook",
      sessionId: "session_1",
      events: [event],
      idempotencyKey: "client_macbook:session_1:event_sync_1",
      createdAt: event.createdAt,
    };

    const first = pushEventsToServerStorage(request, state, event.createdAt);
    const duplicate = pushEventsToServerStorage({ ...request, id: "sync_request_2" }, state, event.createdAt);
    const conflict = pushEventsToServerStorage(
      {
        ...request,
        id: "sync_request_3",
        events: [{ ...event, type: "conversation.message.edited" }],
      },
      state,
      event.createdAt,
    );
    const pulled = pullEventsFromServerStorage("session_1", state, event.createdAt);

    expect(first.accepted).toBe(1);
    expect(duplicate.duplicates).toBe(1);
    expect(conflict.conflicts).toBe(1);
    expect(pulled.serverRevision).toBe(1);
    expect(pulled.events[0]?.id).toBe(event.id);
  });

  it("lists Event Storage sessions newest first", () => {
    const state = createServerEventStorageState();
    const firstEvent = {
      id: "event_session_first",
      sessionId: "session_old",
      type: "conversation.message.created",
      payload: { messageId: "message_old", content: "old", redaction: "applied" },
      createdAt: "2026-05-24T00:00:00.000Z",
      source: "desktop" as const,
      sourceTrust: "trusted" as const,
      redacted: true,
    };
    const secondEvent = {
      id: "event_session_second",
      sessionId: "session_new",
      type: "coding_packet.created",
      payload: { goal: "new packet" },
      createdAt: "2026-05-24T00:01:00.000Z",
      source: "agent" as const,
      sourceTrust: "trusted" as const,
      redacted: true,
    };
    const secondCreatedEvent = {
      id: "event_session_new_created",
      sessionId: "session_new",
      type: "session.created",
      payload: { title: "New Session", sourceClient: "client_home_pc" },
      createdAt: "2026-05-24T00:00:30.000Z",
      source: "desktop" as const,
      sourceTrust: "trusted" as const,
      redacted: true,
    };
    const secondRenamedEvent = {
      id: "event_session_new_renamed",
      sessionId: "session_new",
      type: "session.renamed",
      payload: { title: "Renamed Session" },
      createdAt: "2026-05-24T00:00:45.000Z",
      source: "desktop" as const,
      sourceTrust: "trusted" as const,
      redacted: true,
    };

    pushEventsToServerStorage(
      {
        id: "sync_sessions_1",
        clientId: "client_macbook",
        sessionId: firstEvent.sessionId,
        events: [firstEvent],
        idempotencyKey: "client_macbook:session_old:event_session_first",
        createdAt: firstEvent.createdAt,
      },
      state,
      firstEvent.createdAt,
    );
    pushEventsToServerStorage(
      {
        id: "sync_sessions_2",
        clientId: "client_home_pc",
        sessionId: secondEvent.sessionId,
        events: [secondCreatedEvent, secondRenamedEvent, secondEvent],
        idempotencyKey: "client_home_pc:session_new:event_session_new_created,event_session_new_renamed,event_session_second",
        createdAt: secondEvent.createdAt,
      },
      state,
      secondEvent.createdAt,
    );

    const index = listEventStorageSessions(state, "2026-05-24T00:02:00.000Z");

    expect(index.serverRevision).toBe(4);
    expect(index.sessions.map((session) => session.sessionId)).toEqual(["session_new", "session_old"]);
    expect(index.sessions[0]?.lastEventType).toBe("coding_packet.created");
    expect(index.sessions[0]?.title).toBe("Renamed Session");
    expect(index.sessions[0]?.createdByClient).toBe("client_home_pc");
    expect(index.sessions[0]?.sources).toEqual(["desktop", "agent"]);
  });

  it("persists Event Storage records to JSONL and reloads duplicate state", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "ai-orchestrator-events-"));
    try {
      const storage = createJsonlServerEventStorage(tempDir);
      const event = {
        id: "event_persist_1",
        sessionId: "session_persist",
        type: "conversation.message.created",
        payload: { messageId: "message_1", redaction: "applied" },
        createdAt: "2026-05-24T00:00:00.000Z",
        source: "desktop" as const,
        sourceTrust: "trusted" as const,
        redacted: true,
      };
      const request = {
        id: "sync_request_persist_1",
        clientId: "client_macbook",
        sessionId: event.sessionId,
        events: [event],
        idempotencyKey: "client_macbook:session_persist:event_persist_1",
        createdAt: event.createdAt,
      };

      const first = await pushEventsToPersistentServerStorage(request, storage, event.createdAt);
      const reloadedState = await loadServerEventStorageStateFromJsonl(storage.eventLogPath);
      const duplicate = pushEventsToServerStorage(
        { ...request, id: "sync_request_persist_2" },
        reloadedState,
        event.createdAt,
      );
      const pulled = await pullEventsFromPersistentServerStorage(
        "session_persist",
        {
          ...storage,
          statePromise: Promise.resolve(reloadedState),
        },
        event.createdAt,
      );
      const snapshot = createEventStorageSnapshot(reloadedState, {
        mode: "jsonl",
        storageDir: storage.storageDir,
        eventLogPath: storage.eventLogPath,
        loadedAt: storage.loadedAt,
      });

      expect(first.accepted).toBe(1);
      expect(duplicate.duplicates).toBe(1);
      expect(pulled.events[0]?.id).toBe(event.id);
      expect(snapshot.revision).toBe(1);
      expect(snapshot.eventCount).toBe(1);
      expect(snapshot.eventLogPath).toContain("events.jsonl");
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("rejects raw secret shaped Event Storage payloads", () => {
    const state = createServerEventStorageState();
    const response = pushEventsToServerStorage(
      {
        id: "sync_request_secret",
        clientId: "client_macbook",
        sessionId: "session_1",
        idempotencyKey: "client_macbook:session_1:event_secret",
        createdAt: "2026-05-24T00:00:00.000Z",
        events: [
          {
            id: "event_secret",
            sessionId: "session_1",
            type: "provider.profile.imported",
            payload: { raw: "sk-secret-should-not-sync" },
            createdAt: "2026-05-24T00:00:00.000Z",
            source: "desktop",
            sourceTrust: "trusted",
            redacted: false,
          },
        ],
      },
      state,
      "2026-05-24T00:00:00.000Z",
    );

    expect(response.failed).toBe(1);
    expect(response.results[0]?.reason).toBe("raw_secret_pattern_detected");
  });
});
