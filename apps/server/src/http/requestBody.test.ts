import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { readRawBody } from "./requestBody";

function createRequest(body: string): IncomingMessage {
  const request = new PassThrough() as PassThrough & { headers: Record<string, string> };
  request.headers = {
    "content-length": Buffer.byteLength(body).toString(),
  };
  request.end(body);
  return request as unknown as IncomingMessage;
}

describe("request body reader", () => {
  it("removes transient stream listeners after successfully reading a cached body", async () => {
    const request = createRequest(JSON.stringify({ ok: true }));

    await expect(readRawBody(request)).resolves.toBe(JSON.stringify({ ok: true }));

    expect(request.listenerCount("data")).toBe(0);
    expect(request.listenerCount("end")).toBe(0);
    expect(request.listenerCount("error")).toBe(0);
  });
});
