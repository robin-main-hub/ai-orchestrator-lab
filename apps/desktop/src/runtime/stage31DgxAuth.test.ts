import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createDgxOrchestratorAuthHeaders,
  createDgxOrchestratorJsonHeaders,
  generateBrowserHmacSha256,
} from "./stage31DgxAuth";

const DEV_TOKEN = "dev-orchestrator-token";

function expectedSignature(method: string, path: string, timestamp: string, nonce: string) {
  return createHmac("sha256", DEV_TOKEN)
    .update([method, path, timestamp, nonce].join("\n"))
    .digest("hex");
}

describe("DGX orchestrator desktop auth headers", () => {
  it("generates browser HMAC signatures compatible with the server verifier", async () => {
    const signature = await generateBrowserHmacSha256(
      DEV_TOKEN,
      ["GET", "/runtime", "1700000000000", "nonce-1"].join("\n"),
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
      "x-dgx-signature": expectedSignature("GET", "/runtime", "1700000000000", "nonce-2"),
    });
    expect(headers).not.toHaveProperty("authorization");
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
