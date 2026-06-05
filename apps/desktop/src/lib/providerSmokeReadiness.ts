import type { ProviderProfile } from "@ai-orchestrator/protocol";

export type ProviderSmokeReadiness = {
  commandLabel: string;
  modeLabel: string;
  routeLabel: string;
  tone: "success" | "warning" | "muted";
};

export function createProviderSmokeReadiness(profile: ProviderProfile): ProviderSmokeReadiness | undefined {
  const tags = profile.tags ?? [];
  if (tags.includes("mimo") && tags.includes("openai-compatible")) {
    return {
      commandLabel: "pnpm provider:smoke:ai -- --run-mimo",
      modeLabel: "샘플 대화 가능",
      routeLabel: "MiMo OpenAI",
      tone: "success",
    };
  }
  if (tags.includes("mimo") && tags.includes("anthropic-compatible")) {
    return {
      commandLabel: "pnpm provider:smoke:ai",
      modeLabel: "호환성 점검",
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
