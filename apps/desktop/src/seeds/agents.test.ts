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

  it("binds every seeded agent to the MiMo OpenAI-compatible token-plan provider", () => {
    expect(seededAgentProfiles.length).toBeGreaterThan(0);
    for (const agent of seededAgentProfiles) {
      expect(agent.providerProfileId).toBe("provider_mimo_token_openai");
      expect(agent.modelId).toBe("mimo-v2.5-pro");
      expect(agent.authBinding?.secretRefId).toBe("dgx-02:MIMO_API_KEY");
    }
  });
});
