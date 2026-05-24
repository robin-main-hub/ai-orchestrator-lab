import type {
  ConversationMessage,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderCompletionRoute,
  ProviderCompletionUsage,
  ProviderProfile,
} from "@ai-orchestrator/protocol";
import { resolveDgxServerBaseUrls } from "./stage30DgxEndpoints";

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

export type Stage12DgxCompletionInput = {
  provider: ProviderProfile;
  modelId: string;
  messages: ConversationMessage[];
  fetchImpl?: typeof fetch;
  proxyBaseUrl?: string | string[];
  proxyTimeoutMs?: number;
  allowDirectFallback?: boolean;
};

export type Stage12DgxCompletionResult = {
  content: string;
  endpoint: string;
  route: ProviderCompletionRoute;
  usage?: ProviderCompletionUsage;
  fallbackReason?: string;
};

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
  fetchImpl = fetch,
  proxyBaseUrl,
  proxyTimeoutMs = 1_500,
  allowDirectFallback = true,
}: Stage12DgxCompletionInput): Promise<Stage12DgxCompletionResult> {
  try {
    return await requestDgxProviderCompletionViaProxyFallback({
      provider,
      modelId,
      messages,
      fetchImpl,
      proxyBaseUrl,
      proxyTimeoutMs,
    });
  } catch (proxyError) {
    if (!allowDirectFallback) {
      throw proxyError;
    }

    const direct = await requestDgxVllmCompletionDirect({
      provider,
      modelId,
      messages,
      fetchImpl,
    });
    return {
      ...direct,
      fallbackReason: proxyError instanceof Error ? proxyError.message : String(proxyError),
    };
  }
}

export async function requestDgxProviderCompletion({
  provider,
  modelId,
  messages,
  fetchImpl = fetch,
  proxyBaseUrl,
  proxyTimeoutMs = 1_500,
}: Stage12DgxCompletionInput): Promise<Stage12DgxCompletionResult> {
  if (isDgxVllmProvider(provider)) {
    return requestDgxVllmCompletion({
      provider,
      modelId,
      messages,
      fetchImpl,
      proxyBaseUrl,
      proxyTimeoutMs,
    });
  }

  return requestDgxProviderCompletionViaProxyFallback({
    provider,
    modelId,
    messages,
    fetchImpl,
    proxyBaseUrl,
    proxyTimeoutMs,
  });
}

export function createProviderCompletionProxyRequest(
  provider: ProviderProfile,
  modelId: string,
  messages: ConversationMessage[],
): ProviderCompletionRequest {
  return {
    id: `provider_completion_request_${crypto.randomUUID()}`,
    sessionId: messages.at(-1)?.sessionId ?? "session_desktop_001",
    providerProfileId: provider.id,
    modelId,
    messages: messages.slice(-8).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    source: "desktop",
    routePreference: "server_proxy",
    createdAt: new Date().toISOString(),
  };
}

async function requestDgxProviderCompletionViaProxyFallback({
  provider,
  modelId,
  messages,
  fetchImpl,
  proxyBaseUrl,
  proxyTimeoutMs,
}: Required<Pick<Stage12DgxCompletionInput, "provider" | "modelId" | "messages" | "fetchImpl" | "proxyTimeoutMs">> &
  Pick<Stage12DgxCompletionInput, "proxyBaseUrl">): Promise<Stage12DgxCompletionResult> {
  let lastError: unknown;
  for (const baseUrl of resolveDgxServerBaseUrls(proxyBaseUrl)) {
    try {
      return await requestDgxVllmCompletionViaProxy({
        provider,
        modelId,
        messages,
        fetchImpl,
        proxyBaseUrl: baseUrl,
        proxyTimeoutMs,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "DGX-02 server proxy unavailable"));
}

async function requestDgxVllmCompletionViaProxy({
  provider,
  modelId,
  messages,
  fetchImpl,
  proxyBaseUrl,
  proxyTimeoutMs,
}: Required<Pick<Stage12DgxCompletionInput, "provider" | "modelId" | "messages" | "fetchImpl" | "proxyBaseUrl" | "proxyTimeoutMs">>): Promise<Stage12DgxCompletionResult> {
  const endpoint = `${String(proxyBaseUrl).replace(/\/$/, "")}/provider-completions`;
  const response = await fetchWithTimeout(
    fetchImpl,
    endpoint,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(createProviderCompletionProxyRequest(provider, modelId, messages)),
    },
    proxyTimeoutMs,
  );

  const rawText = await response.text();
  if (!response.ok) {
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

async function fetchWithTimeout(fetchImpl: typeof fetch, input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export function createDgxVllmRequestBody(modelId: string, messages: ConversationMessage[]) {
  return {
    model: modelId,
    messages: [
      {
        role: "system",
        content: "Answer directly in Korean when the user writes Korean. Do not reveal reasoning or a thinking process.",
      },
      ...messages.slice(-8).map((message) => ({
        role: message.role === "assistant" || message.role === "system" || message.role === "tool" ? message.role : "user",
        content: message.content,
      })),
    ],
    max_tokens: 512,
    temperature: 0.2,
    chat_template_kwargs: {
      enable_thinking: false,
    },
  };
}
