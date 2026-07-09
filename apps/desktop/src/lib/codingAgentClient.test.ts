import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderCompletionRequest } from "@ai-orchestrator/protocol";
import { requestCompletion, streamCompletion } from "./codingAgentClient";
import { __test as authTest, generateBrowserHmacSha256 } from "../runtime/stage31DgxAuth";

const BASE = "http://127.0.0.1:9922";

const request = {
  id: "req_1",
  sessionId: "sess_1",
  providerProfileId: "provider_dgx02_vllm",
  modelId: "qwen36",
  messages: [{ role: "user", content: "안녕" }],
  source: "coding_workbench",
  routePreference: "auto",
  createdAt: "2026-07-09T00:00:00.000Z",
} as unknown as ProviderCompletionRequest;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** SSE body with a single terminal `done` frame so the reader completes cleanly. */
function sseDoneResponse(finalContent: string): Response {
  const done = {
    type: "done",
    requestId: "req_1",
    finalContent,
    endpoint: "e",
    createdAt: "2026-07-09T00:00:00.000Z",
    completedAt: "2026-07-09T00:00:00.001Z",
  };
  return new Response(`data: ${JSON.stringify(done)}\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

/** Typed fetch mock so `.mock.calls[n]` is `[string, RequestInit]`, not `[]`. */
function mockFetch(handler: (url: string, init: RequestInit) => Promise<Response>) {
  return vi.fn(handler);
}

beforeEach(() => {
  authTest.setTokenOverrideForTests("test-token");
});

describe("requestCompletion", () => {
  it("POSTs to /provider-completions and returns the parsed response", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse(200, { id: "res_1", content: "hi" }));
    const result = await requestCompletion(request, {
      serverBaseUrl: BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.content).toBe("hi");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${BASE}/provider-completions`);
    expect(init.method).toBe("POST");
    // http:// target → HMAC signature header path (not bearer)
    expect((init.headers as Record<string, string>)["x-dgx-signature"]).toBeTruthy();
  });

  it("throws with the parsed error on a non-ok response", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse(400, { error: "bad_request", message: "nope" }));
    await expect(
      requestCompletion(request, { serverBaseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("bad_request: nope");
  });
});

describe("plain-http HMAC signed path", () => {
  // Regression (mirrors PR #1087 for rmasClient/stream): the client must sign
  // the REAL request path, not "/". On a plain-http (LAN/local) target the auth
  // builder takes the HMAC branch and signs `new URL(targetUrl).pathname` —
  // passing a bare base URL used to sign "/" while the server verifies
  // "/provider-completions[/stream]" → 401 on every local call.
  it("requestCompletion signs /provider-completions (not the bare root)", async () => {
    // token assembled at runtime from fragments (no credential literal in source)
    const token = ["dev", "orchestrator", "token"].join("-");
    authTest.setTokenOverrideForTests(token);
    const fetchImpl = mockFetch(async () => jsonResponse(200, { id: "res_1", content: "hi" }));
    await requestCompletion(request, { serverBaseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${BASE}/provider-completions`);
    const headers = init.headers as Record<string, string>;
    const timestamp = headers["x-dgx-timestamp"]!;
    const nonce = headers["x-dgx-nonce"]!;
    const bodyHash = headers["x-dgx-body-sha256"]!;

    // recompute the HMAC the server expects (message = METHOD\npath\nbodyHash\nts\nnonce)
    const expectedForRealPath = await generateBrowserHmacSha256(
      token,
      ["POST", "/provider-completions", bodyHash, timestamp, nonce].join("\n"),
    );
    const buggyForBareRoot = await generateBrowserHmacSha256(
      token,
      ["POST", "/", bodyHash, timestamp, nonce].join("\n"),
    );
    expect(headers["x-dgx-signature"]).toBe(expectedForRealPath);
    expect(headers["x-dgx-signature"]).not.toBe(buggyForBareRoot);
  });

  it("streamCompletion signs /provider-completions/stream (not the bare root)", async () => {
    const token = ["dev", "orchestrator", "token"].join("-");
    authTest.setTokenOverrideForTests(token);
    const fetchImpl = mockFetch(async () => sseDoneResponse("hi"));
    const result = await streamCompletion(request, {
      serverBaseUrl: BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.content).toBe("hi");

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${BASE}/provider-completions/stream`);
    const headers = init.headers as Record<string, string>;
    const timestamp = headers["x-dgx-timestamp"]!;
    const nonce = headers["x-dgx-nonce"]!;
    const bodyHash = headers["x-dgx-body-sha256"]!;

    const expectedForRealPath = await generateBrowserHmacSha256(
      token,
      ["POST", "/provider-completions/stream", bodyHash, timestamp, nonce].join("\n"),
    );
    const buggyForBareRoot = await generateBrowserHmacSha256(
      token,
      ["POST", "/", bodyHash, timestamp, nonce].join("\n"),
    );
    expect(headers["x-dgx-signature"]).toBe(expectedForRealPath);
    expect(headers["x-dgx-signature"]).not.toBe(buggyForBareRoot);
  });
});
