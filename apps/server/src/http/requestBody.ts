import type { IncomingMessage } from "node:http";

export const MAX_JSON_BODY_BYTES = 1_048_576;

export class RequestBodyTooLargeError extends Error {
  constructor(public limit: number) {
    super(`request body exceeds ${limit} byte limit`);
    this.name = "RequestBodyTooLargeError";
  }
}

const rawBodyByRequest = new WeakMap<IncomingMessage, Promise<string>>();

export async function readRawBody(request: IncomingMessage): Promise<string> {
  const existing = rawBodyByRequest.get(request);
  if (existing) return existing;

  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    request.resume();
    throw new RequestBodyTooLargeError(MAX_JSON_BODY_BYTES);
  }

  const bodyPromise = new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
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
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    };

    const onError = (error: Error) => {
      settle(() => reject(error));
    };

    request.on("data", onData);
    request.once("end", onEnd);
    request.once("error", onError);
  });

  rawBodyByRequest.set(request, bodyPromise);
  return bodyPromise;
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const rawBody = await readRawBody(request);
  return rawBody ? JSON.parse(rawBody) : {};
}
