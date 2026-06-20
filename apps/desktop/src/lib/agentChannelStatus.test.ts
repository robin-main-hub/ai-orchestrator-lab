import { describe, expect, it } from "vitest";
import {
  createAgentChannelDetailChips,
  createAgentChannelHeaderMemoryLabel,
  createAgentChannelStatus,
} from "./agentChannelStatus";
import { compactPublicText, sanitizePublicText } from "./publicRedaction";

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
          roomId: "room_session_main_agent_memory_curator",
          roomLabel: "에이전트 전용 방",
          sessionId: "session_main",
        },
        modelId: "mimo-v2.5-pro",
        personaAgentsMdApplied: true,
        personaSoulApplied: true,
        providerProfileId: "provider_mimo_token_openai",
        toolLabels: ["기억 조회", "기억 순위", "기억 정리 요청"],
      }),
    ).toEqual([
      {
        label: "인격 설정",
        tone: "ready",
        value: "SOUL 적용 · AGENTS 적용",
      },
      {
        label: "기억 범위",
        tone: "ready",
        value: "에이전트 전용 방 · main",
      },
      {
        label: "기억 추적",
        tone: "ready",
        value: "기억 조회 추적 준비됨",
      },
      {
        label: "공급자",
        tone: "ready",
        value: "MiMo · MiMo V2.5 Pro",
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
        roomId: "room_session_main_agent_executor",
        roomLabel: "에이전트 전용 방",
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
        roomId: "room_session_main_agent_memory_curator",
        roomLabel: "에이전트 전용 방",
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
    expect(chips.find((chip) => chip.label === "공급자")?.value).toContain("MiMo V2.5 Pro");
  });
});

// Characterization tests (no behavior change) for the previously-unasserted export
// createAgentChannelHeaderMemoryLabel. The blocks above drive createAgentChannelStatus
// and the detail-chip builder, but never the one-line header memory label the channel
// header renders next to the title. Load-bearing contract:
//   - no scope -> undefined (the header simply omits the label, never shows an empty pill);
//   - with a scope it renders "<roomLabel> 기억", defaulting roomLabel to "전용 기억";
//   - it runs through the SAME sanitize+compact(42) leaf the chips use, so it is
//     redaction-safe (secret-like room labels never survive) AND length-capped at 42 —
//     expected values are derived from the exported sanitizePublicText/compactPublicText
//     so the test stays self-consistent with the leaf without reaching the private helper.
describe("createAgentChannelHeaderMemoryLabel", () => {
  const sanitizeChannelValue = (value: string) => compactPublicText(sanitizePublicText(value), 42);
  const scope = (roomLabel?: string) => ({
    agentId: "agent_memory_curator",
    namespace: "agent:agent_memory_curator:session:session_main:provider:provider_mimo_token_openai",
    providerProfileId: "provider_mimo_token_openai",
    recallTraceId: "recall_agent_memory_curator_session_main",
    roomId: "room_session_main_agent_memory_curator",
    roomLabel,
    sessionId: "session_main",
  });

  it("omits the label entirely when there is no memory scope", () => {
    expect(createAgentChannelHeaderMemoryLabel(undefined)).toBeUndefined();
  });

  it("renders '<roomLabel> 기억' through the shared sanitize+compact leaf", () => {
    const label = createAgentChannelHeaderMemoryLabel(scope("에이전트 전용 방"));
    expect(label).toBe(sanitizeChannelValue("에이전트 전용 방 기억"));
    expect(label).toContain("기억");
  });

  it("defaults a missing roomLabel to '전용 기억'", () => {
    expect(createAgentChannelHeaderMemoryLabel(scope(undefined))).toBe(sanitizeChannelValue("전용 기억 기억"));
  });

  it("stays redaction-safe and length-capped at 42 like the chips", () => {
    const label = createAgentChannelHeaderMemoryLabel(
      scope("https://token-plan-sgp.xiaomimimo.com/v1 Bearer sk-secret1234567890 방"),
    );
    expect(label).toBeDefined();
    expect(label!.length).toBeLessThanOrEqual(42);
    expect(label).not.toContain("sk-secret1234567890");
    expect(label).not.toContain("https://token-plan-sgp.xiaomimimo.com/v1");
  });
});
