import { proxyMimo } from "../_mimoProxy";

export const onRequest = (context: { request: Request; env?: Record<string, string | undefined> }): Promise<Response> =>
  proxyMimo(context.request, context.env ?? {}, { prefix: "/mimo-token-anthropic", upstreamBase: "/anthropic", authStyle: "x-api-key" });
