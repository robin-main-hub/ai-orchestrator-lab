import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AgentConfigFile } from "../../types";
import { AgentSkillProfilePanel } from "./AgentSkillProfilePanel";

describe("AgentSkillProfilePanel", () => {
  it("선택된 에이전트의 전체 스킬과 권한 경계를 표시한다", () => {
    const html = renderToStaticMarkup(<AgentSkillProfilePanel role="executor" />);

    expect(html).toContain("협업 스킬/도구");
    expect(html).toContain("실행 도구");
    expect(html).toContain("승인 필요 2개");
    expect(html).toContain("Tmux 전달");
    expect(html).toContain("승인 확인");
    expect(html).toContain("실행 기록");
  });

  it("선택된 에이전트에 실제 연결된 SOUL/스킬 파일을 보여준다", () => {
    const runtimeConfigFiles: AgentConfigFile[] = [
      {
        body: "모든 에이전트는 자신과 사용자 사이의 장기 맥락을 유지한다.",
        id: "config_skill_evolvememento_continuity_v1",
        kind: "skill",
        label: "EvolveMemento 연속 기억 스킬",
        linkedAgentIds: ["agent_executor"],
        path: "agents/skills/EVOLVEMEMENTO_CONTINUITY.md",
        scope: "project",
        tags: ["memory", "continuity"],
        updatedAt: "2026-06-07T00:00:00.000Z",
        version: 1,
      },
      {
        body: "Executor는 승인된 작업만 실행한다.",
        id: "config_soul_executor_v1",
        kind: "soul",
        label: "실행자 SOUL",
        linkedAgentIds: ["agent_executor"],
        path: "agents/executor/SOUL.md",
        scope: "agent",
        tags: ["executor"],
        updatedAt: "2026-06-07T00:00:00.000Z",
        version: 1,
      },
    ];

    const html = renderToStaticMarkup(
      <AgentSkillProfilePanel
        displayName="렘"
        role="executor"
        runtimeConfigFiles={runtimeConfigFiles}
      />,
    );

    expect(html).toContain("실제 적용 지침");
    expect(html).toContain("EvolveMemento 연속 기억 스킬");
    expect(html).toContain("agents/skills/EVOLVEMEMENTO_CONTINUITY.md");
    expect(html).toContain("실행자 SOUL");
    expect(html).toContain("agents/executor/SOUL.md");
  });
});
