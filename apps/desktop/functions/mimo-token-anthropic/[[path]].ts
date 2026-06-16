// Cloudflare Pages Function: catch-all under /mimo-token-anthropic/*
// Maps to upstream /anthropic/* with server-side x-api-key auth (MIMO_API_KEY env secret).
// Bundled by the Cloudflare Pages build (not by our tsc; functions/ is outside
// apps/desktop/tsconfig include), so it needs no @cloudflare/workers-types.
import { proxyMimo } from "../_mimoProxy";

type Ctx = { request: Request; env: { MIMO_API_KEY?: string; MIMO_UPSTREAM?: string } };

export const onRequest = (context: Ctx): Promise<Response> =>
  proxyMimo(context.request, context.env, {
    prefix: "/mimo-token-anthropic",
    upstreamBase: "/anthropic",
    authStyle: "x-api-key",
  });
