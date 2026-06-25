import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  proxyMimo,
  getMimoProxyReadiness,
  resolveMimoCredential,
  MIMO_CREDENTIAL_ENV,
  MIMO_UPSTREAM,
  type ProxyConfig,
  type ProxyEnv,
} from "./mimoProxy";

const proxySource = readFileSync(fileURLToPath(new URL("./mimoProxy.ts", import.meta.url)), "utf8");

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

const TEST_KEY = "tp-test-secret-key-DO-NOT-LEAK";
const envWithKey: ProxyEnv = { [MIMO_CREDENTIAL_ENV]: TEST_KEY };

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

async function responseBodyText(res: Response): Promise<string> {
  const cloned = res.clone();
  return cloned.text();
}

describe("resolveMimoCredential", () => {
  it("returns ok:true with credential when env is present", () => {
    const result = resolveMimoCredential({ [MIMO_CREDENTIAL_ENV]: "tp-real-key" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credential).toBe("tp-real-key");
      expect(result.credentialSource).toBe("env");
      expect(result.envVar).toBe(MIMO_CREDENTIAL_ENV);
      expect(result.upstream).toBe(MIMO_UPSTREAM);
    }
  });

  it("returns ok:false with mimo_env_missing code when env is missing", () => {
    const result = resolveMimoCredential({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("mimo_env_missing");
      expect(result.missing).toEqual([MIMO_CREDENTIAL_ENV]);
      expect(result.upstream).toBe(MIMO_UPSTREAM);
    }
  });

  it("returns ok:false when env is whitespace-only", () => {
    const result = resolveMimoCredential({ [MIMO_CREDENTIAL_ENV]: "  \t " });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("mimo_env_missing");
    }
  });

  it("trims the credential value", () => {
    const result = resolveMimoCredential({ [MIMO_CREDENTIAL_ENV]: "  tp-real-key  " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credential).toBe("tp-real-key");
    }
  });

  it("MIMO_API_KEY alone does not configure the proxy", () => {
    const result = resolveMimoCredential({ MIMO_API_KEY: "sk-other-key" } as unknown as ProxyEnv);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual([MIMO_CREDENTIAL_ENV]);
    }
  });

  it("VITE_MIMO_API_KEY alone does not configure the proxy", () => {
    const result = resolveMimoCredential({ VITE_MIMO_API_KEY: "vite-key" } as unknown as ProxyEnv);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual([MIMO_CREDENTIAL_ENV]);
    }
  });

  it("credential is only in the ok:true branch, not in ok:false", () => {
    const missingResult = resolveMimoCredential({});
    expect("credential" in missingResult).toBe(false);

    const okResult = resolveMimoCredential({ [MIMO_CREDENTIAL_ENV]: "key" });
    expect("credential" in okResult).toBe(true);
  });
});

describe("proxyMimo", () => {
  it("returns 502 with mimo_env_missing code when credential is missing", async () => {
    const fetchFn = mockFetch();
    const res = await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), {}, bearerConfig, fetchFn);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe(`${MIMO_CREDENTIAL_ENV} not configured`);
    expect(json.code).toBe("mimo_env_missing");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns 502 with mimo_env_missing code when credential is whitespace-only", async () => {
    const fetchFn = mockFetch();
    const res = await proxyMimo(
      makeRequest("/mimo-token-openai/chat/completions"),
      { [MIMO_CREDENTIAL_ENV]: "   " },
      bearerConfig,
      fetchFn,
    );
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.code).toBe("mimo_env_missing");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("injects Authorization: Bearer for openai route", async () => {
    const fetchFn = mockFetch();
    await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), envWithKey, bearerConfig, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = firstCall(fetchFn);
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${TEST_KEY}`);
    expect(headers.has("x-api-key")).toBe(false);
  });

  it("injects x-api-key for anthropic route", async () => {
    const fetchFn = mockFetch();
    await proxyMimo(makeRequest("/mimo-token-anthropic/v1/messages"), envWithKey, xApiKeyConfig, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [, init] = firstCall(fetchFn);
    const headers = new Headers(init.headers);
    expect(headers.get("x-api-key")).toBe(TEST_KEY);
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
    expect(headers.get("Authorization")).toBe(`Bearer ${TEST_KEY}`);
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

  it("does not include the token in the client response headers", async () => {
    const fetchFn = mockFetch({
      headers: { "content-type": "application/json", Authorization: "Bearer tp-leaked-in-response" },
    });
    const res = await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), envWithKey, bearerConfig, fetchFn);
    expect(res.headers.get("Authorization")).toBe(null);
    expect(res.headers.get("x-api-key")).toBe(null);
  });

  it("does not add the token to a response body that does not contain it", async () => {
    const fetchFn = mockFetch({
      body: '{"data":"ok","status":"healthy"}',
    });
    const res = await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), envWithKey, bearerConfig, fetchFn);
    const body = await responseBodyText(res);
    expect(body).not.toContain(TEST_KEY);
  });

  it("redacts the token from error detail if upstream error message contains it", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error(`connection refused for ${TEST_KEY}`);
    });
    const res = await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), envWithKey, bearerConfig, fetchFn);
    const body = await responseBodyText(res);
    expect(body).not.toContain(TEST_KEY);
    expect(body).toContain("[REDACTED]");
  });

  it("returns 502 with mimo_upstream_fetch_failed code when upstream fetch throws", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const res = await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), envWithKey, bearerConfig, fetchFn);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("Upstream fetch failed");
    expect(json.code).toBe("mimo_upstream_fetch_failed");
    expect(json.detail).toBe("ECONNRESET");
  });

  it("returns 502 with mimo_upstream_malformed code when upstream returns status 0", async () => {
    const fetchFn = vi.fn(async () => ({ status: 0, body: null, headers: new Headers(), statusText: "" }) as unknown as Response);
    const res = await proxyMimo(makeRequest("/mimo-token-openai/chat/completions"), envWithKey, bearerConfig, fetchFn);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.code).toBe("mimo_upstream_malformed");
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

describe("getMimoProxyReadiness", () => {
  it("returns configured=true when credential is present", () => {
    const result = getMimoProxyReadiness({ [MIMO_CREDENTIAL_ENV]: "tp-real-key" });
    expect(result.configured).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("returns configured=false when credential is missing", () => {
    const result = getMimoProxyReadiness({});
    expect(result.configured).toBe(false);
    expect(result.missing).toEqual([MIMO_CREDENTIAL_ENV]);
  });

  it("returns configured=false when credential is whitespace-only", () => {
    const result = getMimoProxyReadiness({ [MIMO_CREDENTIAL_ENV]: "  \t " });
    expect(result.configured).toBe(false);
    expect(result.missing).toEqual([MIMO_CREDENTIAL_ENV]);
  });

  it("returns upstream as token-plan-sgp.xiaomimimo.com", () => {
    const result = getMimoProxyReadiness({});
    expect(result.upstream).toBe(MIMO_UPSTREAM);
    expect(result.upstream).toBe("https://token-plan-sgp.xiaomimimo.com");
  });

  it("returns credentialSource and envVar metadata", () => {
    const result = getMimoProxyReadiness({ [MIMO_CREDENTIAL_ENV]: "tp-key" });
    expect(result.credentialSource).toBe("env");
    expect(result.envVar).toBe(MIMO_CREDENTIAL_ENV);
  });

  it("never exposes the token value in any field", () => {
    const result = getMimoProxyReadiness({ [MIMO_CREDENTIAL_ENV]: "tp-super-secret-value" });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("tp-super-secret-value");
  });

  it("output contains only boolean/config metadata, no raw secret", () => {
    const result = getMimoProxyReadiness({ [MIMO_CREDENTIAL_ENV]: "tp-secret" });
    const keys = Object.keys(result);
    expect(keys).toContain("configured");
    expect(keys).toContain("upstream");
    expect(keys).toContain("missing");
    expect(keys).toContain("credentialSource");
    expect(keys).toContain("envVar");
    expect(keys).not.toContain("credential");
    expect(keys).not.toContain("key");
    expect(keys).not.toContain("token");
    expect(keys).not.toContain("apiKey");
    expect(keys).not.toContain("secret");
    expect(keys).not.toContain(MIMO_CREDENTIAL_ENV);
  });
});

describe("Mimo proxy source-level contract", () => {
  it("does not read VITE_MIMO_* env vars", () => {
    expect(proxySource).not.toContain("VITE_MIMO");
    expect(proxySource).not.toContain("VITE_");
  });

  it("does not reference api.xiaomimimo.com", () => {
    expect(proxySource).not.toContain("api.xiaomimimo.com");
  });

  it("does not reference MIMO_API_KEY (without TP)", () => {
    expect(proxySource).not.toContain('"MIMO_API_KEY"');
    expect(proxySource).not.toContain("'MIMO_API_KEY'");
  });

  it("exports MIMO_CREDENTIAL_ENV constant", () => {
    expect(proxySource).toContain("MIMO_CREDENTIAL_ENV");
    expect(proxySource).toContain('"MIMO_TP_API_KEY"');
  });

  it("exports MIMO_UPSTREAM constant", () => {
    expect(proxySource).toContain("MIMO_UPSTREAM");
    expect(proxySource).toContain("https://token-plan-sgp.xiaomimimo.com");
  });

  it("exports resolveMimoCredential", () => {
    expect(proxySource).toContain("export function resolveMimoCredential");
  });

  it("exports getMimoProxyReadiness", () => {
    expect(proxySource).toContain("export function getMimoProxyReadiness");
  });

  it("exports machine-readable error codes", () => {
    expect(proxySource).toContain("mimo_env_missing");
    expect(proxySource).toContain("mimo_upstream_fetch_failed");
    expect(proxySource).toContain("mimo_upstream_malformed");
  });

  it("proxyMimo uses resolveMimoCredential instead of reading env directly", () => {
    const proxyFnMatch = proxySource.match(/export async function proxyMimo[\s\S]*?^}/m);
    expect(proxyFnMatch).toBeDefined();
    expect(proxyFnMatch![0]).toContain("resolveMimoCredential");
    expect(proxyFnMatch![0]).not.toContain("env.MIMO_TP_API_KEY");
    expect(proxyFnMatch![0]).not.toContain("env[MIMO_CREDENTIAL_ENV]");
  });

  it("getMimoProxyReadiness uses resolveMimoCredential", () => {
    const readinessFnMatch = proxySource.match(/export function getMimoProxyReadiness[\s\S]*?^}/m);
    expect(readinessFnMatch).toBeDefined();
    expect(readinessFnMatch![0]).toContain("resolveMimoCredential");
    expect(readinessFnMatch![0]).not.toContain("env.MIMO_TP_API_KEY");
  });
});
