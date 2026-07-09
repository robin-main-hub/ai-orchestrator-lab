import type {
  ProviderCompletionChunkEvent,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
} from "@ai-orchestrator/protocol";
import { resolveConfiguredDgxServerBaseUrls, resolveDgxServerBaseUrls } from "../runtime/stage30DgxEndpoints";
import { createDgxOrchestratorJsonHeaders } from "../runtime/stage31DgxAuth";

/**
 * Thin fetch client for the server's provider-completion endpoints — the
 * coding workbench's LLM transport. Streaming uses the SSE endpoint
 * (`event: chunk` lines carrying ProviderCompletionChunkEvent JSON) with a
 * graceful fallback to the non-streaming endpoint when the stream errors
 * before producing any content.
 */

export type CompletionClientOptions = {
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
};

function firstBaseUrl(options?: CompletionClientOptions): string {
  const explicit = resolveDgxServerBaseUrls(options?.serverBaseUrl);
  if (explicit[0]) return explicit[0];
  const configured = resolveConfiguredDgxServerBaseUrls();
  return configured[0] ?? "http://127.0.0.1:8787";
}

export async function requestCompletion(
  request: ProviderCompletionRequest,
  options?: CompletionClientOptions,
): Promise<ProviderCompletionResponse> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const baseUrl = firstBaseUrl(options);
  const body = JSON.stringify(request);
  const response = await fetchImpl(`${baseUrl}/provider-completions`, {
    method: "POST",
    // targetUrl must be the FULL request URL (base+path), not the bare base:
    // on a plain-http target the HMAC branch signs `new URL(targetUrl).pathname`,
    // so a bare base signs "/" while the server verifies the real path → 401.
    headers: await createDgxOrchestratorJsonHeaders("POST", "/provider-completions", `${baseUrl}/provider-completions`, {
      body,
    }),
    body,
  });
  const payload = (await response.json()) as ProviderCompletionResponse & { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(
      payload.error ? `${payload.error}${payload.message ? `: ${payload.message}` : ""}` : `HTTP ${response.status}`,
    );
  }
  return payload;
}

export type StreamCallbacks = {
  onDelta?: (textSoFar: string) => void;
  signal?: AbortSignal;
};

/** 스트림 무활동 한도 — 이 시간 동안 청크가 없으면 죽은 연결로 보고 끊는다 */
const STREAM_STALL_TIMEOUT_MS = 90_000;

/** reader.read()에 무활동 데드라인을 건다 — 서버가 헤더만 주고 본문을 멈추면 영원히 기다리지 않게 */
async function readWithStallGuard<T>(
  reader: ReadableStreamDefaultReader<T>,
  stallMs: number,
): Promise<ReadableStreamReadResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`stream stalled: ${Math.round(stallMs / 1000)}초간 응답 없음`)),
          stallMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** parse one SSE frame body ("data: {...}") into a chunk event */
function parseChunkLine(line: string): ProviderCompletionChunkEvent | null {
  if (!line.startsWith("data:")) return null;
  try {
    return JSON.parse(line.slice(5).trim()) as ProviderCompletionChunkEvent;
  } catch {
    return null;
  }
}

export async function streamCompletion(
  request: ProviderCompletionRequest,
  options?: CompletionClientOptions & StreamCallbacks,
): Promise<{ content: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const baseUrl = firstBaseUrl(options);
  const body = JSON.stringify(request);
  // 연결(헤더 수신) 단계 가드 15초 + 호출자 abort 신호 결합. SSE는 헤더가
  // 즉시 와야 정상이므로 짧게 잡고, 본문은 아래 stall guard(90초)로 지킨다.
  const connectController = new AbortController();
  const connectTimer = setTimeout(() => connectController.abort(), 15_000);
  if (options?.signal) {
    if (options.signal.aborted) connectController.abort();
    else options.signal.addEventListener("abort", () => connectController.abort(), { once: true });
  }
  let response: Awaited<ReturnType<typeof fetchImpl>>;
  try {
    response = await fetchImpl(`${baseUrl}/provider-completions/stream`, {
      method: "POST",
      // full request URL as targetUrl (see requestCompletion above) so the
      // plain-http HMAC branch signs "/provider-completions/stream", not "/".
      headers: await createDgxOrchestratorJsonHeaders(
        "POST",
        "/provider-completions/stream",
        `${baseUrl}/provider-completions/stream`,
        { body },
      ),
      body,
      signal: connectController.signal,
    });
  } finally {
    clearTimeout(connectTimer);
  }
  if (!response.ok || !response.body) {
    // permission/validation failures arrive as JSON — surface them
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // not JSON — keep the status text
    }
    throw new Error(detail);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finalContent: string | null = null;
  let usage: { inputTokens?: number; outputTokens?: number } | undefined;
  let streamError: string | null = null;

  try {
  for (;;) {
    const { done, value } = await readWithStallGuard(reader, STREAM_STALL_TIMEOUT_MS);
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separator = buffer.indexOf("\n\n");
    while (separator >= 0) {
      const frame = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf("\n\n");
      for (const line of frame.split("\n")) {
        const chunk = parseChunkLine(line);
        if (!chunk) continue;
        if (chunk.type === "delta") {
          content += chunk.delta;
          options?.onDelta?.(content);
        } else if (chunk.type === "done") {
          finalContent = chunk.finalContent;
          if (chunk.usage) usage = chunk.usage;
        } else if (chunk.type === "usage") {
          usage = chunk.usage;
        } else if (chunk.type === "error") {
          streamError = chunk.error.message;
        }
      }
    }
  }
  } catch (error) {
    // 정체/끊김 시 연결을 정리하고 위로 던진다 → 호출부가 non-stream POST로 폴백
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (streamError && !finalContent && content.length === 0) {
    throw new Error(streamError);
  }
  return { content: finalContent ?? content, usage };
}
