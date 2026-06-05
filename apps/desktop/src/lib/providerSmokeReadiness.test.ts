import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import { createProviderSmokeReadiness } from "./providerSmokeReadiness";

function provider(patch: Partial<ProviderProfile>): ProviderProfile {
  return {
    id: patch.id ?? "provider_mimo_token_openai",
    name: patch.name ?? "MiMo Token Plan OpenAI",
    kind: patch.kind ?? "openai",
    baseUrl: patch.baseUrl ?? "https://token-plan-sgp.xiaomimimo.com/v1",
    defaultModel: patch.defaultModel ?? "mimo-v2.5-pro",
    enabled: patch.enabled ?? true,
    tags: patch.tags ?? ["dgx-secret-ref", "server-proxy", "mimo", "token-plan", "openai-compatible"],
    trustLevel: patch.trustLevel ?? "limited",
    secretRef: patch.secretRef,
  };
}

describe("provider smoke readiness", () => {
  it("marks MiMo OpenAI route as a runnable sample conversation", () => {
    expect(createProviderSmokeReadiness(provider({}))).toEqual({
      commandLabel: "pnpm provider:smoke:ai -- --run-mimo",
      modeLabel: "샘플 대화 가능",
      routeLabel: "MiMo OpenAI",
      tone: "success",
    });
  });

  it("marks MiMo Anthropic route as a compatibility probe", () => {
    expect(
      createProviderSmokeReadiness(
        provider({
          id: "provider_mimo_token_anthropic",
          kind: "anthropic",
          tags: ["dgx-secret-ref", "server-proxy", "mimo", "token-plan", "anthropic-compatible"],
        }),
      ),
    ).toEqual({
      commandLabel: "pnpm provider:smoke:ai",
      modeLabel: "호환성 점검",
      routeLabel: "MiMo Anthropic",
      tone: "warning",
    });
  });

  it("marks DeepSeek as a live provider smoke candidate", () => {
    expect(
      createProviderSmokeReadiness(
        provider({
          id: "provider_deepseek_dgx",
          name: "DeepSeek DGX-02 Key",
          tags: ["dgx-secret-ref", "server-proxy", "deepseek"],
        }),
      ),
    ).toEqual({
      commandLabel: "pnpm provider:smoke:deepseek",
      modeLabel: "라이브 호출 점검",
      routeLabel: "DeepSeek",
      tone: "success",
    });
  });

  it("does not invent smoke commands for unrelated providers", () => {
    expect(
      createProviderSmokeReadiness(
        provider({
          id: "provider_openai_compat",
          tags: ["openai"],
        }),
      ),
    ).toBeUndefined();
  });
});
