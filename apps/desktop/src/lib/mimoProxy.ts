/**
 * Mimo token-plan proxy core logic.
 *
 * Server-side auth injection: reads MIMO_TP_API_KEY from env and injects it
 * into the upstream request. The client never receives the real key.
 *
 * Credential source is centralized via MIMO_CREDENTIAL_ENV and
 * resolveMimoCredential(). Future migration to a different credential
 * source should change the resolver, not route logic.
 *
 * Route map (matches vite dev proxy rewrite):
 *   /mimo-token-openai/*    → https://token-plan-sgp.xiaomimimo.com/v1/*
 *   /mimo-token-anthropic/* → https://token-plan-sgp.xiaomimimo.com/anthropic/*
 */

import { MIMO_CREDENTIAL_ENV, MIMO_UPSTREAM } from "./mimoProxyConfig";

export { MIMO_CREDENTIAL_ENV, MIMO_UPSTREAM };

export type AuthStyle = "bearer" | "x-api-key";

export type ProxyConfig = {
  prefix: string;
  upstreamBase: string;
  authStyle: AuthStyle;
};

export type ProxyEnv = {
  [MIMO_CREDENTIAL_ENV]?: string;
};

type FetchFn = typeof fetch;

export type MimoProxyErrorCode =
  | "mimo_env_missing"
  | "mimo_upstream_fetch_failed"
  | "mimo_upstream_malformed";

export type MimoProxyReadiness = {
  configured: boolean;
  upstream: string;
  missing: string[];
  credentialSource: "env";
  envVar: typeof MIMO_CREDENTIAL_ENV;
};

export type MimoCredentialResolution =
  | {
      ok: true;
      credentialSource: "env";
      envVar: typeof MIMO_CREDENTIAL_ENV;
      upstream: typeof MIMO_UPSTREAM;
      credential: string;
    }
  | {
      ok: false;
      code: "mimo_env_missing";
      missing: [typeof MIMO_CREDENTIAL_ENV];
      upstream: typeof MIMO_UPSTREAM;
    };

export function resolveMimoCredential(env: ProxyEnv): MimoCredentialResolution {
  const raw = env[MIMO_CREDENTIAL_ENV]?.trim();
  if (!raw) {
    return {
      ok: false,
      code: "mimo_env_missing",
      missing: [MIMO_CREDENTIAL_ENV],
      upstream: MIMO_UPSTREAM,
    };
  }
  return {
    ok: true,
    credentialSource: "env",
    envVar: MIMO_CREDENTIAL_ENV,
    upstream: MIMO_UPSTREAM,
    credential: raw,
  };
}

export function getMimoProxyReadiness(env: ProxyEnv): MimoProxyReadiness {
  const resolution = resolveMimoCredential(env);
  return {
    configured: resolution.ok,
    upstream: resolution.upstream,
    missing: resolution.ok ? [] : [...resolution.missing],
    credentialSource: "env",
    envVar: MIMO_CREDENTIAL_ENV,
  };
}

function jsonError(status: number, code: MimoProxyErrorCode, message: string, detail?: string): Response {
  return new Response(JSON.stringify({ error: message, code, detail: detail ?? null }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sanitizeDetail(detail: string, secret: string): string {
  if (!secret) return detail;
  return detail.split(secret).join("[REDACTED]");
}

export async function proxyMimo(
  request: Request,
  env: ProxyEnv,
  config: ProxyConfig,
  fetchFn: FetchFn = fetch,
): Promise<Response> {
  const resolution = resolveMimoCredential(env);
  if (!resolution.ok) {
    return jsonError(502, "mimo_env_missing", `${MIMO_CREDENTIAL_ENV} not configured`);
  }

  const apiKey = resolution.credential;

  const url = new URL(request.url);
  const rest = url.pathname.slice(config.prefix.length);
  const target = `${resolution.upstream}${config.upstreamBase}${rest}${url.search}`;

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
    const rawDetail = err instanceof Error ? err.message : String(err);
    return jsonError(502, "mimo_upstream_fetch_failed", "Upstream fetch failed", sanitizeDetail(rawDetail, apiKey));
  }

  if (!upstreamResponse || upstreamResponse.status === 0) {
    return jsonError(502, "mimo_upstream_malformed", "Upstream returned malformed response");
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
