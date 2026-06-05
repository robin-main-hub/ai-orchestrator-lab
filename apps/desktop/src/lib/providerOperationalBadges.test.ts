import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import { createDgxVaultSecretRef } from "./helpers";
import { createProviderOperationalBadges } from "./providerOperationalBadges";

function provider(patch: Partial<ProviderProfile>): ProviderProfile {
  return {
    id: patch.id ?? "provider_mimo_token_openai",
    name: patch.name ?? "MiMo Token Plan OpenAI",
    kind: patch.kind ?? "openai",
    baseUrl: patch.baseUrl ?? "https://token-plan-sgp.xiaomimimo.com/v1",
    defaultModel: patch.defaultModel ?? "mimo-v2.5-pro",
    tags: patch.tags ?? ["mimo", "token-plan", "openai-compatible", "server-proxy"],
    trustLevel: patch.trustLevel ?? "limited",
    enabled: patch.enabled ?? true,
    secretRef: patch.secretRef,
    modelDiscoveryEndpoint: patch.modelDiscoveryEndpoint,
  };
}

describe("provider operational badges", () => {
  it("marks MiMo OpenAI profile as the primary shared token-plan route", () => {
    const profiles = [
      provider({
        secretRef: createDgxVaultSecretRef(
          "secret_dgx02_mimo_token_plan",
          "DGX-02 MiMo Token Plan API key",
          "dgx-02:MIMO_API_KEY",
        ),
      }),
      provider({
        id: "provider_mimo_token_anthropic",
        kind: "anthropic",
        name: "MiMo Token Plan Anthropic",
        tags: ["mimo", "token-plan", "anthropic-compatible", "server-proxy"],
        baseUrl: "https://token-plan-sgp.xiaomimimo.com/anthropic",
        secretRef: createDgxVaultSecretRef(
          "secret_dgx02_mimo_token_plan",
          "DGX-02 MiMo Token Plan API key",
          "dgx-02:MIMO_API_KEY",
        ),
      }),
    ];

    expect(createProviderOperationalBadges(profiles[0]!, profiles).map((badge) => badge.label)).toEqual([
      "MiMo",
      "OpenAI 호환",
      "공유 토큰 플랜",
      "기본 에이전트 경로",
    ]);
  });

  it("marks MiMo Anthropic profile as a secondary compatibility route", () => {
    const profile = provider({
      id: "provider_mimo_token_anthropic",
      kind: "anthropic",
      name: "MiMo Token Plan Anthropic",
      tags: ["mimo", "token-plan", "anthropic-compatible", "server-proxy"],
    });

    expect(createProviderOperationalBadges(profile, [profile]).map((badge) => badge.label)).toEqual([
      "MiMo",
      "Anthropic 호환",
      "보조 호환 경로",
    ]);
  });

  it("does not add MiMo-specific badges to unrelated providers", () => {
    expect(
      createProviderOperationalBadges(
        provider({
          id: "provider_openai",
          name: "OpenAI",
          tags: ["openai"],
        }),
        [],
      ),
    ).toEqual([]);
  });
});
