import type { ProviderProfile, SourceTrust } from "@ai-orchestrator/protocol";

export type ProviderErrorCategory = "auth" | "network" | "provider" | "rate_limit" | "timeout";

export type ProviderFallbackPlan = {
  candidateProviderId?: string;
  label: string;
  reason: string;
  retryable: boolean;
  status: "none" | "available" | "blocked";
  trustDowngrade: boolean;
};

export function deriveProviderFallbackPlan({
  lastErrorCategory,
  providers,
  selectedProviderId,
}: {
  lastErrorCategory?: ProviderErrorCategory;
  providers: ProviderProfile[];
  selectedProviderId: string;
}): ProviderFallbackPlan {
  if (!lastErrorCategory) {
    return {
      label: "현재 Provider 유지",
      reason: "최근 Provider 장애가 없습니다.",
      retryable: false,
      status: "none",
      trustDowngrade: false,
    };
  }

  if (lastErrorCategory === "auth") {
    return {
      label: "권한 점검 필요",
      reason: "인증 오류는 자동 fallback보다 SecretRef 점검이 우선입니다.",
      retryable: false,
      status: "blocked",
      trustDowngrade: false,
    };
  }

  const selected = providers.find((provider) => provider.id === selectedProviderId);
  const candidate = providers
    .filter((provider) => provider.id !== selectedProviderId && provider.enabled)
    .sort((a, b) => trustRank(b.trustLevel) - trustRank(a.trustLevel))[0];

  if (!candidate) {
    return {
      label: "대체 Provider 없음",
      reason: "활성 fallback 후보가 없습니다.",
      retryable: false,
      status: "blocked",
      trustDowngrade: false,
    };
  }

  return {
    candidateProviderId: candidate.id,
    label: "대체 Provider 준비",
    reason: `${lastErrorCategory} 장애 시 ${candidate.name} 경로로 재시도 가능`,
    retryable: true,
    status: "available",
    trustDowngrade: selected ? trustRank(candidate.trustLevel) < trustRank(selected.trustLevel) : false,
  };
}

function trustRank(trust: SourceTrust): number {
  if (trust === "trusted") return 3;
  if (trust === "limited") return 2;
  return 1;
}
