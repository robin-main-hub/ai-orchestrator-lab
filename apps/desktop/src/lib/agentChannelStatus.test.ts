import { describe, expect, it } from "vitest";
import { createAgentChannelDetailChips, createAgentChannelStatus } from "./agentChannelStatus";

describe("createAgentChannelStatus", () => {
  it("summarizes a continuing agent channel with applied memories", () => {
    expect(
      createAgentChannelStatus({
        agentName: "마키마",
        roleLabel: "Orchestrator · 지휘자",
        adapterStatus: "ready",
        memoryRecordCount: 7,
        messageCount: 4,
      }),
    ).toEqual({
      title: "마키마 · Orchestrator · 지휘자",
      continuityLabel: "이전 대화 이어받음 · 4개 메시지",
      memoryLabel: "기억 7개 적용",
      tone: "ready",
    });
  });

  it("summarizes an empty channel without pretending memory is ready", () => {
    expect(
      createAgentChannelStatus({
        agentName: "마키세 크리스",
        roleLabel: "Verifier · 검증자",
        adapterStatus: "loading",
        memoryRecordCount: 0,
        messageCount: 0,
      }),
    ).toEqual({
      title: "마키세 크리스 · Verifier · 검증자",
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
        value: "전용 기억 · main",
      },
      {
        label: "기억 추적",
        tone: "ready",
        value: "recall 추적 준비됨",
      },
      {
        label: "공급자",
        tone: "ready",
        value: "MiMo · mimo-v2.5-pro",
      },
      {
        label: "도구 프로필",
        tone: "ready",
        value: "기억 조회 · 기억 순위 · 기억 정리 요청",
      },
    ]);
  });

  it("redacts secret-like values before rendering channel chips", () => {
    const chips = createAgentChannelDetailChips({
      memoryScope: {
        agentId: "agent_executor",
        namespace: "agent:agent_executor/session:session_main/provider:provider_apifun_claude",
        providerProfileId: "provider_apifun_claude",
        recallTraceId: "recall_agent_executor_session_main_provider_apifun_claude",
        sessionId: "session_main",
      },
      modelId: "claude-opus-4-8",
      providerProfileId: "provider_apifun_claude https://token-plan-sgp.xiaomimimo.com/v1 Bearer sk-secret1234567890 tp-secret1234567890",
      toolLabels: ["Tmux 전달", "승인 확인"],
    });

    expect(JSON.stringify(chips)).not.toContain("sk-secret1234567890");
    expect(JSON.stringify(chips)).not.toContain("tp-secret1234567890");
    expect(JSON.stringify(chips)).not.toContain("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(JSON.stringify(chips)).toContain("APIKey.fun");
  });

  it("keeps conversation header chips short and hides raw internal scope ids", () => {
    const chips = createAgentChannelDetailChips({
      memoryScope: {
        agentId: "agent_memory_curator",
        namespace: "agent:agent_memory_curator:session:session_main:provider:provider_mimo_token_openai",
        providerProfileId: "provider_mimo_token_openai",
        recallTraceId: "recall_agent_memory_curator_session_session_main_provider_provider_mimo_token_openai",
        sessionId: "session_main",
      },
      modelId: "mimo-v2.5-pro",
      providerProfileId: "provider_mimo_token_openai",
      toolLabels: ["기억 조회", "기억 순위", "기억 정리 요청", "장기 맥락 요약"],
    });
    const rendered = JSON.stringify(chips);

    expect(rendered).not.toContain("agent:");
    expect(rendered).not.toContain("provider_mimo_token_openai");
    expect(chips.every((chip) => chip.value.length <= 42)).toBe(true);
    expect(chips.find((chip) => chip.label === "공급자")?.value).toContain("mimo-v2.5-pro");
  });
});
