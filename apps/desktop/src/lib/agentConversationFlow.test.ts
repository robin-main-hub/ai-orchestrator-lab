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
      expect(cards[0]?.details.join(" ")).toContain("역할:");
      expect(cards[0]?.details.join(" ")).toContain("공급자:");
      expect(cards[0]?.details.join(" ")).toContain("모델:");
      expect(cards[0]?.details.join(" ")).not.toContain("role=");
      expect(cards[0]?.details.join(" ")).not.toContain("provider=");
      expect(cards[0]?.details.join(" ")).not.toContain("model=");
      expect(cards[1]?.details.join(" ")).toContain(`에이전트 ${memoryScope.agentId} / 세션 ${memoryScope.sessionId}`);
      expect(cards[1]?.details.join(" ")).toContain("대화 맥락 기반 기억 조회 준비");
      expect(cards[1]?.details.join(" ")).toContain("기억 원문은 채팅 화면에 직접 노출하지 않음");
      expect(cards[1]?.details.join(" ")).toContain("신뢰 공급자가 아니면 장기 기억 자동 주입은 수동 확인");
      expect(cards[1]?.details.join(" ")).not.toContain(memoryScope.recallTraceId);
      expect(cards[2]?.details.join(" ")).not.toMatch(/\b[a-z]+\\.[a-z]+\b/);
      expect(cards[2]?.details.join(" ")).toContain("도구 호출 전 목적·입력·권한을 먼저 요약");
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
    expect(memoryCard?.value).toContain("수동 확인");
  });
});
