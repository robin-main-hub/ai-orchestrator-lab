import type {
  ProviderCompletionChunkEvent,
  ProviderProfile,
  ConversationMessage,
  ApprovalState,
  PermissionDecision,
} from "@ai-orchestrator/protocol";
import { resolveDgxServerBaseUrls } from "./stage30DgxEndpoints";
import { createDgxOrchestratorJsonHeaders } from "./stage31DgxAuth";
import { createProviderCompletionProxyRequest, Stage12DgxCompletionInput } from "./stage12DgxProvider";

export type Stage12DgxCompletionStreamInput = Stage12DgxCompletionInput & {
  abortSignal?: AbortSignal;
  onChunk: (event: ProviderCompletionChunkEvent) => void;
};

export async function requestDgxProviderCompletionStream({
  provider,
  modelId,
  messages,
  fetchImpl = fetch,
  proxyBaseUrl,
  proxyTimeoutMs = 30_000,
  approvalState,
  permissionDecision,
  abortSignal,
  onChunk,
}: Stage12DgxCompletionStreamInput): Promise<void> {
  const baseUrls = resolveDgxServerBaseUrls(proxyBaseUrl);
  let lastError: unknown;

  for (const baseUrl of baseUrls) {
    try {
      const endpoint = `${String(baseUrl).replace(/\/$/, "")}/provider-completions/stream`;
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: createDgxOrchestratorJsonHeaders(),
        body: JSON.stringify(
          createProviderCompletionProxyRequest(provider, modelId, messages, {
            approvalState,
            permissionDecision,
          })
        ),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Proxy stream failed: ${response.status} ${errText}`);
      }

      if (!response.body) {
        throw new Error("Response body is not readable");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const eventBlock = buffer.substring(0, boundary).trim();
            buffer = buffer.substring(boundary + 2);

            if (eventBlock) {
              const lines = eventBlock.split("\n");
              let eventType = "";
              let eventData = "";
              for (const line of lines) {
                if (line.startsWith("event:")) {
                  eventType = line.substring(6).trim();
                } else if (line.startsWith("data:")) {
                  eventData = line.substring(5).trim();
                }
              }

              if (eventType === "chunk" && eventData) {
                try {
                  const chunkEvent = JSON.parse(eventData) as ProviderCompletionChunkEvent;
                  onChunk(chunkEvent);
                } catch (e) {
                  console.error("[StreamParser] Failed to parse event data JSON:", e);
                }
              }
            }

            boundary = buffer.indexOf("\n\n");
          }
        }
      } finally {
        reader.releaseLock();
      }

      return; // Succeeded, exit loop
    } catch (error: any) {
      lastError = error;
      console.warn(`Failed stream via ${baseUrl}:`, error);
      if (error && (error.name === "AbortError" || abortSignal?.aborted)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("DGX-02 server proxy stream unavailable");
}
