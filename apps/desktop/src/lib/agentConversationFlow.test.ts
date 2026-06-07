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
      expect(cards[0]?.value).not.toContain(agent.id);
      expect(cards[0]?.details.join(" ")).not.toContain(agent.role);
      expect(cards[0]?.details.join(" ")).toContain("맡은 자리:");
      expect(cards[0]?.details.join(" ")).toContain("공급자 연결됨");
      expect(cards[0]?.details.join(" ")).toContain("연결");
      expect(cards[0]?.details.join(" ")).toContain("로 대화");
      expect(cards[0]?.details.join(" ")).not.toContain("role=");
      expect(cards[0]?.details.join(" ")).not.toContain("provider=");
      expect(cards[0]?.details.join(" ")).not.toContain("model=");
      expect(cards[0]?.details.join(" ")).not.toContain("provider_mimo_token_openai");
      expect(cards[0]?.details.join(" ")).toContain("에이전트 전용 방");
      expect(cards[1]?.details.join(" ")).toContain("에이전트 전용 방 기억만 참고");
      expect(cards[1]?.details.join(" ")).not.toContain(memoryScope.agentId);
      expect(cards[1]?.details.join(" ")).not.toContain(memoryScope.providerProfileId);
      expect(cards[1]?.details.join(" ")).toContain("대화 맥락 기반 기억 조회 준비");
      expect(cards[1]?.details.join(" ")).toContain("필요한 단서만 답변에 반영");
      expect(cards[1]?.details.join(" ")).toContain("장기 기억 자동 주입은 신뢰 상태에 맞춰 조심스럽게 처리");
      expect(cards[1]?.details.join(" ")).not.toContain(memoryScope.recallTraceId);
      expect(cards[2]?.details.join(" ")).not.toMatch(/\b[a-z]+\.[a-z]+\b/);
      expect(cards[2]?.details.join(" ")).toContain("호출 전 목적·입력·권한을 먼저 맞춤");
      expect(cards[2]?.details.join(" ")).not.toContain("tool.call");
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
    expect(memoryCard?.value).toContain("함께 확인 필요");
    expect(cards.flatMap((card) => card.details).join(" ")).not.toContain("provider_apifun_claude");
  });
});
