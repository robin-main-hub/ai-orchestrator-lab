/**
 * Adapter contract fixtures.
 *
 * Every LlmAdapter must pass the same six behavioral expectations:
 *
 *   1. happy path → status "succeeded" with non-empty content
 *   2. 401/403   → status "failed", error category ∈ { credential_expired, auth }
 *   3. 429       → status "failed", error category = rate_limit
 *   4. 5xx       → status "failed", error category = provider
 *   5. network   → status "failed", error category = network
 *   6. empty body → status "failed" (provider returned no usable text)
 *
 * Each adapter's wire format is different — Anthropic returns `content[].text`,
 * OpenAI returns `choices[0].message.content`, Ollama returns
 * `message.content`. So the response BUILDER stays adapter-local: each adapter
 * test imports the expectation and the assertContract helper, and supplies its
 * own success / error JSON shape via the fetch mock.
 *
 * This keeps the contract surface small while still letting every adapter (and
 * every new adapter that lands later — OpenRouter, DGX vLLM dedicated, etc.)
 * answer the same six questions with one assertion.
 */

import { expect } from "vitest";
import type { ProviderCompletionResponse } from "@ai-orchestrator/protocol";

export type ContractExpectation =
  | {
      kind: "succeeded";
      /** Optional regex the returned content must match. */
      contentMatches?: RegExp;
      /** When true, response.usage.inputTokens must be a number. */
      usageHasInputTokens?: boolean;
    }
  | {
      kind: "failed";
      /**
       * Regex against `response.error`. AdapterError categories surface in
       * the error string via the `[category] message` shape produced by
       * normalize*Error → status: "failed" path in every adapter.
       */
      errorMatches: RegExp;
    };

export const CONTRACT_HAPPY_PATH: ContractExpectation = {
  kind: "succeeded",
  contentMatches: /\S/,
  usageHasInputTokens: true,
};

export const CONTRACT_UNAUTHORIZED: ContractExpectation = {
  kind: "failed",
  errorMatches: /credential_expired|^\[auth\]|\bauth\b/,
};

export const CONTRACT_RATE_LIMITED: ContractExpectation = {
  kind: "failed",
  errorMatches: /rate_limit/,
};

export const CONTRACT_PROVIDER_ERROR: ContractExpectation = {
  kind: "failed",
  errorMatches: /provider/,
};

export const CONTRACT_NETWORK_FAILURE: ContractExpectation = {
  kind: "failed",
  errorMatches: /network/,
};

export const CONTRACT_EMPTY_CONTENT: ContractExpectation = {
  kind: "failed",
  // Different adapters word this differently ("empty response", "empty text
  // response", etc.) — match the shared substring rather than a specific
  // phrasing so new adapters don't need to align verbatim.
  errorMatches: /empty|no usable/i,
};

/**
 * The full standard contract set in a single array, useful for table-driven
 * iteration in adapter test suites that want one `it.each(...)` block.
 */
export const STANDARD_CONTRACT_CASES: Array<{ name: string; expectation: ContractExpectation }> = [
  { name: "happy path", expectation: CONTRACT_HAPPY_PATH },
  { name: "401 unauthorized", expectation: CONTRACT_UNAUTHORIZED },
  { name: "429 rate limited", expectation: CONTRACT_RATE_LIMITED },
  { name: "500 server error", expectation: CONTRACT_PROVIDER_ERROR },
  { name: "transport failure", expectation: CONTRACT_NETWORK_FAILURE },
  { name: "empty body", expectation: CONTRACT_EMPTY_CONTENT },
];

/**
 * Asserts a single response satisfies an expectation. Throws (via expect)
 * on mismatch so the failing case bubbles up with the vitest source location.
 */
export function assertContract(
  response: ProviderCompletionResponse,
  expectation: ContractExpectation,
): void {
  if (expectation.kind === "succeeded") {
    expect(response.status).toBe("succeeded");
    if (expectation.contentMatches) {
      expect(response.content ?? "").toMatch(expectation.contentMatches);
    }
    if (expectation.usageHasInputTokens) {
      expect(typeof response.usage?.inputTokens).toBe("number");
    }
    return;
  }
  expect(response.status).toBe("failed");
  expect(response.error ?? "").toMatch(expectation.errorMatches);
}
