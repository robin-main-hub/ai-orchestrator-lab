import { createHash, createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  __test,
  createDgxOrchestratorAuthHeaders,
  createDgxOrchestratorJsonHeaders,
  generateBrowserHmacSha256,
} from "./stage31DgxAuth";

const DEV_TOKEN = "dev-orchestrator-token";

// 로컬 .env에 실제 토큰이 있어도 테스트는 dev 폴백 토큰 기준으로 — 머신 환경 비의존
beforeAll(() => {
  vi.stubEnv("VITE_ORCHESTRATOR_API_TOKEN", "");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

function expectedBodyHash(body = "") {
  return createHash("sha256")
    .update(body)
    .digest("hex");
}

function expectedSignature(method: string, path: string, timestamp: string, nonce: string, body = "") {
  const bodyHash = expectedBodyHash(body);
  return createHmac("sha256", DEV_TOKEN)
    .update([method, path, bodyHash, timestamp, nonce].join("\n"))
    .digest("hex");
}

describe("DGX orchestrator desktop auth headers", () => {
  it("generates browser HMAC signatures compatible with the server verifier", async () => {
    const signature = await generateBrowserHmacSha256(
      DEV_TOKEN,
      ["GET", "/runtime", expectedBodyHash(), "1700000000000", "nonce-1"].join("\n"),
    );

    expect(signature).toBe(expectedSignature("GET", "/runtime", "1700000000000", "nonce-1"));
  });

  it("uses HMAC headers without bearer authorization for HTTP targets", async () => {
    const headers = await createDgxOrchestratorAuthHeaders(
      "GET",
      "/runtime",
      "http://dgx-02:4317/runtime",
      {
        nowMs: 1700000000000,
        nonce: "nonce-2",
      },
    );

    expect(headers).toEqual({
      "x-dgx-timestamp": "1700000000000",
      "x-dgx-nonce": "nonce-2",
      "x-dgx-body-sha256": expectedBodyHash(),
      "x-dgx-signature": expectedSignature("GET", "/runtime", "1700000000000", "nonce-2"),
    });
    expect(headers).not.toHaveProperty("authorization");
  });

  it("includes query strings and body hashes in HTTP request signatures", async () => {
    const body = JSON.stringify({ commandPreview: "pnpm test" });
    const headers = await createDgxOrchestratorJsonHeaders(
      "POST",
      "/tmux/dispatch",
      "http://dgx-02:4317/tmux/dispatch?dryRun=true",
      {
        body,
        nowMs: 1700000000000,
        nonce: "nonce-3",
      },
    );

    expect(headers["x-dgx-body-sha256"]).toBe(expectedBodyHash(body));
    expect(headers["x-dgx-signature"]).toBe(
      expectedSignature("POST", "/tmux/dispatch?dryRun=true", "1700000000000", "nonce-3", body),
    );
  });

  it("falls back when SubtleCrypto is unavailable", async () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues(values: Uint8Array) {
          values.fill(7);
          return values;
        },
      },
    });

    try {
      const signature = await generateBrowserHmacSha256(
        DEV_TOKEN,
        ["GET", "/runtime", expectedBodyHash(), "1700000000000", "nonce-4"].join("\n"),
      );

      expect(signature).toBe(expectedSignature("GET", "/runtime", "1700000000000", "nonce-4"));
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  });

  it("writes SHA-256 fallback message lengths as 64-bit big-endian integers", () => {
    const padded = new Uint8Array(64);
    const view = new DataView(padded.buffer);

    __test.writeSha256MessageLength(view, padded.length, 536_870_912);

    expect(view.getUint32(padded.length - 8, false)).toBe(1);
    expect(view.getUint32(padded.length - 4, false)).toBe(0);

    __test.writeSha256MessageLength(view, padded.length, 536_870_911);

    expect(view.getUint32(padded.length - 8, false)).toBe(0);
    expect(view.getUint32(padded.length - 4, false)).toBe(0xfffffff8);
  });

  it("keeps bearer authorization for HTTPS targets", async () => {
    const headers = await createDgxOrchestratorJsonHeaders(
      "POST",
      "/verify-packet",
      "https://orchestrator.example.test/verify-packet",
    );

    expect(headers).toEqual({
      "content-type": "application/json",
      authorization: `Bearer ${DEV_TOKEN}`,
    });
  });
});
