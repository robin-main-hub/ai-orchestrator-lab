import type { IncomingMessage } from "node:http";

export type TmuxRouteDependencies<TStorage, TDispatchRequest, TDispatchResult, TCaptureRequest, TCaptureResult> = {
  eventStorage: TStorage;
  request: IncomingMessage;
  pathname: string;
  method?: string;
  readJsonBody: (request: IncomingMessage) => Promise<unknown>;
  isRequestBodyTooLargeError: (error: unknown) => error is { limit: number };
  parseDispatchRequest: (value: unknown) => TDispatchRequest;
  recordDispatch: (request: TDispatchRequest, storage: TStorage) => Promise<TDispatchResult>;
  dispatchStatusCode: (result: TDispatchResult) => number;
  parseCaptureRequest: (value: unknown) => TCaptureRequest;
  recordCapture: (request: TCaptureRequest, storage: TStorage) => Promise<TCaptureResult>;
  captureStatusCode: (result: TCaptureResult) => number;
  respondJson: (statusCode: number, payload: unknown) => void;
};

export async function handleTmuxRoute<TStorage, TDispatchRequest, TDispatchResult, TCaptureRequest, TCaptureResult>({
  eventStorage,
  request,
  pathname,
  method,
  readJsonBody,
  isRequestBodyTooLargeError,
  parseDispatchRequest,
  recordDispatch,
  dispatchStatusCode,
  parseCaptureRequest,
  recordCapture,
  captureStatusCode,
  respondJson,
}: TmuxRouteDependencies<TStorage, TDispatchRequest, TDispatchResult, TCaptureRequest, TCaptureResult>): Promise<boolean> {
  if (pathname === "/tmux/dispatch" && method === "POST") {
    let payload: TDispatchRequest;
    try {
      payload = parseDispatchRequest(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, {
        error: "invalid_tmux_dispatch_payload",
        message: error instanceof Error ? error.message : String(error),
      });
      return true;
    }

    try {
      const result = await recordDispatch(payload, eventStorage);
      respondJson(dispatchStatusCode(result), result);
    } catch (error) {
      respondJson(500, {
        error: "tmux_dispatch_record_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/tmux/capture" && method === "POST") {
    let payload: TCaptureRequest;
    try {
      payload = parseCaptureRequest(await readJsonBody(request));
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, {
        error: "invalid_tmux_capture_payload",
        message: error instanceof Error ? error.message : String(error),
      });
      return true;
    }

    try {
      const result = await recordCapture(payload, eventStorage);
      respondJson(captureStatusCode(result), result);
    } catch (error) {
      respondJson(500, {
        error: "tmux_capture_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  return false;
}
