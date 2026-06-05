import { describe, expect, it } from "vitest";
import { seededAgentProfiles } from "./agents";
import { seededProviderProfiles } from "./providers";

describe("seeded APIFun Claude bindings", () => {
  it("uses the conservative 4.6 model for automatic APIFun Claude A/B bindings", () => {
    const executor = seededAgentProfiles.find((agent) => agent.role === "executor" || agent.id === "agent_executor");
    const researcher = seededAgentProfiles.find((agent) => agent.role === "researcher");
    const claudeA = seededProviderProfiles.find((provider) => provider.id === "provider_apifun_claude");
    const claudeB = seededProviderProfiles.find((provider) => provider.id === "provider_apifun_claude_b");

    expect(claudeA?.defaultModel).toBe("claude-opus-4-6");
    expect(claudeB?.defaultModel).toBe("claude-opus-4-6");
    expect(executor?.providerProfileId).toBe("provider_apifun_claude");
    expect(executor?.modelId).toBe("claude-opus-4-6");
    expect(researcher?.providerProfileId).toBe("provider_apifun_claude_b");
    expect(researcher?.modelId).toBe("claude-opus-4-6");
  });
});
