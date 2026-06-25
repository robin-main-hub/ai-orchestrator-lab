import { describe, expect, it, vi } from "vitest";
import { proxyMimo, MIMO_UPSTREAM, type ProxyConfig, type ProxyEnv } from "./mimoProxy";

const bearerConfig: ProxyConfig = {
  prefix: "/mimo-token-openai",
  upstreamBase: "/v1",
  authStyle: "bearer",
};

const xApiKeyConfig: ProxyConfig = {
  prefix: "/mimo-token-anthropic",
  upstreamBase: "/anthropic",
  authStyle: "x-api-key",
};

const envWithKey: ProxyEnv = { MIMO_TP_API_KEY: "tp-test-secret-key" };

function makeRequest(path: string, method = "POST", body?: string): Request {
  return new Request(`https://app.example.com${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ?? (method !== "GET" && method !== "HEAD" ? "{}" : undefined),
  });
}

type FetchArgs = [url: string, init: RequestInit];

function captureCalls(fn: ReturnType<typeof vi.fn>): FetchArgs[] {
  return fn.mock.calls as unknown[] as FetchArgs[];
}

function firstCall(fn: ReturnType<typeof vi.fn>): FetchArgs {
  return captureCalls(fn)[0]!;
}

function mockFetch(opts?: {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
}) {
  const status = opts?.status ?? 200;
  const headers = new Headers(opts?.headers ?? { "content-type": "application/json" });
  const body = opts?.body ?? '{"ok":true}';
  return vi.fn(async () => new Response(body, { status, headers }));
}

describe("proxyMimo", () => {
  it("returns 502 when MIMO_TP_API_KEY is missing", async () => {
    const fetchFn = mockFetch();
    const res = await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), {}, bearerConfig, fetchFn);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("MIMO_TP_API_KEY not configured");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns 502 when MIMO_TP_API_KEY is whitespace-only", async () => {
    const fetchFn = mockFetch();
    const res = await proxyMimo(
      makeRequest("/mimo-token-openai/chat/completions"),
      { MIMO_TP_API_KEY: "   " },
      bearerConfig,
      fetchFn,
    );
    expect(res.status).toBe(502);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("injects Authorization: Bearer for openai route", async () => {
    const fetchFn = mockFetch();
    await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), envWithKey, bearerConfig, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = firstCall(fetchFn);
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${envWithKey.MIMO_TP_API_KEY}`);
    expect(headers.has("x-api-key")).toBe(false);
  });

  it("injects x-api-key for anthropic route", async () => {
    const fetchFn = mockFetch();
    await proxyMimo(makeRequest("/mimo-token-anthropic/v1/messages"), envWithKey, xApiKeyConfig, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [, init] = firstCall(fetchFn);
    const headers = new Headers(init.headers);
    expect(headers.get("x-api-key")).toBe(envWithKey.MIMO_TP_API_KEY);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("strips client-sent auth headers before injecting", async () => {
    const fetchFn = mockFetch();
    const request = new Request("https://app.example.com/mimo-token-openai/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer client-leaked-key",
        "x-api-key": "client-leaked-key",
      },
      body: "{}",
    });
    await proxyMimo(request, envWithKey, bearerConfig, fetchFn);
    const [, init] = firstCall(fetchFn);
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${envWithKey.MIMO_TP_API_KEY}`);
    expect(headers.get("x-api-key")).toBe(null);
  });

  it("targets exactly token-plan-sgp.xiaomimimo.com", async () => {
    const fetchFn = mockFetch();
    await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), envWithKey, bearerConfig, fetchFn);
    const [url] = firstCall(fetchFn);
    expect(url).toBe(`${MIMO_UPSTREAM}/v1/chat/completions`);
  });

  it("maps anthropic route to /anthropic base", async () => {
    const fetchFn = mockFetch();
    await proxyMimo(makeRequest("/mimo-token-anthropic/v1/messages"), envWithKey, xApiKeyConfig, fetchFn);
    const [url] = firstCall(fetchFn);
    expect(url).toBe(`${MIMO_UPSTREAM}/anthropic/v1/messages`);
  });

  it("preserves query string in upstream URL", async () => {
    const fetchFn = mockFetch();
    await proxyMimo(makeRequest("/mimo-token-openai/models?limit=5"), envWithKey, bearerConfig, fetchFn);
    const [url] = firstCall(fetchFn);
    expect(url).toContain("?limit=5");
  });

  it("passes method and body to upstream", async () => {
    const fetchFn = mockFetch();
    const body = JSON.stringify({ model: "mimo-7b", messages: [] });
    await proxyMimo(makeRequest("/mimo-token-openai/chat/completions", "POST", body), envWithKey, bearerConfig, fetchFn);
    const [, init] = firstCall(fetchFn);
    expect(init.method).toBe("POST");
  });

  it("does not include the token in the client response", async () => {
    const fetchFn = mockFetch({
      headers: { "content-type": "application/json", Authorization: "Bearer tp-leaked-in-response" },
    });
    const res = await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), envWithKey, bearerConfig, fetchFn);
    expect(res.headers.get("Authorization")).toBe(null);
    expect(res.headers.get("x-api-key")).toBe(null);
  });

  it("returns 502 when upstream fetch throws", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const res = await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), envWithKey, bearerConfig, fetchFn);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("Upstream fetch failed");
    expect(json.detail).toBe("ECONNRESET");
  });

  it("returns 502 when upstream returns status 0", async () => {
    const fetchFn = vi.fn(async () => ({ status: 0, body: null, headers: new Headers(), statusText: "" }) as unknown as Response);
    const res = await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), envWithKey, bearerConfig, fetchFn);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("Upstream returned malformed response");
  });

  it("passes upstream error status through without masking as success", async () => {
    const fetchFn = mockFetch({ status: 500, body: '{"error":"upstream failed"}' });
    const res = await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), envWithKey, bearerConfig, fetchFn);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("upstream failed");
  });

  it("passes upstream 401 through without masking as success", async () => {
    const fetchFn = mockFetch({ status: 401, body: '{"error":"unauthorized"}' });
    const res = await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), envWithKey, bearerConfig, fetchFn);
    expect(res.status).toBe(401);
  });

  it("does not make real network calls", async () => {
    const fetchFn = mockFetch();
    await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), envWithKey, bearerConfig, fetchFn);
    expect(fetchFn.mock.calls).toHaveLength(1);
    const [url] = firstCall(fetchFn);
    expect(url).toMatch(/^https:\/\/token-plan-sgp\.xiaomimimo\.com\//);
  });
});
