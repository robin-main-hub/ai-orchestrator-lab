import type { LlmCompletionFn } from "../debateEngine.js";

export type RmasTokenSnapshot = { input: number; output: number; total: number };

/**
 * Meters token usage at the completion-fn boundary so every RMAS pattern —
 * Sequential / Mixture / Distillation / Deliberation — is tallied uniformly,
 * independent of whether the underlying engine keeps `usage` (the debate engine
 * discards it). `wrap` threads the caller's ctx through unchanged and only
 * observes the response. Single-threaded JS makes the `+=` safe even under
 * Mixture's `Promise.all` fan-out: each resolution runs to completion on the
 * event loop before the next.
 *
 * `total` falls back to `input + output` when an adapter omits `totalTokens`.
 */
export class RmasTokenMeter {
  input = 0;
  output = 0;
  total = 0;

  constructor(private readonly inner: LlmCompletionFn) {}

  wrap: LlmCompletionFn = async (request, ctx) => {
    const response = await this.inner(request, ctx);
    const usage = response.usage;
    this.input += usage?.inputTokens ?? 0;
    this.output += usage?.outputTokens ?? 0;
    this.total += usage?.totalTokens ?? (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
    return response;
  };

  snapshot(): RmasTokenSnapshot {
    return { input: this.input, output: this.output, total: this.total };
  }
}
