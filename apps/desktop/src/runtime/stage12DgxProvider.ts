import type { ConversationMessage, ProviderProfile } from "@ai-orchestrator/protocol";

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
};

export type Stage12DgxCompletionResult = {
  content: string;
  endpoint: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export function isDgxVllmProvider(provider?: ProviderProfile) {
  return Boolean(provider?.tags.includes("dgx") && provider.tags.includes("vllm"));
}

export async function requestDgxVllmCompletion({
  provider,
  modelId,
  messages,
  fetchImpl = fetch,
}: Stage12DgxCompletionInput): Promise<Stage12DgxCompletionResult> {
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
    usage: {
      inputTokens: parsed.usage?.prompt_tokens,
      outputTokens: parsed.usage?.completion_tokens,
      totalTokens: parsed.usage?.total_tokens,
    },
  };
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
