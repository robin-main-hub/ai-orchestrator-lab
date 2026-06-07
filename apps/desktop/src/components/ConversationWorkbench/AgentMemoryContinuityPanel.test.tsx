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
          sessionId: "session_desktop_001",
        }}
        messageCount={12}
        personaAgentsMdApplied={true}
        personaSoulApplied={true}
      />,
    );

    expect(html).toContain("기억 여권");
    expect(html).toContain("마키마");
    expect(html).toContain("기억 7개");
    expect(html).toContain("12개 메시지");
    expect(html).toContain("SOUL 적용");
    expect(html).toContain("AGENTS 적용");
    expect(html).toContain("recall 추적 준비됨");
  });
});
