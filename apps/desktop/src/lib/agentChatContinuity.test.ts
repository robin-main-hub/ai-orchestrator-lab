import { describe, expect, it } from "vitest";
import { createAgentChatContinuitySummary } from "./agentChatContinuity";

describe("agent chat continuity summary", () => {
  it("summarizes a continuing agent conversation with applied memories and tools", () => {
    expect(
      createAgentChatContinuitySummary({
        adapterStatus: "ready",
        agentName: "마키마",
        memoryRecordCount: 7,
        messageCount: 4,
        toolLabels: ["작업 대기열", "승인 확인", "Tmux 계획"],
      }),
    ).toEqual({
      detail: "기억 7개 적용 · 4개 메시지 · 도구: 작업 대기열, 승인 확인, Tmux 계획",
      placeholder: "마키마에게 이어서 말 걸기",
      title: "마키마와 이어서 대화",
    });
  });

  it("summarizes a new channel without pretending memory was already recalled", () => {
    expect(
      createAgentChatContinuitySummary({
        adapterStatus: "loading",
        agentName: "마키세 크리스",
        memoryRecordCount: 0,
        messageCount: 0,
        toolLabels: ["테스트 확인"],
      }),
    ).toEqual({
      detail: "기억 조회 중 · 첫 메시지를 보내면 전용 채널에 저장됩니다 · 도구: 테스트 확인",
      placeholder: "마키세 크리스에게 말 걸기",
      title: "마키세 크리스와 새 대화",
    });
  });

  it("redacts secret-like values before rendering chat continuity text", () => {
    const summary = createAgentChatContinuitySummary({
      adapterStatus: "ready",
      agentName: "agent https://token-plan-sgp.xiaomimimo.com/v1",
      memoryRecordCount: 1,
      messageCount: 1,
      toolLabels: ["Bearer sk-secret1234567890", "tp-secret1234567890"],
    });
    const serialized = JSON.stringify(summary);

    expect(serialized).not.toContain("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(serialized).not.toContain("sk-secret1234567890");
    expect(serialized).not.toContain("tp-secret1234567890");
    expect(serialized).toContain("[redacted]");
  });
});
