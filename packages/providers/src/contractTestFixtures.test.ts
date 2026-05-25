import { describe, expect, it } from "vitest";
import type { ProviderCompletionResponse } from "@ai-orchestrator/protocol";
import {
  assertContract,
  CONTRACT_EMPTY_CONTENT,
  CONTRACT_HAPPY_PATH,
  CONTRACT_NETWORK_FAILURE,
  CONTRACT_PROVIDER_ERROR,
  CONTRACT_RATE_LIMITED,
  CONTRACT_UNAUTHORIZED,
  STANDARD_CONTRACT_CASES,
} from "./contractTestFixtures";

function makeResponse(overrides: Partial<ProviderCompletionResponse>): ProviderCompletionResponse {
  return {
    id: "resp_1",
    requestId: "req_1",
    providerProfileId: "p",
    modelId: "m",
    route: "server_proxy",
    status: "succeeded",
    content: "ok",
    usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 },
    createdAt: "2026-05-25T00:00:00.000Z",
    ...overrides,
  };
}

describe("contract fixture catalog", () => {
  it("exposes six standard cases in stable order", () => {
    expect(STANDARD_CONTRACT_CASES.map((c) => c.name)).toEqual([
      "happy path",
      "401 unauthorized",
      "429 rate limited",
      "500 server error",
      "transport failure",
      "empty body",
    ]);
  });
});

describe("assertContract — happy path", () => {
  it("passes when response is succeeded with content + usage", () => {
    assertContract(makeResponse({}), CONTRACT_HAPPY_PATH);
  });

  it("fails when status is failed", () => {
    expect(() =>
      assertContract(
        makeResponse({ status: "failed", content: undefined, error: "[network] x" }),
        CONTRACT_HAPPY_PATH,
      ),
    ).toThrow();
  });

  it("fails when content is empty (whitespace only) and contentMatches is the default \\S regex", () => {
    expect(() =>
      assertContract(makeResponse({ content: "   " }), CONTRACT_HAPPY_PATH),
    ).toThrow();
  });

  it("fails when usage.inputTokens is missing", () => {
    expect(() =>
      assertContract(
        makeResponse({ usage: { outputTokens: 1, totalTokens: 1 } }),
        CONTRACT_HAPPY_PATH,
      ),
    ).toThrow();
  });
});

describe("assertContract — failure categories", () => {
  it("matches credential_expired / [auth] for unauthorized", () => {
    assertContract(
      makeResponse({ status: "failed", error: "[credential_expired] x" }),
      CONTRACT_UNAUTHORIZED,
    );
    assertContract(
      makeResponse({ status: "failed", error: "[auth] x" }),
      CONTRACT_UNAUTHORIZED,
    );
  });

  it("matches rate_limit for throttled responses", () => {
    assertContract(
      makeResponse({ status: "failed", error: "[rate_limit] throttled" }),
      CONTRACT_RATE_LIMITED,
    );
  });

  it("matches provider for 5xx-style errors", () => {
    assertContract(
      makeResponse({ status: "failed", error: "[provider] upstream 500" }),
      CONTRACT_PROVIDER_ERROR,
    );
  });

  it("matches network for transport-level failures", () => {
    assertContract(
      makeResponse({ status: "failed", error: "[network] fetch failed" }),
      CONTRACT_NETWORK_FAILURE,
    );
  });

  it("matches empty for missing-content failures (case-insensitive substring)", () => {
    assertContract(
      makeResponse({ status: "failed", error: "[provider] returned an empty response" }),
      CONTRACT_EMPTY_CONTENT,
    );
    assertContract(
      makeResponse({ status: "failed", error: "[provider] no usable text" }),
      CONTRACT_EMPTY_CONTENT,
    );
  });

  it("fails when failure status matches but error category is wrong", () => {
    expect(() =>
      assertContract(
        makeResponse({ status: "failed", error: "[provider] x" }),
        CONTRACT_UNAUTHORIZED,
      ),
    ).toThrow();
  });

  it("fails when status is succeeded but a failure expectation is supplied", () => {
    expect(() =>
      assertContract(makeResponse({ status: "succeeded" }), CONTRACT_NETWORK_FAILURE),
    ).toThrow();
  });
});
