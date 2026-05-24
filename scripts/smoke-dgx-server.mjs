const baseUrl = process.env.DGX_SERVER_BASE_URL ?? "http://dgx-02:4317";
const smokeSessionId = process.env.SMOKE_SESSION_ID ?? "session_smoke";
const smokeEventId = process.env.SMOKE_EVENT_ID ?? `event_smoke_${Date.now()}`;

const completionRequest = {
  id: `provider_completion_smoke_${Date.now()}`,
  sessionId: smokeSessionId,
  providerProfileId: "provider_dgx02_vllm",
  modelId: "qwen36-gio-wiki-rag-prisma",
  messages: [{ role: "user", content: "Reply OK only" }],
  source: "desktop",
  routePreference: "server_proxy",
  createdAt: new Date().toISOString(),
};

const eventSyncRequest = {
  id: `event_sync_smoke_${Date.now()}`,
  clientId: "client_macbook",
  sessionId: smokeSessionId,
  idempotencyKey: `client_macbook:${smokeSessionId}:${smokeEventId}`,
  createdAt: new Date().toISOString(),
  events: [
    {
      id: smokeEventId,
      sessionId: smokeSessionId,
      type: "smoke.event",
      payload: { redaction: "applied" },
      createdAt: new Date().toISOString(),
      source: "desktop",
      sourceTrust: "trusted",
      redacted: true,
    },
  ],
};

const health = await readJson(`${baseUrl}/health`);
const storageBefore = await readJson(`${baseUrl}/event-storage`);
const completion = await readJson(`${baseUrl}/provider-completions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(completionRequest),
});
const eventSync = await readJson(`${baseUrl}/events/sync`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(eventSyncRequest),
});
const storageAfter = await readJson(`${baseUrl}/event-storage`);
const sessions = await readJson(`${baseUrl}/sessions`);
const pulledEvents = await readJson(`${baseUrl}/events?sessionId=${encodeURIComponent(smokeSessionId)}`);

console.log(
  JSON.stringify(
    {
      baseUrl,
      health: {
        status: health.status,
        dgxStatus: health.runtime?.dgxStatus,
        capabilities: health.capabilities,
        recentError: health.runtime?.recentError,
        eventStorage: health.eventStorage,
      },
      completion: {
        status: completion.status,
        route: completion.route,
        content: completion.content,
        usage: completion.usage,
        error: completion.error,
      },
      eventSync: {
        accepted: eventSync.accepted,
        duplicates: eventSync.duplicates,
        conflicts: eventSync.conflicts,
        failed: eventSync.failed,
        serverRevision: eventSync.serverRevision,
      },
      storage: {
        beforeRevision: storageBefore.revision,
        afterRevision: storageAfter.revision,
        eventCount: storageAfter.eventCount,
        sessionCount: storageAfter.sessionCount,
        eventLogPath: storageAfter.eventLogPath,
        sessionIndexCount: sessions.sessions?.length ?? 0,
        sessionIndexHasSmokeSession: Boolean(sessions.sessions?.some((session) => session.sessionId === smokeSessionId)),
        pulledCount: pulledEvents.events?.length ?? 0,
        pulledHasSmokeEvent: Boolean(pulledEvents.events?.some((event) => event.id === smokeEventId)),
      },
    },
    null,
    2,
  ),
);

async function readJson(url, init) {
  const response = await fetch(url, init);
  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${rawText.slice(0, 400)}`);
  }

  return JSON.parse(rawText);
}
