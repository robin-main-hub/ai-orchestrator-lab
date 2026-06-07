import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import {
  createProviderFailureConversationReply,
  deriveProviderFallbackPlan,
  inferProviderErrorCategory,
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

  it("네트워크/timeout 장애는 신뢰 가능한 대체 provider를 제안한다", () => {
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
    expect(plan.label).toBe("대체 Provider 준비");
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

  it("fetch 실패를 네트워크 장애로 분류한다", () => {
    expect(inferProviderErrorCategory("http://dgx-02:4317: Failed to fetch")).toBe("network");
    expect(inferProviderErrorCategory("request timed out after 30000ms")).toBe("timeout");
    expect(inferProviderErrorCategory("401 unauthorized")).toBe("auth");
    expect(inferProviderErrorCategory("429 rate limit")).toBe("rate_limit");
  });

  it("대화 실패 답변에서 원본 URL을 마스킹하고 다음 조치를 제안한다", () => {
    const reply = createProviderFailureConversationReply({
      errorMessage: "http://dgx-02:4317: Failed to fetch",
      provider: provider({ id: "provider_primary", name: "MiMo Token Plan OpenAI" }),
      providers: [
        provider({ id: "provider_primary", name: "MiMo Token Plan OpenAI" }),
        provider({ id: "provider_backup", name: "Mock 안전 경로", trustLevel: "trusted" }),
      ],
    });

    expect(reply).toContain("MiMo Token Plan OpenAI 호출이 막혔어");
    expect(reply).toContain("네트워크");
    expect(reply).toContain("대체 Provider 준비");
    expect(reply).toContain("Mock 안전 경로");
    expect(reply).not.toContain("http://dgx-02:4317");
    expect(reply).toContain("[redacted:url]");
  });
});
