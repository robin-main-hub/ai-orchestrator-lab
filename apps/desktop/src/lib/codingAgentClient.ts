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
    headers: await createDgxOrchestratorJsonHeaders("POST", "/provider-completions", baseUrl, { body }),
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
  const response = await fetchImpl(`${baseUrl}/provider-completions/stream`, {
    method: "POST",
    headers: await createDgxOrchestratorJsonHeaders("POST", "/provider-completions/stream", baseUrl, { body }),
    body,
    signal: options?.signal,
  });
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

  for (;;) {
    const { done, value } = await reader.read();
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

  if (streamError && !finalContent && content.length === 0) {
    throw new Error(streamError);
  }
  return { content: finalContent ?? content, usage };
}
