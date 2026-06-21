import { describe, expect, it } from "vitest";
import { AdapterError, redactSecretsForLog, truncateForLog } from "./errors";

describe("AdapterError", () => {
  it("captures category and message", () => {
    const err = new AdapterError("auth", "invalid x-api-key");
    expect(err.category).toBe("auth");
    expect(err.message).toBe("invalid x-api-key");
    expect(err.name).toBe("AdapterError");
    expect(err).toBeInstanceOf(Error);
  });

  it("carries optional status, retryAfterSec, and raw snippet", () => {
    const err = new AdapterError("rate_limit", "throttled", {
      status: 429,
      retryAfterSec: 30,
      providerRawSnippet: "<redacted>",
    });
    expect(err.status).toBe(429);
    expect(err.retryAfterSec).toBe(30);
    expect(err.providerRawSnippet).toBe("<redacted>");
  });

  it("supports cause for error chaining", () => {
    const underlying = new Error("network unreachable");
    const err = new AdapterError("network", "fetch failed", { cause: underlying });
    expect((err as { cause?: unknown }).cause).toBe(underlying);
  });
});

describe("redactSecretsForLog", () => {
  it("masks sk- style API keys", () => {
    const out = redactSecretsForLog("error 401: sk-abcdef0123456789abcdef0123456789 leaked");
    expect(out).not.toContain("sk-abcdef0123456789abcdef0123456789");
    expect(out).toContain("<redacted>");
  });

  it("masks Anthropic and reseller-style keys", () => {
    const out = redactSecretsForLog("Authorization: claude-anth-shouldbehidden-1234567890abcdef");
    expect(out).not.toContain("claude-anth-shouldbehidden-1234567890abcdef");
    expect(out).toContain("<redacted>");
  });

  it("masks Bearer values", () => {
    const out = redactSecretsForLog("rejected Bearer eyJhbGciOiJIUzI1NiIsInR5c.payload.signature");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiIsInR5c.payload.signature");
    expect(out).toContain("<redacted>");
  });

  it("masks env-style key assignments", () => {
    const out = redactSecretsForLog("Env: API_KEY=topsecret123 and AUTH_TOKEN=alsosecret456");
    expect(out).not.toContain("topsecret123");
    expect(out).not.toContain("alsosecret456");
  });

  it("masks PEM private key headers", () => {
    const out = redactSecretsForLog(
      "leaked: -----BEGIN RSA PRIVATE KEY----- somebase64payload",
    );
    expect(out).not.toContain("-----BEGIN RSA PRIVATE KEY-----");
    expect(out).toContain("<redacted>");
  });

  it("masks fine-grained GitHub PAT and bare aws/google/slack tokens (parity with W1/H8d)", () => {
    // gitleaks가 contiguous 리터럴을 잡으므로 런타임 조합으로 회피.
    const pat = "github_" + "pat_" + "11" + "A".repeat(22) + "_" + "b".repeat(40);
    const akia = "AKIA" + "ABCDEFGHIJKLMNOP";
    const aiza = "AIza" + "d".repeat(35);
    const xox = "xoxb-" + "1".repeat(12) + "-efabefabefab";
    const out = redactSecretsForLog(
      [`gh ${pat}`, `aws ${akia}`, `goog ${aiza}`, `slack ${xox}`].join("\n"),
    );
    for (const raw of [pat, akia, aiza, xox]) {
      expect(out).not.toContain(raw);
    }
    expect(out).toContain("<redacted>");
  });

  it("leaves safe text untouched", () => {
    const out = redactSecretsForLog("upstream returned 502 bad gateway, retry in 5s");
    expect(out).toBe("upstream returned 502 bad gateway, retry in 5s");
  });
});

describe("truncateForLog", () => {
  it("returns the text unchanged when under the limit", () => {
    expect(truncateForLog("short", 240)).toBe("short");
  });

  it("truncates and adds ellipsis when over the limit", () => {
    const long = "x".repeat(300);
    const out = truncateForLog(long, 240);
    expect(out).toHaveLength(243);
    expect(out.endsWith("...")).toBe(true);
  });

  it("defaults to 240 chars", () => {
    const long = "y".repeat(500);
    const out = truncateForLog(long);
    expect(out.length).toBe(243);
  });
});
