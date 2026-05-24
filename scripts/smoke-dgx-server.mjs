const baseUrl = process.env.DGX_SERVER_BASE_URL ?? "http://dgx-02:4317";

const completionRequest = {
  id: `provider_completion_smoke_${Date.now()}`,
  sessionId: "session_smoke",
  providerProfileId: "provider_dgx02_vllm",
  modelId: "qwen36-gio-wiki-rag-prisma",
  messages: [{ role: "user", content: "Reply OK only" }],
  source: "desktop",
  routePreference: "server_proxy",
  createdAt: new Date().toISOString(),
};

const eventSyncRequest = {
  id: `event_sync_smoke_${Date.now()}`,
  clientId: "macbook",
  sessionId: "session_smoke",
  idempotencyKey: `macbook:session_smoke:event_sync_smoke_${Date.now()}`,
  createdAt: new Date().toISOString(),
  events: [
    {
      id: `event_smoke_${Date.now()}`,
      sessionId: "session_smoke",
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

console.log(
  JSON.stringify(
    {
      baseUrl,
      health: {
        status: health.status,
        dgxStatus: health.runtime?.dgxStatus,
        capabilities: health.capabilities,
        recentError: health.runtime?.recentError,
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
