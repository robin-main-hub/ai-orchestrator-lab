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

const defaultDirectCredentialProviderIds = new Set([
  "provider_mimo_token_openai",
  "provider_mimo_token_anthropic",
]);

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

/** 공급자의 인증 방식을 사람이 읽을 라벨로 (OAuth / API 키 / 기본 인증) */
export function providerAuthLabel(provider: ProviderProfile): string {
  const blob = `${provider.secretRef?.id ?? ""} ${provider.secretRef?.label ?? ""} ${provider.tags.join(" ")} ${provider.authHeader ?? ""}`.toLowerCase();
  if (blob.includes("oauth")) return "OAuth";
  if (provider.apiKeyRef || provider.secretRef) return "API 키";
  return "기본 인증";
}

/** 현재 공급자 외의 사용 가능한(활성·비목업) 저장된 대체 공급자, 신뢰도순 */
export function enabledAlternativeProviders(
  providers: ProviderProfile[],
  selectedProviderId: string,
): ProviderProfile[] {
  return providers
    .filter((provider) => provider.id !== selectedProviderId && provider.enabled && !isMockProvider(provider))
    .sort((a, b) => trustRank(b.trustLevel) - trustRank(a.trustLevel));
}

export function createProviderFailureConversationReply({
  agentDisplayName,
  errorMessage,
  provider,
  providers,
}: {
  agentDisplayName?: string;
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
  const actorLabel = agentDisplayName?.trim() ? `${sanitizePublicText(agentDisplayName.trim())}가` : "선택 에이전트가";

  // 연결이 끊긴 상황(네트워크/타임아웃/공급자/사용량)에서 같은 경로를 재시도하라는
  // 안내는 무의미하다 — 저장된 다른 공급자(다른 API 키/OAuth)로 전환을 1순위로 제안한다.
  const connectionFailure = category === "network" || category === "timeout" || category === "provider" || category === "rate_limit";
  const alternatives = enabledAlternativeProviders(providers, provider.id);

  const directCredentialAvailable = Boolean(category === "network" && provider.tags.includes("server-proxy") && provider.baseUrl);
  const directRetryLabel =
    provider.tags.includes("mimo") || defaultDirectCredentialProviderIds.has(provider.id)
      ? "MiMo 직접 경로 재시도"
      : "현재 공급자 직접 경로 재시도";
  const defaultCredentialHint = directCredentialAvailable
    ? "\n\n참고: 이 공급자에 기본 인증값을 붙여두면 별도 모델/키 설정이 없을 때 같은 경로로도 계속 대화할 수 있어."
    : "";

  let nextAction: string;
  if (connectionFailure && alternatives.length > 0) {
    // 저장된 대체 공급자로 전환 — 인증 방식까지 명시해서 "다른 OAuth/API 키로 붙일까?"
    const choices = alternatives
      .slice(0, 3)
      .map((candidate) => `${candidate.name}(${providerAuthLabel(candidate)})`)
      .join(", ");
    nextAction = `저장된 다른 공급자로 전환해서 붙일까? ${choices} 중 하나로 인증을 바꿔 다시 호출할 수 있어.`;
  } else if (connectionFailure && alternatives.length === 0) {
    // 대체가 아예 없으면: 등록 유도 (+ 가능하면 직접 경로 재시도를 보조로)
    nextAction = directCredentialAvailable
      ? `${directRetryLabel}: 기본 인증값이 연결되어 있으면 DGX 프록시 없이 같은 공급자 경로로 다시 호출해줘. 저장된 대체 공급자가 없으니, 프로바이더 탭에서 다른 API 키나 OAuth를 등록하면 그 경로로도 붙일 수 있어.`
      : `저장된 대체 공급자가 없어. 프로바이더 탭에서 다른 API 키나 OAuth를 등록하면 그 경로로 붙여서 다시 호출할 수 있어.`;
  } else if (plan.status === "available" && plan.candidateProviderId) {
    const candidate = providers.find((entry) => entry.id === plan.candidateProviderId);
    nextAction = `${plan.label}: ${candidate?.name ?? plan.candidateProviderId}(${candidate ? providerAuthLabel(candidate) : "저장된 인증"}) 경로로 붙여서 확인해줘.`;
  } else if (category === "auth" && alternatives.length > 0) {
    const choices = alternatives.slice(0, 3).map((candidate) => `${candidate.name}(${providerAuthLabel(candidate)})`).join(", ");
    nextAction = `${plan.label}: 현재 인증이 막혔으니 ${choices} 같은 저장된 다른 인증으로 붙여서 우회할 수 있어.`;
  } else {
    nextAction = `${plan.label}: ${plan.reason}`;
  }

  return `${actorLabel} ${provider.name} 호출에서 막혔어. 원인은 ${categoryLabel} 계열로 보여.\n\n다음 조치: ${nextAction}${defaultCredentialHint}\n\n공개 오류 요약: ${safeError}`;
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
      label: "현재 공급자 유지",
      reason: "최근 공급자 장애가 없습니다.",
      retryable: false,
      status: "none",
      trustDowngrade: false,
    };
  }

  if (lastErrorCategory === "auth") {
    return {
      label: "권한 점검 필요",
      reason: "인증 오류는 자동 대체 경로보다 비밀값 참조 점검이 우선입니다.",
      retryable: false,
      status: "blocked",
      trustDowngrade: false,
    };
  }

  const selected = providers.find((provider) => provider.id === selectedProviderId);
  const candidate = resolveProviderFallbackCandidate({
    lastErrorCategory,
    providers,
    selectedProviderId,
  });

  if (!candidate) {
    return {
      label: "대체 공급자 없음",
      reason: "활성 대체 후보가 없습니다.",
      retryable: false,
      status: "blocked",
      trustDowngrade: false,
    };
  }

  return {
    candidateProviderId: candidate.id,
    label: "대체 공급자 준비",
    reason: `${providerErrorCategoryLabel(lastErrorCategory)} 장애 시 ${candidate.name} 경로로 재시도 가능`,
    retryable: true,
    status: "available",
    trustDowngrade: selected ? trustRank(candidate.trustLevel) < trustRank(selected.trustLevel) : false,
  };
}

export function resolveProviderFallbackCandidate({
  lastErrorCategory,
  providers,
  selectedProviderId,
}: {
  lastErrorCategory: ProviderErrorCategory;
  providers: ProviderProfile[];
  selectedProviderId: string;
}) {
  if (lastErrorCategory === "auth") {
    return undefined;
  }

  const enabledCandidates = providers.filter(
    (provider) => provider.id !== selectedProviderId && provider.enabled && !isMockProvider(provider),
  );
  const preferredDirectCredential = enabledCandidates.find((provider) => defaultDirectCredentialProviderIds.has(provider.id));
  if (preferredDirectCredential) {
    return preferredDirectCredential;
  }

  const bestRemote = enabledCandidates.sort((a, b) => trustRank(b.trustLevel) - trustRank(a.trustLevel))[0];
  if (bestRemote) {
    return bestRemote;
  }

  return undefined;
}

function isMockProvider(provider: ProviderProfile): boolean {
  return provider.id === "provider_mock_local" || provider.tags.includes("mock");
}

function trustRank(trust: SourceTrust): number {
  if (trust === "trusted") return 3;
  if (trust === "limited") return 2;
  return 1;
}
