import type { IncomingMessage } from "node:http";

export const MAX_JSON_BODY_BYTES = 1_048_576;

export class RequestBodyTooLargeError extends Error {
  constructor(public limit: number) {
    super(`request body exceeds ${limit} byte limit`);
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    request.resume();
    throw new RequestBodyTooLargeError(MAX_JSON_BODY_BYTES);
  }

  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      request.off("data", onData);
      request.off("end", onEnd);
      callback();
    };

    const onData = (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_JSON_BODY_BYTES) {
        chunks.length = 0;
        settle(() => {
          request.resume();
          reject(new RequestBodyTooLargeError(MAX_JSON_BODY_BYTES));
        });
        return;
      }
      chunks.push(buf);
    };

    const onEnd = () => {
      settle(() => {
        try {
          const rawBody = Buffer.concat(chunks).toString("utf8");
          resolve(rawBody ? JSON.parse(rawBody) : {});
        } catch (error) {
          reject(error);
        }
      });
    };

    request.on("data", onData);
    request.once("end", onEnd);
    request.once("error", (error) => {
      settle(() => reject(error));
    });
  });
}
