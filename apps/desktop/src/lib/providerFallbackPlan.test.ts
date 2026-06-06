import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import { deriveProviderFallbackPlan } from "./providerFallbackPlan";

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
});
