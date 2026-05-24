import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  createServerProviderRegistrySnapshot,
  createServerProviderModelDiscoveryResponse,
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
  it("returns DGX-02 authority with client cache runtime status", () => {
    const health = createHealthResponse();

    expect(health.status).toBe("ok");
    expect(health.runtime.status).toBe("degraded");
    expect(health.runtime.syncTopology.authorityNodeId).toBe("dgx-02");
    expect(health.runtime.syncTopology.conflictPolicy).toBe("dgx02_authority_wins");
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

  it("discovers DeepSeek models through the DGX-02 provider model proxy", async () => {
    const previousKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "deepseek-test-secret";

    try {
      const discovery = await createServerProviderModelDiscoveryResponse("provider_deepseek_dgx", {
        now: "2026-05-24T00:00:00.000Z",
        fetchImpl: async (url, init) => {
          expect(url).toBe("https://api.deepseek.com/v1/models");
          expect(init?.headers?.authorization).toBe("Bearer deepseek-test-secret");
          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify({ data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }] });
            },
          };
        },
      });

      expect(discovery.status).toBe("succeeded");
      expect(discovery.source).toBe("remote_probe");
      expect(discovery.models.map((model) => model.id)).toEqual(["deepseek-chat", "deepseek-reasoner"]);
      expect(JSON.stringify(discovery)).not.toContain("deepseek-test-secret");
    } finally {
      if (previousKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = previousKey;
      }
    }
  });

  it("publishes a DGX-02 provider registry without raw secrets", async () => {
    const previousDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const previousAnthropicKeyAlt = process.env.ANTHROPIC_API_KEY_ALT;
    const previousApifunKey = process.env.APIFUN_API_KEY;
    const previousApifunKeyFile = process.env.APIFUN_API_KEY_FILE;
    process.env.DEEPSEEK_API_KEY = "deepseek-test-secret";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY_ALT;
    delete process.env.APIFUN_API_KEY;
    process.env.APIFUN_API_KEY_FILE = "/tmp/ai-orchestrator-missing-apifun.key";

    try {
      const registry = await createServerProviderRegistrySnapshot({
        now: "2026-05-24T00:00:00.000Z",
      });

      const deepseek = registry.entries.find((entry) => entry.providerProfileId === "provider_deepseek_dgx");
      const apifun = registry.entries.find((entry) => entry.providerProfileId === "provider_apifun_claude");
      const grok = registry.entries.find((entry) => entry.providerProfileId === "provider_grok_oauth_dgx");

      expect(registry.authorityNodeId).toBe("dgx-02");
      expect(registry.rawSecretPersisted).toBe(false);
      expect(registry.summary.total).toBeGreaterThanOrEqual(7);
      expect(deepseek?.authMode).toBe("dgx_secret_ref");
      expect(deepseek?.secretAvailability).toBe("available");
      expect(apifun?.name).toBe("APIKey.fun Claude A");
      expect(apifun?.secretAvailability).toBe("missing");
      expect(apifun?.secretSourceRefs).toContain("env:ANTHROPIC_API_KEY");
      expect(grok?.authMode).toBe("oauth_session");
      expect(JSON.stringify(registry)).not.toContain("deepseek-test-secret");
    } finally {
      if (previousDeepSeekKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = previousDeepSeekKey;
      }
      if (previousAnthropicKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
      }
      if (previousAnthropicKeyAlt === undefined) {
        delete process.env.ANTHROPIC_API_KEY_ALT;
      } else {
        process.env.ANTHROPIC_API_KEY_ALT = previousAnthropicKeyAlt;
      }
      if (previousApifunKey === undefined) {
        delete process.env.APIFUN_API_KEY;
      } else {
        process.env.APIFUN_API_KEY = previousApifunKey;
      }
      if (previousApifunKeyFile === undefined) {
        delete process.env.APIFUN_API_KEY_FILE;
      } else {
        process.env.APIFUN_API_KEY_FILE = previousApifunKeyFile;
      }
    }
  });

  it("loads provider keys from the OpenClaw slot env file without exposing raw values", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "ai-orchestrator-env-"));
    const envFile = join(tempRoot, "openclaw-slot.env");
    const previousSlotEnv = process.env.OPENCLAW_SLOT_ENV_FILE;
    const previousDeepSeekKey = process.env.DEEPSEEK_API_KEY;

    delete process.env.DEEPSEEK_API_KEY;
    process.env.OPENCLAW_SLOT_ENV_FILE = envFile;

    try {
      await writeFile(
        envFile,
        [
          'DEEPSEEK_API_KEY="deepseek-env-file-secret"',
          'ANTHROPIC_API_KEY="apikeyfun-claude-a-secret"',
          'ANTHROPIC_API_KEY_ALT="apikeyfun-claude-b-secret"',
          "",
        ].join("\n"),
        "utf8",
      );

      const registry = await createServerProviderRegistrySnapshot({
        now: "2026-05-24T00:00:00.000Z",
      });
      const deepseek = registry.entries.find((entry) => entry.providerProfileId === "provider_deepseek_dgx");
      const claudeA = registry.entries.find((entry) => entry.providerProfileId === "provider_apifun_claude");
      const claudeB = registry.entries.find((entry) => entry.providerProfileId === "provider_apifun_claude_b");

      expect(deepseek?.secretAvailability).toBe("available");
      expect(claudeA?.name).toBe("APIKey.fun Claude A");
      expect(claudeA?.selectedModelId).toBe("claude-opus-4-6");
      expect(claudeA?.secretAvailability).toBe("available");
      expect(claudeA?.secretRefPreview).toBe("dgx-02:ANTHROPIC_API_KEY");
      expect(claudeB?.name).toBe("APIKey.fun Claude B");
      expect(claudeB?.secretAvailability).toBe("available");
      expect(claudeB?.secretRefPreview).toBe("dgx-02:ANTHROPIC_API_KEY_ALT");
      expect(JSON.stringify(registry)).not.toContain("deepseek-env-file-secret");
      expect(JSON.stringify(registry)).not.toContain("apikeyfun-claude-a-secret");
      expect(JSON.stringify(registry)).not.toContain("apikeyfun-claude-b-secret");
    } finally {
      if (previousSlotEnv === undefined) {
        delete process.env.OPENCLAW_SLOT_ENV_FILE;
      } else {
        process.env.OPENCLAW_SLOT_ENV_FILE = previousSlotEnv;
      }
      if (previousDeepSeekKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = previousDeepSeekKey;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("separates Grok OAuth accounts and reports expired sessions without token output", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "ai-orchestrator-grok-"));
    const grok1 = join(tempRoot, "grok1-auth.json");
    const grok2 = join(tempRoot, "grok2-auth.json");
    const previousGrok1 = process.env.GROK_OAUTH_1_AUTH_FILE;
    const previousGrok2 = process.env.GROK_OAUTH_2_AUTH_FILE;

    process.env.GROK_OAUTH_1_AUTH_FILE = grok1;
    process.env.GROK_OAUTH_2_AUTH_FILE = grok2;

    try {
      await writeFile(
        grok1,
        JSON.stringify({
          "https://auth.x.ai::demo": {
            email: "choiminwoong@gmail.com",
            team_id: "team-1",
            refresh_token: "grok-refresh-token-1",
            expires_at: "2026-05-25T00:00:00.000Z",
          },
        }),
        "utf8",
      );
      await writeFile(
        grok2,
        JSON.stringify({
          "https://auth.x.ai::demo": {
            email: "choiminwoongj@gmail.com",
            team_id: "team-2",
            refresh_token: "grok-refresh-token-2",
            expires_at: "2026-05-16T00:00:00.000Z",
          },
        }),
        "utf8",
      );

      const registry = await createServerProviderRegistrySnapshot({
        now: "2026-05-24T00:00:00.000Z",
      });
      const grokAccount1 = registry.entries.find((entry) => entry.providerProfileId === "provider_grok_oauth_dgx");
      const grokAccount2 = registry.entries.find((entry) => entry.providerProfileId === "provider_grok_oauth_dgx_2");

      expect(grokAccount1?.name).toContain("choiminwoong@gmail.com");
      expect(grokAccount1?.secretAvailability).toBe("available");
      expect(grokAccount1?.secretSourceRefs).toContain("account:choiminwoong@gmail.com");
      expect(grokAccount2?.name).toContain("choiminwoongj@gmail.com");
      expect(grokAccount2?.secretAvailability).toBe("expired");
      expect(grokAccount2?.tags).toContain("oauth-expired");
      expect(grokAccount2?.secretSourceRefs).toContain("account:choiminwoongj@gmail.com");
      expect(JSON.stringify(registry)).not.toContain("grok-refresh-token");
    } finally {
      if (previousGrok1 === undefined) {
        delete process.env.GROK_OAUTH_1_AUTH_FILE;
      } else {
        process.env.GROK_OAUTH_1_AUTH_FILE = previousGrok1;
      }
      if (previousGrok2 === undefined) {
        delete process.env.GROK_OAUTH_2_AUTH_FILE;
      } else {
        process.env.GROK_OAUTH_2_AUTH_FILE = previousGrok2;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("uses static APIFun model allowlist without calling remote /models", async () => {
    const discovery = await createServerProviderModelDiscoveryResponse("provider_apifun_claude", {
      now: "2026-05-24T00:00:00.000Z",
      fetchImpl: async () => {
        throw new Error("should not call APIFun /models");
      },
    });

    expect(discovery.status).toBe("succeeded");
    expect(discovery.models.map((model) => model.id)).toContain("claude-code-compatible");
    expect(discovery.warnings.join(" ")).toContain("static model allowlist");
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
