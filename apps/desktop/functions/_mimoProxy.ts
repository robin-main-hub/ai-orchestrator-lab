/**
 * Cloudflare Pages Function — mimo token-plan proxy.
 *
 * Reproduces the vite dev-server proxy (apps/desktop/vite.config.ts → server.proxy)
 * in the deployed static environment. Without this, the SPA's `/mimo-token-*`
 * requests fall through to the SPA index.html and fail (unauthorized / no response).
 *
 * Route map (matches vite rewrite):
 *   /mimo-token-openai/*    → https://token-plan-sgp.xiaomimimo.com/v1/*
 *   /mimo-token-anthropic/* → https://token-plan-sgp.xiaomimimo.com/anthropic/*
 *
 * The client adapter attaches its own auth header (Authorization: Bearer / x-api-key);
 * this proxy forwards method, headers, and body unchanged to the upstream. It performs
 * no auth itself and stores nothing.
 */

const UPSTREAM = "https://token-plan-sgp.xiaomimimo.com";

type ProxyConfig = { prefix: string; upstreamBase: string };

export async function proxyMimo(request: Request, config: ProxyConfig): Promise<Response> {
  const url = new URL(request.url);
  // strip the route prefix, map to the upstream base segment, preserve the rest + query.
  const rest = url.pathname.slice(config.prefix.length); // includes leading "/" or ""
  const target = `${UPSTREAM}${config.upstreamBase}${rest}${url.search}`;

  // Forward headers as-is except Host (let fetch set it for the upstream).
  const headers = new Headers(request.headers);
  headers.delete("host");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstreamResponse = await fetch(target, init);

  // Pass the upstream response straight back (status, headers, body).
  const respHeaders = new Headers(upstreamResponse.headers);
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: respHeaders,
  });
}
