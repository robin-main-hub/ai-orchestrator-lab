import { describe, expect, it } from "vitest";
import { createAgentConversationReadiness } from "./agentConversationReadiness";

describe("createAgentConversationReadiness", () => {
  it("marks an agent channel as ready when memory, tools, and conversation exist", () => {
    expect(
      createAgentConversationReadiness({
        adapterStatus: "ready",
        agentId: "agent_orchestrator",
        memoryRecordCount: 6,
        messageCount: 4,
        toolCount: 3,
      }),
    ).toEqual({
      checks: ["전용 채널", "도구 3개", "기억 6개", "대화 4개"],
      label: "연속 대화 준비됨",
      memoryQualityLabel: "장기 기억 품질 양호",
      tone: "ready",
    });
  });

  it("keeps a new but valid channel in warming state", () => {
    expect(
      createAgentConversationReadiness({
        adapterStatus: "ready",
        agentId: "agent_verifier",
        memoryRecordCount: 0,
        messageCount: 0,
        toolCount: 3,
      }),
    ).toMatchObject({
      label: "첫 대화 준비됨",
      memoryQualityLabel: "장기 기억 시작 전",
      tone: "warming",
    });
  });

  it("does not pretend readiness when memory adapter failed", () => {
    expect(
      createAgentConversationReadiness({
        adapterStatus: "error",
        agentId: "agent_memory_curator",
        memoryRecordCount: 0,
        messageCount: 2,
        toolCount: 3,
      }),
    ).toMatchObject({
      label: "기억 연결 확인 필요",
      memoryQualityLabel: "장기 기억 점검 필요",
      tone: "attention",
    });
  });
});
