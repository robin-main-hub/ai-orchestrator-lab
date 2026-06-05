import type { ModelDiscoverySnapshot, ProviderProfile, SourceTrust } from "@ai-orchestrator/protocol";
import type { ModelCatalog } from "../types";
import { providerDisplayLabel } from "./helpers";
import { createProviderRoundtripHarness, createProviderSmokeReadiness } from "./providerSmokeReadiness";

export type ProviderRoutingConsoleTone = "success" | "warning" | "danger" | "muted";

export type ProviderRoutingConsoleAgent = {
  providerProfileId?: string;
};

export type ProviderRoutingConsoleItem = {
  assignedAgentCount: number;
  defaultModelLabel: string;
  discoveryLabel: string;
  discoveryTone: ProviderRoutingConsoleTone;
  displayName: string;
  enabledLabel: string;
  enabledTone: ProviderRoutingConsoleTone;
  modelCount: number;
  providerId: string;
  readinessLabel: string;
  readinessTone: ProviderRoutingConsoleTone;
  routeLabel: string;
  secretPolicyLabel: string;
  trustLabel: string;
  trustTone: ProviderRoutingConsoleTone;
};

export type ProviderRoutingConsoleInput = {
  agents: ProviderRoutingConsoleAgent[];
  discoveryByProviderId: Record<string, ModelDiscoverySnapshot | undefined>;
  modelCatalog: ModelCatalog;
  profiles: ProviderProfile[];
};

export function createProviderRoutingConsoleItems({
  agents,
  discoveryByProviderId,
  modelCatalog,
  profiles,
}: ProviderRoutingConsoleInput): ProviderRoutingConsoleItem[] {
  return profiles.map((profile) => {
    const discovery = discoveryByProviderId[profile.id];
    const readiness = createProviderSmokeReadiness(profile);
    const harness = createProviderRoundtripHarness(profile);
    const assignedAgentCount = agents.filter((agent) => agent.providerProfileId === profile.id).length;
    const defaultModelLabel = sanitizeProviderConsoleText(profile.defaultModel || "모델 미지정");
    const modelCount = modelCatalog[profile.id]?.length ?? 0;

    return {
      assignedAgentCount,
      defaultModelLabel,
      discoveryLabel: discoveryLabelFor(discovery?.status),
      discoveryTone: discoveryToneFor(discovery?.status),
      displayName: providerConsoleDisplayName(profile),
      enabledLabel: profile.enabled ? "사용 가능" : "비활성",
      enabledTone: profile.enabled ? "success" : "muted",
      modelCount,
      providerId: sanitizeProviderConsoleText(profile.id),
      readinessLabel: harness?.modeLabel ?? readiness?.modeLabel ?? "수동 점검",
      readinessTone: readinessToneFor(readiness?.tone),
      routeLabel: sanitizeProviderConsoleText(readiness?.routeLabel ?? routeLabelFor(profile)),
      secretPolicyLabel: secretPolicyLabelFor(harness?.secretPolicyLabel, Boolean(profile.secretRef)),
      trustLabel: trustLabelFor(profile.trustLevel),
      trustTone: trustToneFor(profile.trustLevel),
    };
  });
}

export function sanitizeProviderConsoleText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'`<>)]+/gi, "redacted_url")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, "Bearer redacted_token")
    .replace(/sk-[A-Za-z0-9_-]{8,}/gi, "redacted_key")
    .replace(/tp-[A-Za-z0-9_-]{8,}/gi, "redacted_token")
    .replace(/\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|KEY))\b/g, "redacted_secret_name")
    .replace(/\/Users\/[^\s"'`<>)]+/g, "redacted_path");
}

function discoveryLabelFor(status: ModelDiscoverySnapshot["status"] | undefined): string {
  if (status === "succeeded") return "모델 발견 완료";
  if (status === "loading") return "모델 확인 중";
  if (status === "failed") return "모델 확인 실패";
  if (status === "blocked") return "모델 확인 차단";
  return "시드 모델 사용";
}

function discoveryToneFor(status: ModelDiscoverySnapshot["status"] | undefined): ProviderRoutingConsoleTone {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "blocked") return "danger";
  if (status === "loading") return "warning";
  return "muted";
}

function readinessToneFor(tone: "success" | "warning" | "muted" | undefined): ProviderRoutingConsoleTone {
  if (tone === "success") return "success";
  if (tone === "warning") return "warning";
  return "muted";
}

function routeLabelFor(profile: ProviderProfile): string {
  const tags = profile.tags ?? [];
  if (tags.includes("server-proxy")) return "서버 프록시";
  if (tags.includes("oauth")) return "OAuth 세션";
  if (tags.includes("vllm")) return "로컬 vLLM";
  return "직접 경로";
}

function providerConsoleDisplayName(profile: ProviderProfile): string {
  const tags = profile.tags ?? [];
  if (tags.includes("apikey.fun")) {
    return sanitizeProviderConsoleText(profile.name);
  }
  return sanitizeProviderConsoleText(providerDisplayLabel(profile.name));
}

function trustLabelFor(trust: SourceTrust): string {
  if (trust === "trusted") return "신뢰";
  if (trust === "limited") return "제한 신뢰";
  return "비신뢰";
}

function trustToneFor(trust: SourceTrust): ProviderRoutingConsoleTone {
  if (trust === "trusted") return "success";
  if (trust === "limited") return "warning";
  return "danger";
}

function secretPolicyLabelFor(label: string | undefined, hasSecretRef: boolean): string {
  if (!hasSecretRef) return "비밀값 없음";
  if (!label) return "서버 SecretRef 사용";
  if (label.includes("SecretRef")) return "서버 SecretRef 사용";
  return sanitizeProviderConsoleText(label);
}
