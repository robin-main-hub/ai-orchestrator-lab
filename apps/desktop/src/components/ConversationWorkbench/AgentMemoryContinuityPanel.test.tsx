import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentMemoryContinuityPanel } from "./AgentMemoryContinuityPanel";

describe("AgentMemoryContinuityPanel", () => {
  it("선택 에이전트의 기억 범위와 SOUL/AGENTS 적용 상태를 보여준다", () => {
    const html = renderToStaticMarkup(
      <AgentMemoryContinuityPanel
        adapterStatus="ready"
        agentName="마키마"
        memoryRecordCount={7}
        memoryScope={{
          agentId: "agent_orchestrator",
          namespace: "agent:agent_orchestrator/session:session_desktop_001/provider:provider_mimo_token_openai",
          providerProfileId: "provider_mimo_token_openai",
          recallTraceId: "memory_trace_abc123",
          roomId: "room_session_desktop_001_agent_orchestrator",
          roomLabel: "에이전트 전용 방",
          sessionId: "session_desktop_001",
        }}
        messageCount={12}
        personaAgentsMdApplied={true}
        personaSoulApplied={true}
        toolLabels={["작업 대기열", "승인 확인"]}
      />,
    );

    expect(html).toContain("함께 기억하는 것");
    expect(html).toContain("마키마");
    expect(html).toContain("기억 7개");
    expect(html).toContain("12개 메시지");
    expect(html).toContain("12개 대화 단서");
    expect(html).toContain("SOUL 적용");
    expect(html).toContain("AGENTS 적용");
    expect(html).toContain("에이전트 전용 방 기억 사용");
    expect(html).toContain("조회 흔적 남길 준비됨");
    expect(html).toContain("도구: 작업 대기열, 승인 확인");
    expect(html).toContain("작업 대기열, 승인 확인 참고");
    expect(html).toContain("SOUL 수정");
    expect(html).toContain("AGENTS 수정");
    expect(html).toContain("기억 주입");
    expect(html).toContain("도구 보기");
    expect(html).not.toContain("도구 준비 대기");
    expect(html).not.toContain("session_desktop_001");
    expect(html).not.toContain("provider_mimo_token_openai");
  });
});
