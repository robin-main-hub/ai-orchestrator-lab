import { loadConnectionSettings } from "./connection";

export type ApiErrorCategory =
  | "missing_token"
  | "unauthorized"
  | "payload_too_large"
  | "bad_request"
  | "network"
  | "provider"
  | "unknown";

export class MobileApiError extends Error {
  readonly category: ApiErrorCategory;
  readonly status?: number;
  readonly endpoint?: string;
  readonly userMessage: string;

  constructor(
    category: ApiErrorCategory,
    userMessage: string,
    options: { status?: number; endpoint?: string; cause?: unknown } = {},
  ) {
    super(userMessage);
    this.name = "MobileApiError";
    this.category = category;
    this.userMessage = userMessage;
    this.status = options.status;
    this.endpoint = options.endpoint;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * POST JSON to the orchestrator server. Tries the primary base URL first and
 * falls back to the LAN URL on a transport-level failure (no response at all
 * — DNS, TLS, refused connection). Once the server responds with any HTTP
 * status the response is treated as authoritative, so a 502 from primary does
 * NOT trigger a fallback (the server itself is reachable; the upstream is
 * not, and the fallback would just give the same answer).
 *
 * Returns the parsed JSON body. Throws MobileApiError with a user-facing
 * message that the chat screen can render directly.
 */
export async function postJson<T>(path: string, payload: unknown): Promise<T> {
  return requestJson<T>("POST", path, payload);
}

export async function getJson<T>(path: string): Promise<T> {
  return requestJson<T>("GET", path);
}

async function requestJson<T>(method: "GET" | "POST", path: string, payload?: unknown): Promise<T> {
  const settings = loadConnectionSettings();
  if (!settings.apiToken) {
    throw new MobileApiError(
      "missing_token",
      "API 토큰이 설정되지 않았습니다. 더보기 → 연결 설정에서 입력하세요.",
    );
  }

  const candidates = uniqueNonEmpty([settings.baseUrlPrimary, settings.baseUrlFallback]);
  let lastTransportError: unknown;

  for (const baseUrl of candidates) {
    const endpoint = `${baseUrl.replace(/\/$/, "")}${path}`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${settings.apiToken}`,
        },
        body: method === "POST" ? JSON.stringify(payload) : undefined,
      });
    } catch (err) {
      lastTransportError = err;
      continue; // transport-level failure — try next candidate
    }

    if (response.status === 401) {
      throw new MobileApiError("unauthorized", "토큰이 거부됐습니다 (401).", {
        status: 401,
        endpoint,
      });
    }
    if (response.status === 413) {
      throw new MobileApiError(
        "payload_too_large",
        "메시지가 너무 큽니다 (413). 첨부 크기를 줄여보세요.",
        { status: 413, endpoint },
      );
    }
    if (response.status === 400) {
      const body = await safeJson(response);
      const message = typeof body?.message === "string" ? body.message : "잘못된 요청 (400).";
      throw new MobileApiError("bad_request", message, { status: 400, endpoint });
    }
    if (!response.ok) {
      throw new MobileApiError(
        "provider",
        `서버 오류 (${response.status}). 잠시 후 다시 시도하세요.`,
        { status: response.status, endpoint },
      );
    }
    return (await response.json()) as T;
  }

  throw new MobileApiError(
    "network",
    "서버에 연결할 수 없습니다. 네트워크와 연결 설정의 서버 URL을 확인하세요.",
    { cause: lastTransportError },
  );
}

function uniqueNonEmpty(values: string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const trimmed = v?.trim();
    if (!trimmed) continue;
    if (out.includes(trimmed)) continue;
    out.push(trimmed);
  }
  return out;
}

async function safeJson(response: Response): Promise<{ message?: unknown } | undefined> {
  try {
    return (await response.json()) as { message?: unknown };
  } catch {
    return undefined;
  }
}
