import { describe, expect, it } from "vitest";
import { computeBackoffDelayMs, isRetryableProviderError, withBackoffRetry } from "./retryPolicy";

const noSleep = async () => {};

describe("isRetryableProviderError", () => {
  it("retries network-ish and rate-limit errors", () => {
    expect(isRetryableProviderError(new Error("fetch failed"))).toBe(true);
    expect(isRetryableProviderError(new Error("request timed out"))).toBe(true);
    expect(isRetryableProviderError(new Error("upstream rate limited the request (429)"))).toBe(true);
    expect(isRetryableProviderError(new Error("anthropic: overloaded (529)"))).toBe(true);
  });

  it("never retries permission-required or abort errors", () => {
    const permission = new Error("approval pending");
    permission.name = "ProviderCompletionPermissionRequiredError";
    expect(isRetryableProviderError(permission)).toBe(false);

    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(isRetryableProviderError(abort)).toBe(false);
  });

  it("never retries auth failures even when the message carries a 429", () => {
    expect(
      isRetryableProviderError(
        new Error('DGX-02 server proxy failed: 429 {"error":"too_many_failed_auth_attempts"}'),
      ),
    ).toBe(false);
    expect(isRetryableProviderError(new Error("upstream rejected credentials (401)"))).toBe(false);
    expect(isRetryableProviderError(new Error("invalid api key"))).toBe(false);
  });

  it("treats unknown errors and non-errors as permanent", () => {
    expect(isRetryableProviderError(new Error("invalid api key"))).toBe(false);
    expect(isRetryableProviderError("string failure")).toBe(false);
  });

  it("uses numeric status when present", () => {
    const tooMany = Object.assign(new Error("nope"), { status: 429 });
    const bad = Object.assign(new Error("nope"), { status: 400 });
    const upstream = Object.assign(new Error("nope"), { status: 503 });
    expect(isRetryableProviderError(tooMany)).toBe(true);
    expect(isRetryableProviderError(bad)).toBe(false);
    expect(isRetryableProviderError(upstream)).toBe(true);
  });
});

describe("computeBackoffDelayMs", () => {
  it("doubles per attempt and respects the ceiling", () => {
    const fixed = () => 1; // jitter at maximum → full exponential value
    expect(computeBackoffDelayMs(0, { baseDelayMs: 500, random: fixed })).toBe(500);
    expect(computeBackoffDelayMs(1, { baseDelayMs: 500, random: fixed })).toBe(1000);
    expect(computeBackoffDelayMs(10, { baseDelayMs: 500, maxDelayMs: 8000, random: fixed })).toBe(8000);
  });
});

describe("withBackoffRetry", () => {
  it("returns the first success without retrying", async () => {
    let calls = 0;
    const result = await withBackoffRetry(async () => {
      calls += 1;
      return "ok";
    }, { sleep: noSleep });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries transient failures then succeeds", async () => {
    let calls = 0;
    const retries: number[] = [];
    const result = await withBackoffRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("fetch failed");
        return "recovered";
      },
      { maxAttempts: 3, sleep: noSleep, onRetry: (info) => retries.push(info.attempt) },
    );
    expect(result).toBe("recovered");
    expect(calls).toBe(3);
    expect(retries).toEqual([1, 2]);
  });

  it("throws immediately on non-retryable errors", async () => {
    let calls = 0;
    const permission = new Error("approval pending");
    permission.name = "ProviderCompletionPermissionRequiredError";
    await expect(
      withBackoffRetry(async () => {
        calls += 1;
        throw permission;
      }, { sleep: noSleep }),
    ).rejects.toBe(permission);
    expect(calls).toBe(1);
  });

  it("gives up after maxAttempts and rethrows the last error", async () => {
    let calls = 0;
    await expect(
      withBackoffRetry(async () => {
        calls += 1;
        throw new Error("fetch failed");
      }, { maxAttempts: 3, sleep: noSleep }),
    ).rejects.toThrow("fetch failed");
    expect(calls).toBe(3);
  });
});
