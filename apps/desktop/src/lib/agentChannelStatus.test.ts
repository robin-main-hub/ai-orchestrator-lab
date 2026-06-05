import { describe, expect, it } from "vitest";
import { createAgentChannelDetailChips, createAgentChannelStatus } from "./agentChannelStatus";

describe("createAgentChannelStatus", () => {
  it("summarizes a continuing agent channel with applied memories", () => {
    expect(
      createAgentChannelStatus({
        agentName: "마키마",
        adapterStatus: "ready",
        memoryRecordCount: 7,
        messageCount: 4,
      }),
    ).toEqual({
      title: "마키마 전용 채널",
      continuityLabel: "이전 대화 이어받음 · 4개 메시지",
      memoryLabel: "기억 7개 적용",
      tone: "ready",
    });
  });

  it("summarizes an empty channel without pretending memory is ready", () => {
    expect(
      createAgentChannelStatus({
        agentName: "마키세 크리스",
        adapterStatus: "loading",
        memoryRecordCount: 0,
        messageCount: 0,
      }),
    ).toEqual({
      title: "마키세 크리스 전용 채널",
      continuityLabel: "새 대화 시작",
      memoryLabel: "기억 조회 중",
      tone: "loading",
    });
  });

  it("creates visible continuity chips for scope, provider, and role tools", () => {
    expect(
      createAgentChannelDetailChips({
        memoryScope: {
          agentId: "agent_memory_curator",
          namespace: "agent:agent_memory_curator:session:main:provider:provider_mimo_token_openai",
          providerProfileId: "provider_mimo_token_openai",
          recallTraceId: "recall_agent_memory_curator_session_main_provider_mimo_token_openai",
          sessionId: "session_main",
        },
        modelId: "mimo-v2.5-pro",
        providerProfileId: "provider_mimo_token_openai",
        toolLabels: ["기억 조회", "기억 순위", "기억 정리 요청"],
      }),
    ).toEqual([
      {
        label: "기억 범위",
        tone: "ready",
        value: "agent_memory_curator · session_main",
      },
      {
        label: "Recall Trace",
        tone: "ready",
        value: "recall_agent_memory_curator_session_main_provider_mimo_token_openai",
      },
      {
        label: "Provider",
        tone: "ready",
        value: "provider_mimo_token_openai · mimo-v2.5-pro",
      },
      {
        label: "도구 프로필",
        tone: "ready",
        value: "기억 조회 · 기억 순위 · 기억 정리 요청",
      },
    ]);
  });
});
