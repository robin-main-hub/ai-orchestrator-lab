// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ConfigLinkedAgentsRow } from "./ConfigLinkedAgentsRow";
import { selectAgentRuntimeConfigFiles } from "../../lib/agentRuntimeConfig";
import type { AgentConfigFile, WorkbenchAgent } from "../../types";

afterEach(() => cleanup());

const orchestrator: WorkbenchAgent = {
  id: "agent_orchestrator",
  name: "Orchestrator",
  kind: "virtual",
  role: "orchestrator",
  soulMode: "summary",
  configSource: "internal",
  enabled: true,
};

const architect: WorkbenchAgent = {
  id: "agent_architect",
  name: "Architect",
  kind: "virtual",
  role: "architect",
  soulMode: "summary",
  configSource: "internal",
  enabled: true,
};

const agents = [orchestrator, architect];

describe("ConfigLinkedAgentsRow — CFG-C wear editing", () => {
  it("renders worn agents as persona chips with real portraits", () => {
    const { container } = render(
      <ConfigLinkedAgentsRow agents={agents} linkedAgentIds={["agent_orchestrator"]} onChange={vi.fn()} />,
    );

    // 아바타 실렌더(§0-A): 이니셜 폴백이 아니라 img 초상이어야 한다.
    const portraits = container.querySelectorAll("img.aol-persona-avatar");
    expect(portraits.length).toBe(1);
    expect(portraits[0]!.getAttribute("src")).toContain("orchestrator");
    expect(container.textContent).toContain("착용 에이전트");
    expect(container.textContent).not.toContain("미착용");
  });

  it("shows the honest neutral label when nothing is worn", () => {
    const { container } = render(<ConfigLinkedAgentsRow agents={agents} linkedAgentIds={[]} onChange={vi.fn()} />);
    expect(container.textContent).toContain("미착용");
    expect(container.querySelectorAll("img.aol-persona-avatar").length).toBe(0);
  });

  it("removes a wear link via the X button", () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <ConfigLinkedAgentsRow
        agents={agents}
        linkedAgentIds={["agent_orchestrator", "agent_architect"]}
        onChange={onChange}
      />,
    );

    fireEvent.click(getByLabelText("Orchestrator 착용 해제"));
    expect(onChange).toHaveBeenCalledWith(["agent_architect"]);
  });

  it("adds a wear link via the + popover (only unworn agents offered)", () => {
    const onChange = vi.fn();
    const { getByTitle, getByText, container } = render(
      <ConfigLinkedAgentsRow agents={agents} linkedAgentIds={["agent_orchestrator"]} onChange={onChange} />,
    );

    fireEvent.click(getByTitle("착용 에이전트 추가"));
    // 이미 착용 중인 orchestrator(마키마)는 후보에 없어야 한다(팝오버 안 기준).
    // 표시명은 페르소나 한국어명으로 해석된다(architect → 오시노 시노부).
    const picker = container.querySelector(".config-v2__picker")!;
    expect(picker.textContent).toContain("오시노 시노부");
    expect(picker.textContent).not.toContain("마키마");

    fireEvent.click(getByText("오시노 시노부"));
    expect(onChange).toHaveBeenCalledWith(["agent_orchestrator", "agent_architect"]);
  });

  it("keeps UI wear state consistent with runtime injection selection", () => {
    // UI 가 "착용"으로 표시하는 것과 selectAgentRuntimeConfigFiles 가 주입 대상으로
    // 뽑는 것이 같은 원천(linkedAgentIds)에서 나온다는 회귀 가드.
    const nextLinked = ["agent_orchestrator", "agent_architect"];
    const file: AgentConfigFile = {
      id: "config_soul_test",
      kind: "soul",
      label: "테스트 SOUL",
      scope: "agent",
      path: "agents/test/SOUL.md",
      tags: [],
      version: 1,
      linkedAgentIds: nextLinked,
      updatedAt: new Date().toISOString(),
      body: "# SOUL",
    };

    const { queryByLabelText } = render(
      <ConfigLinkedAgentsRow agents={agents} linkedAgentIds={file.linkedAgentIds} onChange={vi.fn()} />,
    );

    for (const agent of agents) {
      // UI 착용 판정은 표시명 해석과 무관한 해제 버튼 aria-label 로 확인한다.
      const uiWorn = queryByLabelText(`${agent.name} 착용 해제`) != null;
      const runtimeWorn = selectAgentRuntimeConfigFiles(agent, [file]).length > 0;
      // UI 표시 여부와 런타임 주입 여부가 일치해야 한다.
      expect(runtimeWorn).toBe(file.linkedAgentIds.includes(agent.id));
      expect(uiWorn).toBe(runtimeWorn);
    }
  });
});
