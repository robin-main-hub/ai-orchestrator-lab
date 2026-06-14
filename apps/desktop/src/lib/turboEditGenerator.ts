import type {
  ProviderCompletionRequest,
  ProviderCompletionResponse,
} from "@ai-orchestrator/protocol";

/**
 * OSS-H6 — In-app Turbo Edits provider bridge.
 *
 *   - 새 provider 시스템 0: 기존 server proxy + ProviderCompletionRequest 그대로 사용.
 *   - 자동 적용 0: 응답 텍스트만 반환 → 호출자(TurboEditDraftCard)가 validate + 주입.
 *   - 결정적 빌더 / 결정적 응답 파서 — LLM 무관 단위 테스트로 고정.
 */

export type TurboEditGenerationInput = {
  systemPrompt: string;
  userPrompt: string;
};

export type TurboEditGenerationResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export type TurboEditGenerator = (
  input: TurboEditGenerationInput,
) => Promise<TurboEditGenerationResult>;

export type BuildTurboEditCompletionRequestInput = {
  systemPrompt: string;
  userPrompt: string;
  providerProfileId: string;
  modelId: string;
  missionId: string;
  /** 외부에서 결정적으로 시드 — Date.now() / random 호출을 빌더 안에서 하지 않는다. */
  requestId: string;
  createdAt: string;
  /** 응답 토큰 상한 — CodingWorkbench와 동일 기본 8192. */
  maxOutputTokens?: number;
};

export function buildTurboEditCompletionRequest(
  input: BuildTurboEditCompletionRequestInput,
): ProviderCompletionRequest {
  return {
    id: input.requestId,
    sessionId: `mission_turbo_edits_${input.missionId}`,
    providerProfileId: input.providerProfileId,
    modelId: input.modelId,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPrompt },
    ],
    maxOutputTokens: input.maxOutputTokens ?? 8192,
    source: "desktop",
    routePreference: "server_proxy",
    requestContext: { userId: "owner", routeType: "personal", humanInitiated: true },
    createdAt: input.createdAt,
  };
}

/**
 * ProviderCompletionResponse → Turbo Edits 응답 텍스트.
 *
 *   - status="succeeded" + content 있음 → ok: true.
 *   - 그 외(succeeded=false, content 없음, error 있음) → ok: false + 사람용 사유.
 *   - 응답 자체를 정상으로 위장하지 않음 — 실패는 실패로 그대로.
 */
export function parseTurboEditGeneratorResponse(
  response: ProviderCompletionResponse,
): TurboEditGenerationResult {
  if (response.status !== "succeeded") {
    return {
      ok: false,
      reason: response.error?.trim() || `provider 응답 상태=${response.status}`,
    };
  }
  const text = response.content?.trim();
  if (!text) {
    return { ok: false, reason: "응답 본문이 비어 있음" };
  }
  return { ok: true, text };
}

export type CreateTurboEditGeneratorDeps = {
  providerProfileId: string;
  modelId: string;
  missionId: string;
  serverBaseUrl?: string | string[];
  requestCompletion: (
    request: ProviderCompletionRequest,
    opts?: { serverBaseUrl?: string | string[]; fetchImpl?: typeof fetch },
  ) => Promise<ProviderCompletionResponse>;
  fetchImpl?: typeof fetch;
  /** 결정적 ID 시드 — 테스트에서 override. 기본은 timestamp + 짧은 random. */
  newRequestId?: () => string;
  /** 결정적 시각 — 테스트에서 override. */
  now?: () => string;
};

export function createTurboEditGenerator(deps: CreateTurboEditGeneratorDeps): TurboEditGenerator {
  const newRequestId =
    deps.newRequestId ??
    (() => `creq_turbo_${deps.missionId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const now = deps.now ?? (() => new Date().toISOString());

  return async (input) => {
    const request = buildTurboEditCompletionRequest({
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      providerProfileId: deps.providerProfileId,
      modelId: deps.modelId,
      missionId: deps.missionId,
      requestId: newRequestId(),
      createdAt: now(),
    });
    let response: ProviderCompletionResponse;
    try {
      response = await deps.requestCompletion(request, {
        serverBaseUrl: deps.serverBaseUrl,
        fetchImpl: deps.fetchImpl,
      });
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
    return parseTurboEditGeneratorResponse(response);
  };
}
