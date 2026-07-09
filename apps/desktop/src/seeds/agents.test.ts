import { describe, expect, it } from "vitest";
import { seededAgentProfiles } from "./agents";
import { seededModelCatalog, seededProviderProfiles } from "./providers";

describe("seeded MiMo Token Plan bindings", () => {
  it("registers both OpenAI and Anthropic compatible MiMo token-plan providers without raw secrets", () => {
    const mimoOpenAi = seededProviderProfiles.find((provider) => provider.id === "provider_mimo_token_openai");
    const mimoAnthropic = seededProviderProfiles.find((provider) => provider.id === "provider_mimo_token_anthropic");

    expect(mimoOpenAi?.baseUrl).toBe("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(mimoOpenAi?.defaultModel).toBe("mimo-v2.5-pro");
    expect(mimoOpenAi?.secretRef?.redactedPreview).toBe("dgx-02:MIMO_API_KEY");
    expect(mimoOpenAi?.secretRef?.redactedPreview).not.toContain("tp-");
    expect(mimoAnthropic?.baseUrl).toBe("https://token-plan-sgp.xiaomimimo.com/anthropic");
    expect(mimoAnthropic?.defaultModel).toBe("mimo-v2.5-pro");
    expect(seededModelCatalog.provider_mimo_token_openai?.map((model) => model.id)).toContain("mimo-v2.5-pro");
    expect(seededModelCatalog.provider_mimo_token_anthropic?.map((model) => model.id)).toContain("mimo-v2.5-pro");
  });

  it("registers the RecursiveMAS latent-engine provider for the goal loop", () => {
    const rmas = seededProviderProfiles.find((provider) => provider.id === "provider_rmas_dgx02");

    expect(rmas?.baseUrl).toBe("http://100.71.215.84:4041/v1");
    expect(rmas?.defaultModel).toBe("rmas-sequential-light");
    expect(rmas?.trustLevel).toBe("trusted");
    expect(rmas?.secretRef).toBeUndefined();
    expect(seededModelCatalog.provider_rmas_dgx02?.map((model) => model.id)).toContain("rmas-sequential-light");
  });

  it("does not expose mock providers or mock models in runtime seeds", () => {
    expect(seededProviderProfiles.some((provider) => provider.id === "provider_mock_local")).toBe(false);
    expect(seededProviderProfiles.some((provider) => provider.tags.includes("mock"))).toBe(false);
    expect(seededModelCatalog.provider_mock_local).toBeUndefined();
    expect(Object.values(seededModelCatalog).flat().some((model) => model.id.startsWith("mock-"))).toBe(false);
  });

  it("binds every seeded agent to the MiMo OpenAI-compatible token-plan provider", () => {
    expect(seededAgentProfiles.length).toBeGreaterThan(0);
    for (const agent of seededAgentProfiles) {
      expect(agent.providerProfileId).toBe("provider_mimo_token_openai");
      expect(agent.modelId).toBe("mimo-v2.5-pro");
      expect(agent.authBinding?.secretRefId).toBe("dgx-02:MIMO_API_KEY");
    }
  });
});
