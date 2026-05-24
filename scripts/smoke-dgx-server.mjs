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

const health = await readJson(`${baseUrl}/health`);
const completion = await readJson(`${baseUrl}/provider-completions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(completionRequest),
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
