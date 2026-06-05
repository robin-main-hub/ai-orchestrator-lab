import type { ProviderProfile } from "@ai-orchestrator/protocol";

export type ProviderOperationalBadge = {
  label: string;
  tone: "primary" | "success" | "warning" | "muted";
};

export function createProviderOperationalBadges(
  profile: ProviderProfile,
  profiles: ProviderProfile[],
): ProviderOperationalBadge[] {
  const tags = profile.tags ?? [];
  if (!tags.includes("mimo")) {
    return [];
  }

  const badges: ProviderOperationalBadge[] = [{ label: "MiMo", tone: "primary" }];
  if (tags.includes("openai-compatible")) {
    badges.push({ label: "OpenAI 호환", tone: "success" });
  }
  if (tags.includes("anthropic-compatible")) {
    badges.push({ label: "Anthropic 호환", tone: "warning" });
  }

  const hasSharedTokenPlan = Boolean(
    profile.secretRef?.id &&
      profiles.some((candidate) => candidate.id !== profile.id && candidate.secretRef?.id === profile.secretRef?.id),
  );
  if (hasSharedTokenPlan) {
    badges.push({ label: "공유 토큰 플랜", tone: "warning" });
  }

  if (profile.id === "provider_mimo_token_openai") {
    badges.push({ label: "기본 에이전트 경로", tone: "success" });
  } else if (tags.includes("anthropic-compatible")) {
    badges.push({ label: "보조 호환 경로", tone: "muted" });
  }

  return badges;
}
