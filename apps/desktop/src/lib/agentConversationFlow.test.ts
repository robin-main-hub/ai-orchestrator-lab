import { describe, expect, it } from "vitest";
import { defaultAgentProfiles } from "@ai-orchestrator/agents";
import { createAgentChannelMemoryScope } from "./agentConversationChannels";
import { createAgentConversationFlowCards } from "./agentConversationFlow";

describe("createAgentConversationFlowCards", () => {
  it("summarizes continuity, memory recall, tools, and public trace for every default agent", () => {
    for (const agent of defaultAgentProfiles) {
      const memoryScope = createAgentChannelMemoryScope(agent.id, "session_main", "provider_mimo_token_openai");
      const cards = createAgentConversationFlowCards({
        agent,
        adapterStatus: "ready",
        memoryRecordCount: 12,
        memoryScope,
        modelId: "mimo-v2.5-pro",
        providerProfileId: "provider_mimo_token_openai",
      });

      expect(cards.map((card) => card.id)).toEqual(["channel", "memory", "tools", "trace"]);
      expect(cards[0]?.value).toContain(agent.id);
      expect(cards[0]?.details.join(" ")).toContain(agent.role);
      expect(cards[1]?.details.join(" ")).toContain(memoryScope.recallTraceId);
      expect(cards[1]?.details.join(" ")).toContain("recall query");
      expect(cards[2]?.details.join(" ")).toContain("memory.recall");
      expect(cards[3]?.details.join(" ")).toContain("숨은 사고");
    }
  });

  it("marks memory as manual when the adapter is unavailable", () => {
    const agent = defaultAgentProfiles[0]!;
    const cards = createAgentConversationFlowCards({
      agent,
      adapterStatus: "error",
      memoryRecordCount: 0,
      modelId: "claude-opus-4-8",
      providerProfileId: "provider_apifun_claude",
    });

    const memoryCard = cards.find((card) => card.id === "memory");
    expect(memoryCard?.tone).toBe("error");
    expect(memoryCard?.value).toContain("수동 확인");
  });
});
