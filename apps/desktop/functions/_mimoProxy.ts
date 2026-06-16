/**
 * Cloudflare Pages Function — mimo proxy.
 *
 * Reproduces the vite dev-server proxy (apps/desktop/vite.config.ts → server.proxy)
 * in the deployed static environment. Without this, the SPA`s `/mimo-token-*`
 * requests fall through to the SPA index.html and fail.
 *
 * Route map:
 *   /mimo-token-openai/*    → ${UPSTREAM}/v1/*        (Authorization: Bearer <key>)
 *   /mimo-token-anthropic/* → ${UPSTREAM}/anthropic/* (x-api-key: <key>)
 *
 * Auth is injected SERVER-SIDE from the `MIMO_API_KEY` environment secret, so the
 * real key never reaches the browser, the JS bundle, or git. The owner sets
 * `MIMO_API_KEY` (and optionally `MIMO_UPSTREAM`) in the Cloudflare Pages project
 * environment; it is never committed. Whatever auth header the client sends is a
 * non-secret readiness sentinel and gets overwritten here.
 */

const DEFAULT_UPSTREAM = "https://api.xiaomimimo.com";

type AuthStyle = "bearer" | "x-api-key";
type ProxyConfig = { prefix: string; upstreamBase: string; authStyle: AuthStyle };
type ProxyEnv = { MIMO_API_KEY?: string; MIMO_UPSTREAM?: string };

export async function proxyMimo(request: Request, env: ProxyEnv, config: ProxyConfig): Promise<Response> {
  const upstream = (env.MIMO_UPSTREAM ?? DEFAULT_UPSTREAM).replace(/\/+$/, "");
  const url = new URL(request.url);
  // strip the route prefix, map to the upstream base segment, preserve the rest + query.
  const rest = url.pathname.slice(config.prefix.length); // includes leading "/" or ""
  const target = `${upstream}${config.upstreamBase}${rest}${url.search}`;

  // Forward headers as-is except Host (let fetch set it for the upstream).
  const headers = new Headers(request.headers);
  headers.delete("host");

  // Inject auth server-side from the env secret. Never forward a client key to
  // the real upstream — the client only sends a non-secret readiness sentinel.
  const key = env.MIMO_API_KEY?.trim();
  if (key) {
    if (config.authStyle === "bearer") {
      headers.set("authorization", `Bearer ${key}`);
    } else {
      headers.set("x-api-key", key);
      headers.delete("authorization");
    }
  }

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
