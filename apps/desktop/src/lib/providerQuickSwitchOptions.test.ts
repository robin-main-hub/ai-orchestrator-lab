import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "@ai-orchestrator/protocol";
import { selectQuickSwitchProviders } from "./providerQuickSwitchOptions";

function provider(patch: Partial<ProviderProfile> & Pick<ProviderProfile, "id" | "name">): ProviderProfile {
  return {
    enabled: true,
    kind: "openai",
    tags: [],
    trustLevel: "limited",
    ...patch,
  };
}

describe("provider quick switch options", () => {
  it("기본 API 키, OAuth, 서버 secretRef가 있는 공급자만 빠른 전환에 노출한다", () => {
    const providers = [
      provider({ id: "provider_mock_local", name: "Mock Local Provider", kind: "custom", tags: ["mock"] }),
      provider({ id: "provider_mimo_token_openai", name: "MiMo Token Plan OpenAI", tags: ["mimo"] }),
      provider({ id: "provider_grok_oauth", name: "Grok OAuth", tags: ["oauth"] }),
      provider({
        id: "provider_apifun_claude",
        name: "APIKey.fun Claude A",
        secretRef: {
          id: "secret_claude",
          label: "Claude",
          redactedPreview: "dgx-02:ANTHROPIC_API_KEY",
          scope: "profile",
          transient: false,
        },
      }),
      provider({ id: "provider_placeholder", name: "Placeholder API" }),
    ];

    expect(
      selectQuickSwitchProviders({
        defaultCredentialProviderIds: new Set(["provider_mimo_token_openai"]),
        providers,
      }).map((item) => item.id),
    ).toEqual(["provider_mimo_token_openai", "provider_grok_oauth", "provider_apifun_claude"]);
  });

  it("현재 선택된 공급자는 인증이 아직 없어도 전환 목록에 남긴다", () => {
    expect(
      selectQuickSwitchProviders({
        defaultCredentialProviderIds: new Set(),
        providers: [
          provider({ id: "provider_placeholder", name: "Placeholder API" }),
          provider({ id: "provider_mock_local", name: "Mock Local Provider", kind: "custom", tags: ["mock"] }),
        ],
        selectedProviderId: "provider_placeholder",
      }).map((item) => item.id),
    ).toEqual(["provider_placeholder"]);
  });
});
