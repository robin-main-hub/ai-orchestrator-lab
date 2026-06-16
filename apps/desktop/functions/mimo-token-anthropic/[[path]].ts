// Cloudflare Pages Function: catch-all under /mimo-token-anthropic/*
// Maps to upstream /anthropic/* (matches the vite dev proxy rewrite).
// Bundled by the Cloudflare Pages build (not by our tsc; functions/ is outside
// apps/desktop/tsconfig include), so it needs no @cloudflare/workers-types.
import { proxyMimo } from "../_mimoProxy";

export const onRequest = (context: { request: Request }): Promise<Response> =>
  proxyMimo(context.request, { prefix: "/mimo-token-anthropic", upstreamBase: "/anthropic" });
