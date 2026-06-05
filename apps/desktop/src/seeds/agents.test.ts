import { describe, expect, it } from "vitest";
import { seededAgentProfiles } from "./agents";
import { seededProviderProfiles } from "./providers";

describe("seeded APIFun Claude bindings", () => {
  it("uses Claude Opus 4.8 for automatic APIFun Claude A/B bindings", () => {
    const executor = seededAgentProfiles.find((agent) => agent.role === "executor" || agent.id === "agent_executor");
    const researcher = seededAgentProfiles.find((agent) => agent.role === "researcher");
    const claudeA = seededProviderProfiles.find((provider) => provider.id === "provider_apifun_claude");
    const claudeB = seededProviderProfiles.find((provider) => provider.id === "provider_apifun_claude_b");

    expect(claudeA?.defaultModel).toBe("claude-opus-4-8");
    expect(claudeB?.defaultModel).toBe("claude-opus-4-8");
    expect(executor?.providerProfileId).toBe("provider_apifun_claude");
    expect(executor?.modelId).toBe("claude-opus-4-8");
    expect(researcher?.providerProfileId).toBe("provider_apifun_claude_b");
    expect(researcher?.modelId).toBe("claude-opus-4-8");
  });
});
