import { describe, expect, it } from "vitest";
import type {
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderCompletionUsage,
} from "@ai-orchestrator/protocol";
import type { LlmCompletionFn } from "../debateEngine.js";
import { RmasTokenMeter } from "./tokenMeter.js";

const MOCK_USAGE: ProviderCompletionUsage = { inputTokens: 12, outputTokens: 4, totalTokens: 16 };

function makeComplete(usage?: ProviderCompletionUsage): LlmCompletionFn {
  return async (request: ProviderCompletionRequest): Promise<ProviderCompletionResponse> => ({
    id: `resp_${request.id}`,
    requestId: request.id,
    providerProfileId: request.providerProfileId,
    modelId: request.modelId,
    route: request.routePreference,
    status: "succeeded",
    content: "ok",
    usage,
    createdAt: request.createdAt,
  });
}

let n = 0;
function makeRequest(): ProviderCompletionRequest {
  n += 1;
  return {
    id: `req_${n}`,
    sessionId: "rmas_run_1",
    providerProfileId: "provider_dgx02_vllm",
    modelId: "qwen",
    messages: [{ role: "user", content: "hi" }],
    source: "agent",
    routePreference: "server_proxy",
    createdAt: "2026-07-09T00:00:00.000Z",
  };
}

const ctx = { resolveSecret: async () => undefined };

describe("RmasTokenMeter", () => {
  it("accumulates fixed mock usage across sequential calls", async () => {
    const meter = new RmasTokenMeter(makeComplete(MOCK_USAGE));
    await meter.wrap(makeRequest(), ctx);
    await meter.wrap(makeRequest(), ctx);
    await meter.wrap(makeRequest(), ctx);
    expect(meter.snapshot()).toEqual({ input: 36, output: 12, total: 48 });
  });

  it("accumulates across a Promise.all fan-out batch", async () => {
    const meter = new RmasTokenMeter(makeComplete(MOCK_USAGE));
    await Promise.all([meter.wrap(makeRequest(), ctx), meter.wrap(makeRequest(), ctx), meter.wrap(makeRequest(), ctx)]);
    expect(meter.snapshot()).toEqual({ input: 36, output: 12, total: 48 });
  });

  it("falls back to input+output when totalTokens is absent", async () => {
    const meter = new RmasTokenMeter(makeComplete({ inputTokens: 10, outputTokens: 5 }));
    await meter.wrap(makeRequest(), ctx);
    expect(meter.snapshot()).toEqual({ input: 10, output: 5, total: 15 });
  });

  it("threads ctx through unchanged", async () => {
    let seen: unknown;
    const inner: LlmCompletionFn = async (request, receivedCtx) => {
      seen = receivedCtx;
      return {
        id: "r",
        requestId: request.id,
        providerProfileId: request.providerProfileId,
        modelId: request.modelId,
        route: request.routePreference,
        status: "succeeded",
        createdAt: request.createdAt,
      };
    };
    const meter = new RmasTokenMeter(inner);
    const passedCtx = { resolveSecret: async () => "secret", timeoutMs: 1234 };
    await meter.wrap(makeRequest(), passedCtx);
    expect(seen).toBe(passedCtx);
    expect(meter.snapshot()).toEqual({ input: 0, output: 0, total: 0 }); // no usage → no accrual
  });
});
