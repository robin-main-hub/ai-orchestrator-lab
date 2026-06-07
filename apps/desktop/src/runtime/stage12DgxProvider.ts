import type {
  ApprovalState,
  ConversationMessage,
  PermissionDecision,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderCompletionRoute,
  ProviderCompletionUsage,
  ProviderProfile,
} from "@ai-orchestrator/protocol";
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
  fetchImpl = fetch,
  proxyBaseUrl,
  proxyTimeoutMs = 30_000,
  allowDirectFallback = false,
  approvalState,
  permissionDecision,
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
  fetchImpl = fetch,
  proxyBaseUrl,
  proxyTimeoutMs = 30_000,
  approvalState,
  permissionDecision,
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
    });
  }

  return requestDgxProviderCompletionViaProxyFallback({
    provider,
    modelId,
    messages,
    fetchImpl,
    proxyBaseUrl,
    proxyTimeoutMs,
    approvalState,
    permissionDecision,
  });
}

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

  return request;
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
}: Required<Pick<Stage12DgxCompletionInput, "provider" | "modelId" | "messages" | "fetchImpl" | "proxyTimeoutMs">> &
  Pick<Stage12DgxCompletionInput, "approvalState" | "permissionDecision"> &
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
      });
    } catch (error) {
      if (error instanceof ProviderCompletionPermissionRequiredError) {
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
}: Required<Pick<Stage12DgxCompletionInput, "provider" | "modelId" | "messages" | "fetchImpl" | "proxyBaseUrl" | "proxyTimeoutMs">> &
  Pick<Stage12DgxCompletionInput, "approvalState" | "permissionDecision">): Promise<Stage12DgxCompletionResult> {
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
    messages: createDgxChatMessages(messages),
    max_tokens: 512,
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
