import { proxyMimo } from "../_mimoProxy";

export const onRequest = (context: { request: Request; env?: Record<string, string | undefined> }): Promise<Response> =>
  proxyMimo(context.request, context.env ?? {}, { prefix: "/mimo-token-openai", upstreamBase: "/v1", authStyle: "bearer" });
