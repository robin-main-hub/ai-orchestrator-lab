import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import {
  createProviderFailureConversationReply,
  deriveProviderFallbackPlan,
  inferProviderErrorCategory,
  resolveProviderFallbackCandidate,
} from "./providerFallbackPlan";

function provider(patch: Partial<ProviderProfile>): ProviderProfile {
  return {
    id: patch.id ?? "provider_primary",
    name: patch.name ?? "Primary",
    kind: patch.kind ?? "openai",
    baseUrl: patch.baseUrl,
    defaultModel: patch.defaultModel ?? "model-primary",
    enabled: patch.enabled ?? true,
    tags: patch.tags ?? ["server-proxy"],
    trustLevel: patch.trustLevel ?? "trusted",
    secretRef: patch.secretRef,
  };
}

describe("providerFallbackPlan", () => {
  it("장애가 없으면 fallback을 활성화하지 않는다", () => {
    const plan = deriveProviderFallbackPlan({
      providers: [provider({ id: "provider_primary" }), provider({ id: "provider_backup" })],
      selectedProviderId: "provider_primary",
    });

    expect(plan.status).toBe("none");
    expect(plan.candidateProviderId).toBeUndefined();
    expect(plan.retryable).toBe(false);
  });

  it("네트워크/timeout 장애는 신뢰 가능한 대체 공급자를 제안한다", () => {
    const plan = deriveProviderFallbackPlan({
      lastErrorCategory: "timeout",
      providers: [
        provider({ id: "provider_primary", trustLevel: "trusted" }),
        provider({ id: "provider_limited", trustLevel: "limited" }),
        provider({ id: "provider_backup", trustLevel: "trusted" }),
      ],
      selectedProviderId: "provider_primary",
    });

    expect(plan.status).toBe("available");
    expect(plan.candidateProviderId).toBe("provider_backup");
    expect(plan.label).toBe("대체 공급자 준비");
    expect(plan.reason).toContain("응답 지연 장애");
    expect(plan.retryable).toBe(true);
  });

  it("인증 오류는 자동 재시도하지 않고 비밀값 점검을 요구한다", () => {
    const plan = deriveProviderFallbackPlan({
      lastErrorCategory: "auth",
      providers: [provider({ id: "provider_primary" }), provider({ id: "provider_backup" })],
      selectedProviderId: "provider_primary",
    });

    expect(plan.status).toBe("blocked");
    expect(plan.retryable).toBe(false);
    expect(plan.label).toBe("권한 점검 필요");
  });

  it("네트워크 장애에서도 Mock Local Provider를 대화 대체 경로로 고르지 않는다", () => {
    const candidate = resolveProviderFallbackCandidate({
      lastErrorCategory: "network",
      providers: [
        provider({ id: "provider_mimo_token_openai", trustLevel: "limited" }),
        provider({ id: "provider_openai_compat", name: "OpenAI 호환", trustLevel: "trusted" }),
        provider({ id: "provider_mock_local", name: "Mock Local Provider", trustLevel: "trusted" }),
      ],
      selectedProviderId: "provider_mimo_token_openai",
    });

    expect(candidate?.id).toBe("provider_openai_compat");
  });

  it("fetch 실패를 네트워크 장애로 분류한다", () => {
    expect(inferProviderErrorCategory("http://dgx-02:4317: Failed to fetch")).toBe("network");
    expect(inferProviderErrorCategory("request timed out after 30000ms")).toBe("timeout");
    expect(inferProviderErrorCategory("401 unauthorized")).toBe("auth");
    expect(inferProviderErrorCategory("429 rate limit")).toBe("rate_limit");
  });

  it("대화 실패 답변에서 원본 URL을 마스킹하고 Mock 대체를 제안하지 않는다", () => {
    const reply = createProviderFailureConversationReply({
      agentDisplayName: "마키마",
      errorMessage: "http://dgx-02:4317: Failed to fetch",
      provider: provider({
        baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1",
        id: "provider_mimo_token_openai",
        name: "MiMo Token Plan OpenAI",
        tags: ["server-proxy", "mimo", "openai-compatible"],
      }),
      providers: [
        provider({
          baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1",
          id: "provider_mimo_token_openai",
          name: "MiMo Token Plan OpenAI",
          tags: ["server-proxy", "mimo", "openai-compatible"],
        }),
        provider({ id: "provider_mock_local", name: "Mock Local Provider", trustLevel: "trusted" }),
      ],
    });

    expect(reply).toContain("마키마가");
    expect(reply).toContain("MiMo Token Plan OpenAI 호출에서 막혔어");
    expect(reply).toContain("네트워크");
    expect(reply).toContain("MiMo 직접 경로 재시도");
    expect(reply).toContain("기본 인증값");
    expect(reply).not.toContain("Mock");
    expect(reply).not.toContain("http://dgx-02:4317");
    expect(reply).not.toContain("Provider");
    expect(reply).not.toContain("fallback");
    expect(reply).toContain("[redacted:url]");
  });

  it("서버 프록시 네트워크 장애에는 기본 API 키 연결을 안내한다", () => {
    const reply = createProviderFailureConversationReply({
      agentDisplayName: "마키마",
      errorMessage: "http://dgx-02:4317: Failed to fetch",
      provider: provider({
        baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1",
        id: "provider_mimo_token_openai",
        name: "MiMo Token Plan OpenAI",
        tags: ["server-proxy", "mimo", "openai-compatible"],
      }),
      providers: [provider({ id: "provider_mimo_token_openai", name: "MiMo Token Plan OpenAI" })],
    });

    expect(reply).toContain("기본 API 키 연결");
    expect(reply).toContain("별도 모델/키 설정이 없을 때 이 경로로 계속 대화");
    expect(reply).not.toContain("http://dgx-02:4317");
  });
});
