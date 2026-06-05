import { describe, expect, it } from "vitest";
import type { ModelDiscoverySnapshot, ProviderProfile } from "@ai-orchestrator/protocol";
import type { ModelCatalog } from "../types";
import { createProviderRoutingConsoleItems } from "./providerRoutingConsole";

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

describe("providerRoutingConsole", () => {
  it("summarizes provider routing without exposing base urls or secret refs", () => {
    const profiles = [
      provider({
        secretRef: {
          id: "secret_dgx02_mimo_token_plan",
          label: "DGX-02 MiMo Token Plan API key",
          redactedPreview: "dgx-02:MIMO_API_KEY",
          scope: "profile",
          transient: false,
        },
      }),
      provider({
        id: "provider_apifun_claude",
        name: "APIKey.fun Claude A",
        kind: "anthropic",
        baseUrl: "https://api.apikey.fun",
        defaultModel: "claude-opus-4-8",
        tags: ["dgx-secret-ref", "server-proxy", "apikey.fun", "reseller"],
        trustLevel: "untrusted",
        secretRef: {
          id: "secret_dgx02_apikeyfun_claude_a",
          label: "DGX-02 APIKey.fun Claude A",
          redactedPreview: "dgx-02:ANTHROPIC_API_KEY",
          scope: "profile",
          transient: false,
        },
      }),
    ];
    const modelCatalog: ModelCatalog = {
      provider_mimo_token_openai: [
        {
          id: "mimo-v2.5-pro",
          name: "MiMo V2.5 Pro",
          providerProfileId: "provider_mimo_token_openai",
          contextWindow: 1_000_000,
          supportsStreaming: true,
          supportsTools: true,
          tags: ["mimo"],
        },
      ],
      provider_apifun_claude: [
        {
          id: "claude-opus-4-8",
          name: "Claude Opus 4.8",
          providerProfileId: "provider_apifun_claude",
          contextWindow: 200_000,
          supportsStreaming: true,
          supportsTools: true,
          tags: ["claude"],
        },
      ],
    };
    const discoveryByProviderId: Record<string, ModelDiscoverySnapshot> = {
      provider_mimo_token_openai: {
        id: "discovery_mimo",
        createdAt: "2026-06-05T08:00:00.000Z",
        providerProfileId: "provider_mimo_token_openai",
        models: modelCatalog.provider_mimo_token_openai ?? [],
        redactionApplied: true,
        source: "remote_probe",
        status: "succeeded",
        warnings: [],
      },
    };

    const items = createProviderRoutingConsoleItems({
      agents: [
        { providerProfileId: "provider_mimo_token_openai" },
        { providerProfileId: "provider_mimo_token_openai" },
        { providerProfileId: "provider_apifun_claude" },
      ],
      discoveryByProviderId,
      modelCatalog,
      profiles,
    });
    const serialized = JSON.stringify(items);

    expect(items[0]).toMatchObject({
      assignedAgentCount: 2,
      defaultModelLabel: "mimo-v2.5-pro",
      discoveryLabel: "모델 발견 완료",
      displayName: "MiMo",
      readinessLabel: "샘플 대화 준비",
      secretPolicyLabel: "서버 SecretRef 사용",
    });
    expect(items[1]).toMatchObject({
      assignedAgentCount: 1,
      displayName: "APIKey.fun Claude A",
      trustLabel: "비신뢰",
    });
    expect(serialized).not.toContain("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(serialized).not.toContain("https://api.apikey.fun");
    expect(serialized).not.toContain("MIMO_API_KEY");
    expect(serialized).not.toContain("ANTHROPIC_API_KEY");
  });
});
