import type { ProviderProfile } from "@ai-orchestrator/protocol";

export type ProviderSmokeReadiness = {
  commandLabel: string;
  modeLabel: string;
  routeLabel: string;
  tone: "success" | "warning" | "muted";
};

export type ProviderRoundtripHarness = ProviderSmokeReadiness & {
  networkPolicyLabel: string;
  secretPolicyLabel: string;
  logPolicyLabel: string;
};

export type ProviderRoundtripResultInput = {
  latencyMs?: number;
  providerLabel: string;
  rawMessage?: string;
  status: "ok" | "failed" | "skipped" | "auth_required" | "timeout";
};

export type ProviderRoundtripResultSummary = {
  detail: string;
  label: string;
  tone: "success" | "warning" | "muted";
};

export function createProviderSmokeReadiness(profile: ProviderProfile): ProviderSmokeReadiness | undefined {
  const tags = profile.tags ?? [];
  if (tags.includes("mimo") && tags.includes("openai-compatible")) {
    return {
      commandLabel: "pnpm provider:smoke:ai -- --run-mimo",
      modeLabel: "연결 검증 가능",
      routeLabel: "MiMo OpenAI",
      tone: "success",
    };
  }
  if (tags.includes("mimo") && tags.includes("anthropic-compatible")) {
    return {
      commandLabel: "pnpm provider:smoke:ai",
      modeLabel: "호환성 검증",
      routeLabel: "MiMo Anthropic",
      tone: "warning",
    };
  }
  if (tags.includes("deepseek")) {
    return {
      commandLabel: "pnpm provider:smoke:deepseek",
      modeLabel: "라이브 호출 점검",
      routeLabel: "DeepSeek",
      tone: "success",
    };
  }
  return undefined;
}

export function createProviderRoundtripResultSummary({
  latencyMs,
  providerLabel,
  status,
}: ProviderRoundtripResultInput): ProviderRoundtripResultSummary {
  if (status === "ok") {
    return {
      label: "연결 확인됨",
      detail: `${providerLabel}${latencyMs === undefined ? "" : ` · ${latencyMs}ms`}`,
      tone: "success",
    };
  }
  if (status === "auth_required") {
    return {
      label: "권한 필요",
      detail: `${providerLabel} · 비밀값 확인 필요`,
      tone: "warning",
    };
  }
  if (status === "skipped") {
    return {
      label: "검사 건너뜀",
      detail: `${providerLabel} · 명시 실행 대기`,
      tone: "muted",
    };
  }
  if (status === "timeout") {
    return {
      label: "응답 지연",
      detail: `${providerLabel} · 시간 초과`,
      tone: "warning",
    };
  }
  return {
    label: "연결 실패",
    detail: `${providerLabel} · 공급자 응답 이상`,
    tone: "warning",
  };
}

export function createProviderRoundtripHarness(profile: ProviderProfile): ProviderRoundtripHarness | undefined {
  const tags = profile.tags ?? [];
  if (tags.includes("mimo") && tags.includes("openai-compatible")) {
    return {
      commandLabel: "pnpm provider:smoke:ai -- --run-mimo",
      modeLabel: "연결 검증 준비",
      routeLabel: "MiMo OpenAI",
      networkPolicyLabel: "명시 실행 시 네트워크 호출",
      secretPolicyLabel: profile.secretRef ? "서버 비밀값 참조 필요" : "서버 비밀값 참조 없음",
      logPolicyLabel: "응답 미리보기만 기록",
      tone: "success",
    };
  }
  if (tags.includes("mimo") && tags.includes("anthropic-compatible")) {
    return {
      commandLabel: "pnpm provider:smoke:ai -- --run-all",
      modeLabel: "호환성 검증 준비",
      routeLabel: "MiMo Anthropic",
      networkPolicyLabel: "호환성 점검 우선",
      secretPolicyLabel: profile.secretRef ? "서버 비밀값 참조 필요" : "서버 비밀값 참조 없음",
      logPolicyLabel: "응답 미리보기만 기록",
      tone: "warning",
    };
  }
  if (tags.includes("deepseek")) {
    return {
      commandLabel: "pnpm provider:smoke:deepseek -- --dry-run",
      modeLabel: "라이브 호출 준비",
      routeLabel: "DeepSeek",
      networkPolicyLabel: "기본 모의 실행 · 실제 호출은 명시 실행",
      secretPolicyLabel: profile.secretRef ? "서버 비밀값 참조 필요" : "서버 비밀값 참조 없음",
      logPolicyLabel: "응답 미리보기만 기록",
      tone: "warning",
    };
  }
  return undefined;
}
