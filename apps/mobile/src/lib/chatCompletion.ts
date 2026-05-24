import type { ProviderCompletionRequest, ProviderCompletionResponse } from "@ai-orchestrator/protocol";
import { postJson } from "./api";
import type { MobileSoul } from "../types";

/**
 * Mobile-side chat call. Talks to /provider-completions with the same
 * `ProviderCompletionRequest` schema the desktop uses, so server-side
 * Zod validation (C2) accepts the payload without special-casing mobile.
 *
 * SOUL identity is carried as a system message — until the SOUL → soulMode
 * pipeline is wired into the server, this is the cheapest way to keep the
 * persona consistent across turns without changing the protocol.
 */
export type ChatCompletionParams = {
  sessionId: string;
  soul: MobileSoul;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userText: string;
  providerProfileId?: string;
  modelId?: string;
};

const DEFAULT_PROVIDER_PROFILE = "provider_codex_oauth";
const DEFAULT_MODEL = "codex-session";

export async function requestChatCompletion(
  params: ChatCompletionParams,
): Promise<ProviderCompletionResponse> {
  const now = new Date().toISOString();
  const messages = buildMessages(params);

  const request: ProviderCompletionRequest = {
    id: `mobile_completion_${crypto.randomUUID()}`,
    sessionId: params.sessionId,
    providerProfileId: params.providerProfileId ?? DEFAULT_PROVIDER_PROFILE,
    modelId: params.modelId ?? DEFAULT_MODEL,
    messages,
    source: "mobile",
    routePreference: "server_proxy",
    createdAt: now,
  };

  return postJson<ProviderCompletionResponse>("/provider-completions", request);
}

function buildMessages(params: ChatCompletionParams): ProviderCompletionRequest["messages"] {
  const messages: ProviderCompletionRequest["messages"] = [
    {
      role: "system",
      content: buildSoulSystemPrompt(params.soul),
    },
    ...params.history,
    { role: "user", content: params.userText },
  ];
  return messages;
}

function buildSoulSystemPrompt(soul: MobileSoul): string {
  return [
    `당신은 ${soul.name}입니다.`,
    soul.tagline ? `역할: ${soul.tagline}.` : "",
    "사용자와의 대화에서 이 페르소나를 일관되게 유지합니다.",
    "응답은 한국어로 합니다. 명확하고 짧게.",
  ]
    .filter(Boolean)
    .join(" ");
}
