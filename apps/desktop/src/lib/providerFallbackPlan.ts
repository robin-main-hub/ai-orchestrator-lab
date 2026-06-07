import type { ProviderProfile, SourceTrust } from "@ai-orchestrator/protocol";
import { sanitizePublicText } from "./publicRedaction";

export type ProviderErrorCategory = "auth" | "network" | "provider" | "rate_limit" | "timeout";

export type ProviderFallbackPlan = {
  candidateProviderId?: string;
  label: string;
  reason: string;
  retryable: boolean;
  status: "none" | "available" | "blocked";
  trustDowngrade: boolean;
};

export function inferProviderErrorCategory(message: string): ProviderErrorCategory {
  const normalized = message.toLowerCase();
  if (normalized.includes("unauthorized") || normalized.includes("forbidden") || /\b(401|403)\b/.test(normalized)) {
    return "auth";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many requests") || /\b429\b/.test(normalized)) {
    return "rate_limit";
  }
  if (normalized.includes("timeout") || normalized.includes("timed out") || normalized.includes("aborted")) {
    return "timeout";
  }
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("econnrefused") ||
    normalized.includes("enotfound")
  ) {
    return "network";
  }
  return "provider";
}

export function providerErrorCategoryLabel(category: ProviderErrorCategory) {
  if (category === "auth") return "권한";
  if (category === "network") return "네트워크";
  if (category === "rate_limit") return "사용량 제한";
  if (category === "timeout") return "응답 지연";
  return "공급자";
}

export function createProviderFailureConversationReply({
  errorMessage,
  provider,
  providers,
}: {
  errorMessage: string;
  provider: ProviderProfile;
  providers: ProviderProfile[];
}) {
  const category = inferProviderErrorCategory(errorMessage);
  const plan = deriveProviderFallbackPlan({
    lastErrorCategory: category,
    providers,
    selectedProviderId: provider.id,
  });
  const safeError = sanitizePublicText(errorMessage);
  const categoryLabel = providerErrorCategoryLabel(category);
  const nextAction =
    plan.status === "available" && plan.candidateProviderId
      ? `${plan.label}: ${providers.find((candidate) => candidate.id === plan.candidateProviderId)?.name ?? plan.candidateProviderId} 경로를 확인해줘.`
      : `${plan.label}: ${plan.reason}`;

  return `${provider.name} 호출이 막혔어. 원인은 ${categoryLabel} 계열로 보여.\n\n다음 조치: ${nextAction}\n\n공개 오류 요약: ${safeError}`;
}

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
