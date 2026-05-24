import { readFile } from "node:fs/promises";

await loadDotEnvIfPresent();

const baseUrlCandidates = process.env.DGX_SERVER_BASE_URL
  ? [process.env.DGX_SERVER_BASE_URL]
  : ["http://dgx-02:4317", "http://127.0.0.1:4317", "https://orchestrator.endruin.com"];
const apiToken = (process.env.ORCHESTRATOR_API_TOKEN ?? "dev-orchestrator-token").trim();
const authHeader = { authorization: `Bearer ${apiToken}` };
const baseUrl = await selectReachableBaseUrl(baseUrlCandidates);
const smokeSessionId = process.env.SMOKE_SESSION_ID ?? "session_smoke";
const smokeEventId = process.env.SMOKE_EVENT_ID ?? `event_smoke_${Date.now()}`;
const smokeProviderProfileId = process.env.SMOKE_PROVIDER_PROFILE_ID ?? "provider_codex_oauth";
const smokeModelId = process.env.SMOKE_MODEL_ID ?? "codex-session";
const smokePrompt =
  process.env.SMOKE_PROMPT ?? `Reply with exactly this Korean word and nothing else: ${"\uc815\uc0c1"}`;

const completionRequest = {
  id: `provider_completion_smoke_${Date.now()}`,
  sessionId: smokeSessionId,
  providerProfileId: smokeProviderProfileId,
  modelId: smokeModelId,
  messages: [{ role: "user", content: smokePrompt }],
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
        providerProfileId: completion.providerProfileId,
        modelId: completion.modelId,
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

async function loadDotEnvIfPresent() {
  const envUrl = new URL("../.env", import.meta.url);
  let text = "";
  try {
    text = await readFile(envUrl, "utf8");
  } catch {
    return;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const [rawKey, ...rawValueParts] = line.split("=");
    const key = rawKey.trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    const rawValue = rawValueParts.join("=").trim();
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

async function readJson(url, init) {
  const mergedHeaders = { ...authHeader, ...(init?.headers ?? {}) };
  const response = await fetch(url, { ...init, headers: mergedHeaders });
  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${rawText.slice(0, 400)}`);
  }

  return JSON.parse(rawText);
}

async function selectReachableBaseUrl(candidates) {
  const errors = [];
  for (const candidate of candidates) {
    const normalized = candidate.replace(/\/$/, "");
    try {
      await readJson(`${normalized}/health`);
      return normalized;
    } catch (error) {
      errors.push(`${normalized}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`No DGX server base URL reachable. ${errors.join(" | ")}`);
}
