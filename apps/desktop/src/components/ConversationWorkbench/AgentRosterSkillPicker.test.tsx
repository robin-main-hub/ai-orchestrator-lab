import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkbenchAgent } from "../../types";
import { AgentRosterSkillPicker } from "./AgentRosterSkillPicker";

const agents: WorkbenchAgent[] = [
  {
    id: "agent_orchestrator",
    enabled: true,
    kind: "real",
    name: "Orchestrator",
    personaName: "orchestrator",
    role: "orchestrator",
    modelId: "mimo-v2.5-pro",
    providerProfileId: "provider_mimo_token_openai",
    configSource: "markdown",
    soulMode: "summary",
  },
  {
    id: "agent_executor",
    enabled: true,
    kind: "real",
    name: "Executor",
    personaName: "executor",
    role: "executor",
    modelId: "claude-opus-4-8",
    providerProfileId: "provider_apifun_claude",
    configSource: "markdown",
    soulMode: "summary",
  },
];

describe("AgentRosterSkillPicker", () => {
  it("에이전트 선택 전에 이름, 역할, 스킬, 모델 경로를 함께 보여준다", () => {
    const html = renderToStaticMarkup(
      <AgentRosterSkillPicker
        agents={agents}
        messageCountByAgentId={{ agent_executor: 3 }}
        onSelectAgent={() => {}}
        selectedAgentId="agent_executor"
      />,
    );

    expect(html).toContain("대화 동료 선택");
    expect(html).toContain("마키마");
    expect(html).toContain("렘");
    expect(html).toContain("지휘 도구");
    expect(html).toContain("실행 도구");
    expect(html).toContain("작업 대기열");
    expect(html).toContain("Tmux 전달");
    expect(html).toContain("MiMo V2.5 Pro");
    expect(html).toContain("Claude Opus 4.8");
    expect(html).toContain("3개 메시지");
    expect(html).not.toContain("agent_executor");
  });
});
