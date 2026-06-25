/**
 * Mimo token-plan proxy core logic.
 *
 * Server-side auth injection: reads MIMO_TP_API_KEY from env and injects it
 * into the upstream request. The client never receives the real key.
 *
 * Route map (matches vite dev proxy rewrite):
 *   /mimo-token-openai/*    → https://token-plan-sgp.xiaomimimo.com/v1/*
 *   /mimo-token-anthropic/* → https://token-plan-sgp.xiaomimimo.com/anthropic/*
 */

export const MIMO_UPSTREAM = "https://token-plan-sgp.xiaomimimo.com";

export type AuthStyle = "bearer" | "x-api-key";

export type ProxyConfig = {
  prefix: string;
  upstreamBase: string;
  authStyle: AuthStyle;
};

export type ProxyEnv = {
  MIMO_TP_API_KEY?: string;
};

type FetchFn = typeof fetch;

function jsonError(status: number, message: string, detail?: string): Response {
  return new Response(JSON.stringify({ error: message, detail: detail ?? null }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function proxyMimo(
  request: Request,
  env: ProxyEnv,
  config: ProxyConfig,
  fetchFn: FetchFn = fetch,
): Promise<Response> {
  const apiKey = env.MIMO_TP_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(502, "MIMO_TP_API_KEY not configured");
  }

  const url = new URL(request.url);
  const rest = url.pathname.slice(config.prefix.length);
  const target = `${MIMO_UPSTREAM}${config.upstreamBase}${rest}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("authorization");
  headers.delete("x-api-key");

  if (config.authStyle === "bearer") {
    headers.set("Authorization", `Bearer ${apiKey}`);
  } else {
    headers.set("x-api-key", apiKey);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchFn(target, init);
  } catch (err) {
    return jsonError(502, "Upstream fetch failed", err instanceof Error ? err.message : String(err));
  }

  if (!upstreamResponse || upstreamResponse.status === 0) {
    return jsonError(502, "Upstream returned malformed response");
  }

  const respHeaders = new Headers(upstreamResponse.headers);
  respHeaders.delete("authorization");
  respHeaders.delete("x-api-key");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: respHeaders,
  });
}
