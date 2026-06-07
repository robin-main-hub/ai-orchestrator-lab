import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ModelDiscoverySnapshot, ProviderProfile } from "@ai-orchestrator/protocol";
import { ProviderProfilesManagerPanel } from "./ProviderProfilesManagerPanel";
import { createProviderRoutingConsoleItems } from "../lib/providerRoutingConsole";

const profiles: ProviderProfile[] = [
  {
    baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1",
    defaultModel: "mimo-v2.5-pro",
    enabled: true,
    id: "provider_mimo_token_openai",
    kind: "openai",
    name: "MiMo Token Plan OpenAI",
    secretRef: {
      id: "secret_mimo",
      label: "MIMO_API_KEY",
      redactedPreview: "tp-...",
      scope: "profile",
      transient: false,
    },
    tags: ["mimo", "openai-compatible", "server-proxy"],
    trustLevel: "trusted",
  },
];

const discovery: ModelDiscoverySnapshot = {
  createdAt: "2026-06-06T00:00:00.000Z",
  id: "model_discovery_mimo",
  models: [],
  providerProfileId: "provider_mimo_token_openai",
  redactionApplied: true,
  source: "static_fallback",
  status: "succeeded",
  warnings: [],
};

describe("ProviderProfilesManagerPanel labels", () => {
  it("uses Korean copy for counts, discovery actions, trust, and delete titles", () => {
    const routingConsoleItems = createProviderRoutingConsoleItems({
      agents: [{ providerProfileId: "provider_mimo_token_openai" }],
      discoveryByProviderId: { provider_mimo_token_openai: discovery },
      modelCatalog: {
        provider_mimo_token_openai: [
          {
            id: "mimo-v2.5-pro",
            name: "mimo-v2.5-pro",
            providerProfileId: "provider_mimo_token_openai",
            supportsStreaming: true,
            supportsTools: true,
            tags: [],
          },
        ],
      },
      profiles,
    });
    const html = renderToStaticMarkup(
      <ProviderProfilesManagerPanel
        modelCatalog={{
          provider_mimo_token_openai: [
            {
              id: "mimo-v2.5-pro",
              name: "mimo-v2.5-pro",
              providerProfileId: "provider_mimo_token_openai",
              supportsStreaming: true,
              supportsTools: true,
              tags: [],
            },
          ],
        }}
        modelDiscoveryByProviderId={{ provider_mimo_token_openai: discovery }}
        onAddProvider={vi.fn()}
        onDiscoverModels={vi.fn()}
        onRemoveProvider={vi.fn()}
        onRenameProvider={vi.fn()}
        profiles={profiles}
        routingConsoleItems={routingConsoleItems}
        usedProviderIds={new Set(["provider_mimo_token_openai"])}
      />,
    );

    expect(html).toContain("에이전트 1명");
    expect(html).toContain("모델 1개");
    expect(html).toContain("모델 발견 완료");
    expect(html).toContain("시드");
    expect(html).toContain("신뢰");
    expect(html).toContain("모델 다시 확인");
    expect(html).toContain("공급자 이름 변경");
    expect(html).toContain("에이전트가 사용 중이라 삭제할 수 없음");
    expect(html).not.toContain("1 agents");
    expect(html).not.toContain("1 models");
    expect(html).not.toContain("succeeded");
    expect(html).not.toContain("seed");
    expect(html).not.toContain("trusted");
    expect(html).not.toContain("model discovery");
    expect(html).not.toContain("provider 삭제");
    expect(html).not.toContain("agent가 사용 중");
  });
});
