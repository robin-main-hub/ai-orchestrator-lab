import type {
  ApprovalState,
  ConversationMessage,
  PermissionDecision,
  ProviderCompletionAttachment,
  ProviderCompletionChunkEvent,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderCompletionRoute,
  ProviderCompletionUsage,
  ProviderProfile,
} from "@ai-orchestrator/protocol";
import {
  AnthropicAdapter,
  OpenAICompatibleAdapter,
  applyOpenAIImageAttachments,
  createAdapterContext,
} from "@ai-orchestrator/providers";
import { extractMessageAttachments, toProviderAttachments } from "../lib/attachmentContent";
import { resolveDgxServerBaseUrls } from "./stage30DgxEndpoints";
import { createDgxOrchestratorJsonHeaders } from "./stage31DgxAuth";

type DgxCompletionChoice = {
  message?: {
    content?: string;
  };
};

type DgxCompletionResponse = {
  choices?: DgxCompletionChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type ProviderCompletionPermissionRequiredPayload = {
  approval?: {
    id?: string;
    sourceItemId?: string;
  };
  error?: string;
  permission?: {
    approvalState?: string;
    decision?: string;
    reason?: string;
  };
};

const defaultDgxSystemPrompt =
  "Answer directly in Korean when the user writes Korean. Do not reveal reasoning or a thinking process.";

const defaultFetchImpl: typeof fetch = (input, init) => fetch(input, init);

export type Stage12DgxCompletionInput = {
  provider: ProviderProfile;
  modelId: string;
  messages: ConversationMessage[];
  fetchImpl?: typeof fetch;
  proxyBaseUrl?: string | string[];
  proxyTimeoutMs?: number;
  allowDirectFallback?: boolean;
  approvalState?: ApprovalState;
  permissionDecision?: PermissionDecision;
  localSecretResolver?: (provider: ProviderProfile) => Promise<string | undefined> | string | undefined;
  /** when set, the proxy route streams via SSE and reports accumulated text per delta */
  onDelta?: (textSoFar: string) => void;
  /** cooperative cancellation for the in-flight completion (stop button) */
  abortSignal?: AbortSignal;
};

export type Stage12DgxCompletionResult = {
  content: string;
  endpoint: string;
  route: ProviderCompletionRoute;
  usage?: ProviderCompletionUsage;
  fallbackReason?: string;
};

export class ProviderCompletionPermissionRequiredError extends Error {
  approvalId?: string;
  sourceItemId?: string;

  constructor(message: string, payload: ProviderCompletionPermissionRequiredPayload = {}) {
    super(message);
    this.name = "ProviderCompletionPermissionRequiredError";
    this.approvalId = payload.approval?.id;
    this.sourceItemId = payload.approval?.sourceItemId;
  }
}

export function isDgxVllmProvider(provider?: ProviderProfile) {
  return Boolean(provider?.tags.includes("dgx") && provider.tags.includes("vllm"));
}

export function isDgxRoutedProvider(provider?: ProviderProfile) {
  return Boolean(provider && (isDgxVllmProvider(provider) || provider.tags.includes("server-proxy")));
}

export async function requestDgxVllmCompletion({
  provider,
  modelId,
  messages,
  fetchImpl = defaultFetchImpl,
  proxyBaseUrl,
  proxyTimeoutMs = 120_000,
  allowDirectFallback = false,
  approvalState,
  permissionDecision,
  onDelta,
  abortSignal,
}: Stage12DgxCompletionInput): Promise<Stage12DgxCompletionResult> {
  try {
    return await requestDgxProviderCompletionViaProxyFallback({
      provider,
      modelId,
      messages,
      fetchImpl,
      proxyBaseUrl,
      proxyTimeoutMs,
      approvalState,
      permissionDecision,
      onDelta,
      abortSignal,
    });
  } catch (proxyError) {
    if (!allowDirectFallback) {
      throw proxyError;
    }

    try {
      const direct = await requestDgxVllmCompletionDirect({
        provider,
        modelId,
        messages,
        fetchImpl,
      });
      return {
        ...direct,
        fallbackReason: formatCompletionError(proxyError),
      };
    } catch (directError) {
      throw new Error(
        `DGX provider call failed. Server proxy: ${formatCompletionError(proxyError)}. Direct fallback: ${formatCompletionError(
          directError,
        )}`,
      );
    }
  }
}

export async function requestDgxProviderCompletion({
  provider,
  modelId,
  messages,
  fetchImpl = defaultFetchImpl,
  proxyBaseUrl,
  proxyTimeoutMs = 120_000,
  approvalState,
  permissionDecision,
  localSecretResolver,
  onDelta,
  abortSignal,
}: Stage12DgxCompletionInput): Promise<Stage12DgxCompletionResult> {
  if (isDgxVllmProvider(provider)) {
    return requestDgxVllmCompletion({
      provider,
      modelId,
      messages,
      fetchImpl,
      proxyBaseUrl,
      proxyTimeoutMs,
      approvalState,
      permissionDecision,
      localSecretResolver,
      onDelta,
      abortSignal,
    });
  }

  try {
    return await requestDgxProviderCompletionViaProxyFallback({
      provider,
      modelId,
      messages,
      fetchImpl,
      proxyBaseUrl,
      proxyTimeoutMs,
      approvalState,
      permissionDecision,
      onDelta,
      abortSignal,
    });
  } catch (proxyError) {
    if (proxyError instanceof ProviderCompletionPermissionRequiredError) {
      throw proxyError;
    }

    const direct = await requestServerProxyProviderCompletionDirect({
      provider,
      modelId,
      messages,
      fetchImpl,
      localSecretResolver,
    });
    if (!direct) {
      throw proxyError;
    }

    return {
      ...direct,
      fallbackReason: formatCompletionError(proxyError),
    };
  }
}

/** 대화 턴 기본 응답 상한 — 어댑터 기본 512는 표/코드가 든 답변을 중간에 끊는다 */
export const CONVERSATION_MAX_OUTPUT_TOKENS = 4096;

export function createProviderCompletionProxyRequest(
  provider: ProviderProfile,
  modelId: string,
  messages: ConversationMessage[],
  permission?: Pick<ProviderCompletionRequest, "approvalState" | "permissionDecision">,
): ProviderCompletionRequest {
  const request: ProviderCompletionRequest = {
    id: `provider_completion_request_${crypto.randomUUID()}`,
    sessionId: messages.at(-1)?.sessionId ?? "session_desktop_001",
    providerProfileId: provider.id,
    modelId,
    messages: compactProviderProxyMessages(messages).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    maxOutputTokens: CONVERSATION_MAX_OUTPUT_TOKENS,
    source: "desktop",
    routePreference: "server_proxy",
    createdAt: new Date().toISOString(),
  };

  if (permission?.approvalState) {
    request.approvalState = permission.approvalState;
  }
  if (permission?.permissionDecision) {
    request.permissionDecision = permission.permissionDecision;
  }

  const attachments = resolveProviderAttachments(messages);
  if (attachments) {
    request.attachments = attachments;
  }

  return request;
}

/** image/text content riders from the latest user message (item 3) */
function resolveProviderAttachments(
  messages: ConversationMessage[],
): ProviderCompletionAttachment[] | undefined {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUser) return undefined;
  return toProviderAttachments(extractMessageAttachments(lastUser.metadata));
}

function compactProviderProxyMessages(messages: ConversationMessage[]) {
  const normalizedMessages = messages.filter((message) => message.content.trim());
  const leadingSystemMessages = normalizedMessages.filter((message) => message.role === "system");
  const nonSystemMessages = normalizedMessages.filter((message) => message.role !== "system");
  const systemBudget = Math.min(leadingSystemMessages.length, 2);
  const latestBudget = Math.max(8 - systemBudget, 1);

  return [
    ...leadingSystemMessages.slice(0, systemBudget),
    ...nonSystemMessages.slice(-latestBudget),
  ];
}

async function requestDgxProviderCompletionViaProxyFallback({
  provider,
  modelId,
  messages,
  fetchImpl,
  proxyBaseUrl,
  proxyTimeoutMs,
  approvalState,
  permissionDecision,
  onDelta,
  abortSignal,
}: Required<Pick<Stage12DgxCompletionInput, "provider" | "modelId" | "messages" | "fetchImpl" | "proxyTimeoutMs">> &
  Pick<Stage12DgxCompletionInput, "approvalState" | "permissionDecision" | "onDelta" | "abortSignal"> &
  Pick<Stage12DgxCompletionInput, "proxyBaseUrl">): Promise<Stage12DgxCompletionResult> {
  let lastError: unknown;
  const errors: string[] = [];
  for (const baseUrl of resolveDgxServerBaseUrls(proxyBaseUrl)) {
    try {
      return await requestDgxVllmCompletionViaProxy({
        provider,
        modelId,
        messages,
        fetchImpl,
        proxyBaseUrl: baseUrl,
        proxyTimeoutMs,
        approvalState,
        permissionDecision,
        onDelta,
        abortSignal,
      });
    } catch (error) {
      if (error instanceof ProviderCompletionPermissionRequiredError) {
        throw error;
      }
      if (abortSignal?.aborted) {
        throw error;
      }
      lastError = error;
      errors.push(`${baseUrl}: ${formatCompletionError(error)}`);
    }
  }

  throw new Error(errors.length > 0 ? errors.join(" | ") : formatCompletionError(lastError ?? "DGX-02 server proxy unavailable"));
}

async function requestDgxVllmCompletionViaProxy({
  provider,
  modelId,
  messages,
  fetchImpl,
  proxyBaseUrl,
  proxyTimeoutMs,
  approvalState,
  permissionDecision,
  onDelta,
  abortSignal,
}: Required<Pick<Stage12DgxCompletionInput, "provider" | "modelId" | "messages" | "fetchImpl" | "proxyBaseUrl" | "proxyTimeoutMs">> &
  Pick<Stage12DgxCompletionInput, "approvalState" | "permissionDecision" | "onDelta" | "abortSignal">): Promise<Stage12DgxCompletionResult> {
  if (onDelta) {
    try {
      return await requestDgxCompletionViaProxyStream({
        provider,
        modelId,
        messages,
        fetchImpl,
        proxyBaseUrl,
        proxyTimeoutMs,
        approvalState,
        permissionDecision,
        onDelta,
        abortSignal,
      });
    } catch (error) {
      // permission gates and explicit user aborts are terminal; anything else
      // (no SSE support, parse failure) degrades to the non-stream POST below
      if (error instanceof ProviderCompletionPermissionRequiredError || abortSignal?.aborted) {
        throw error;
      }
    }
  }

  const endpoint = `${String(proxyBaseUrl).replace(/\/$/, "")}/provider-completions`;
  const body = JSON.stringify(createProviderCompletionProxyRequest(provider, modelId, messages, { approvalState, permissionDecision }));
  const response = await fetchWithTimeout(
    fetchImpl,
    endpoint,
    {
      method: "POST",
      headers: await createDgxOrchestratorJsonHeaders("POST", "/provider-completions", endpoint, { body }),
      body,
    },
    proxyTimeoutMs,
    abortSignal,
  );

  const rawText = await response.text();
  if (!response.ok) {
    const permissionError = parseProviderCompletionPermissionRequired(rawText);
    if (permissionError) {
      throw permissionError;
    }
    throw new Error(`DGX-02 server proxy failed: ${response.status} ${rawText.slice(0, 240)}`);
  }

  const parsed = JSON.parse(rawText) as ProviderCompletionResponse;
  if (parsed.status !== "succeeded" || !parsed.content) {
    throw new Error(parsed.error ?? "DGX-02 server proxy returned no completion");
  }

  return {
    content: parsed.content.trim(),
    endpoint: parsed.endpoint ?? endpoint,
    route: parsed.route,
    usage: parsed.usage,
  };
}

/** parse one SSE line ("data: {...}") into a chunk event */
function parseProviderChunkLine(line: string): ProviderCompletionChunkEvent | null {
  if (!line.startsWith("data:")) return null;
  try {
    return JSON.parse(line.slice(5).trim()) as ProviderCompletionChunkEvent;
  } catch {
    return null;
  }
}

/**
 * Streaming variant of the proxy completion (item 1): consumes the server's
 * `/provider-completions/stream` SSE endpoint, reporting accumulated text on
 * every delta. Same HMAC headers and permission-error contract as the
 * non-stream POST; the caller falls back to that POST when this throws.
 */
async function requestDgxCompletionViaProxyStream({
  provider,
  modelId,
  messages,
  fetchImpl,
  proxyBaseUrl,
  proxyTimeoutMs,
  approvalState,
  permissionDecision,
  onDelta,
  abortSignal,
}: Required<Pick<Stage12DgxCompletionInput, "provider" | "modelId" | "messages" | "fetchImpl" | "proxyBaseUrl" | "proxyTimeoutMs">> &
  Pick<Stage12DgxCompletionInput, "approvalState" | "permissionDecision" | "onDelta" | "abortSignal">): Promise<Stage12DgxCompletionResult> {
  const endpoint = `${String(proxyBaseUrl).replace(/\/$/, "")}/provider-completions/stream`;
  const body = JSON.stringify(
    createProviderCompletionProxyRequest(provider, modelId, messages, { approvalState, permissionDecision }),
  );
  const response = await fetchWithTimeout(
    fetchImpl,
    endpoint,
    {
      method: "POST",
      headers: await createDgxOrchestratorJsonHeaders("POST", "/provider-completions/stream", endpoint, { body }),
      body,
    },
    proxyTimeoutMs,
    abortSignal,
  );

  if (!response.ok) {
    const rawText = await response.text();
    const permissionError = parseProviderCompletionPermissionRequired(rawText);
    if (permissionError) {
      throw permissionError;
    }
    throw new Error(`DGX-02 stream proxy failed: ${response.status} ${rawText.slice(0, 240)}`);
  }
  if (!response.body) {
    throw new Error("DGX-02 stream proxy returned no body");
  }

  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finalContent: string | null = null;
  let usage: ProviderCompletionUsage | undefined;
  let streamError: string | undefined;

  const handleLine = (line: string) => {
    const chunk = parseProviderChunkLine(line);
    if (!chunk) return;
    if (chunk.type === "delta") {
      content += chunk.delta;
      onDelta?.(content);
    } else if (chunk.type === "done") {
      finalContent = chunk.finalContent;
      if (chunk.usage) usage = chunk.usage;
    } else if (chunk.type === "usage") {
      usage = chunk.usage;
    } else if (chunk.type === "error") {
      streamError = chunk.error.message;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separator = buffer.indexOf("\n");
      while (separator >= 0) {
        handleLine(buffer.slice(0, separator).trim());
        buffer = buffer.slice(separator + 1);
        separator = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleLine(buffer.trim());
  } finally {
    reader.releaseLock();
  }

  const resolved = (finalContent ?? content).trim();
  if (!resolved) {
    throw new Error(streamError ?? "DGX-02 stream returned no content");
  }
  return {
    content: resolved,
    endpoint,
    route: "server_proxy",
    usage,
  };
}

async function requestDgxVllmCompletionDirect({
  provider,
  modelId,
  messages,
  fetchImpl,
}: Required<Pick<Stage12DgxCompletionInput, "provider" | "modelId" | "messages" | "fetchImpl">>): Promise<Stage12DgxCompletionResult> {
  if (!provider.baseUrl) {
    throw new Error("DGX-02 vLLM base URL is missing");
  }

  const endpoint = `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(createDgxVllmRequestBody(modelId, messages)),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`DGX-02 vLLM request failed: ${response.status} ${rawText.slice(0, 240)}`);
  }

  const parsed = JSON.parse(rawText) as DgxCompletionResponse;
  const content = parsed.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("DGX-02 vLLM returned an empty response");
  }

  return {
    content,
    endpoint,
    route: "direct_provider",
    usage: {
      inputTokens: parsed.usage?.prompt_tokens,
      outputTokens: parsed.usage?.completion_tokens,
      totalTokens: parsed.usage?.total_tokens,
    },
  };
}

async function requestServerProxyProviderCompletionDirect({
  provider,
  modelId,
  messages,
  fetchImpl,
  localSecretResolver,
}: Required<Pick<Stage12DgxCompletionInput, "provider" | "modelId" | "messages" | "fetchImpl">> &
  Pick<Stage12DgxCompletionInput, "localSecretResolver">): Promise<Stage12DgxCompletionResult | undefined> {
  if (!provider.baseUrl || !localSecretResolver) {
    return undefined;
  }

  const localSecret = await localSecretResolver(provider);
  if (!localSecret?.trim()) {
    return undefined;
  }

  const request = createDirectProviderCompletionRequest(provider, modelId, messages);
  const adapter = createDirectProviderAdapter(provider, fetchImpl);
  if (!adapter) {
    return undefined;
  }

  const response = await adapter.complete(
    request,
    createAdapterContext({
      secret: localSecret,
      timeoutMs: 120_000,
    }),
  );

  if (response.status !== "succeeded" || !response.content?.trim()) {
    throw new Error(response.error ?? "direct provider fallback returned no completion");
  }

  return {
    content: response.content.trim(),
    endpoint: response.endpoint ?? provider.baseUrl,
    route: "direct_provider",
    usage: response.usage,
  };
}

function createDirectProviderCompletionRequest(
  provider: ProviderProfile,
  modelId: string,
  messages: ConversationMessage[],
): ProviderCompletionRequest {
  const request: ProviderCompletionRequest = {
    id: `provider_completion_direct_${crypto.randomUUID()}`,
    sessionId: messages.at(-1)?.sessionId ?? "session_desktop_001",
    providerProfileId: provider.id,
    modelId,
    messages: compactProviderProxyMessages(messages).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    maxOutputTokens: CONVERSATION_MAX_OUTPUT_TOKENS,
    source: "desktop",
    routePreference: "direct_provider",
    createdAt: new Date().toISOString(),
  };

  const attachments = resolveProviderAttachments(messages);
  if (attachments) {
    request.attachments = attachments;
  }

  return request;
}

export function resolveDirectProviderBaseUrl(provider: ProviderProfile, browserOrigin = resolveBrowserOrigin()) {
  if (!browserOrigin) {
    return provider.baseUrl;
  }

  if (provider.id === "provider_mimo_token_openai") {
    return `${browserOrigin}/mimo-token-openai`;
  }
  if (provider.id === "provider_mimo_token_anthropic") {
    return `${browserOrigin}/mimo-token-anthropic`;
  }

  return provider.baseUrl;
}

function createDirectProviderAdapter(provider: ProviderProfile, fetchImpl: typeof fetch) {
  const modelIds = provider.defaultModel ? [provider.defaultModel] : [];
  const baseUrl = resolveDirectProviderBaseUrl(provider) ?? "";
  if (provider.kind === "anthropic" || provider.tags.includes("anthropic-compatible")) {
    return new AnthropicAdapter({
      profileId: provider.id,
      baseUrl,
      modelIds,
      fetchImpl,
      temperature: 0.2,
    });
  }

  if (
    provider.kind === "openai" ||
    provider.kind === "openrouter" ||
    provider.tags.includes("openai-compatible")
  ) {
    return new OpenAICompatibleAdapter({
      profileId: provider.id,
      kind: provider.kind === "openrouter" ? "openrouter" : "openai",
      baseUrl,
      modelIds,
      fetchImpl,
      maxTokens: 512,
      temperature: 0.2,
    });
  }

  return undefined;
}

function resolveBrowserOrigin() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.location.origin;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number,
  outerSignal?: AbortSignal,
) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  // the listener intentionally outlives this call: fetch resolves at headers,
  // and an SSE body is consumed afterwards — stop must still abort that read
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort();
    else outerSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function formatCompletionError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function parseProviderCompletionPermissionRequired(rawText: string) {
  try {
    const parsed = JSON.parse(rawText) as ProviderCompletionPermissionRequiredPayload;
    if (parsed.error !== "permission_required" && parsed.permission?.decision !== "approval_required") {
      return undefined;
    }

    return new ProviderCompletionPermissionRequiredError(
      parsed.permission?.reason ?? "provider completion requires explicit approval",
      parsed,
    );
  } catch {
    return undefined;
  }
}

export function createDgxVllmRequestBody(modelId: string, messages: ConversationMessage[]) {
  return {
    model: modelId,
    // vLLM speaks the OpenAI multimodal dialect, so image attachments reuse
    // the same image_url content-part mapping as the OpenAI adapter (item 3)
    messages: applyOpenAIImageAttachments(createDgxChatMessages(messages), resolveProviderAttachments(messages)),
    max_tokens: CONVERSATION_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    chat_template_kwargs: {
      enable_thinking: false,
    },
  };
}

function createDgxChatMessages(messages: ConversationMessage[]) {
  const systemParts = [defaultDgxSystemPrompt];
  const chatMessages: Array<{ role: "assistant" | "user"; content: string }> = [];

  for (const message of messages) {
    const content = message.content.trim();
    if (!content) {
      continue;
    }

    if (message.role === "system") {
      systemParts.push(content);
      continue;
    }

    chatMessages.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content,
    });
  }

  return [
    {
      role: "system" as const,
      content: systemParts.join("\n\n"),
    },
    ...chatMessages.slice(-8),
  ];
}
