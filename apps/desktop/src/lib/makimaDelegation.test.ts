import { describe, expect, it } from "vitest";
import type { WorkbenchAgent } from "../types";
import {
  createMakimaDelegationCards,
  createMakimaDelegationWorkItems,
} from "./makimaDelegation";

const agents: WorkbenchAgent[] = [
  createAgent("agent_orchestrator", "마키마", "orchestrator"),
  createAgent("agent_architect", "오시노 시노부", "architect"),
  createAgent("agent_builder", "히라사와 유이", "builder"),
  createAgent("agent_reviewer", "시노미야 카구야", "reviewer"),
  createAgent("agent_verifier", "마키세 크리스", "verifier"),
  createAgent("agent_executor", "렘", "executor"),
  createAgent("agent_memory", "나가토 유키", "memory_curator"),
];

describe("makimaDelegation", () => {
  it("마키마 지휘안을 역할별 에이전트 배정 카드로 만든다", () => {
    const cards = createMakimaDelegationCards({
      agents,
      request: "대화형 OS의 지휘 기능을 완성해줘",
    });

    expect(cards.map((card) => card.targetAgentName)).toEqual([
      "오시노 시노부",
      "히라사와 유이",
      "시노미야 카구야",
      "마키세 크리스",
      "렘",
    ]);
    expect(cards[0]).toMatchObject({
      targetRoleLabel: "설계자",
      targetSurface: "conversation",
      toolLabel: "설계 도구",
    });
    expect(cards[1]?.summary).toContain("대화형 OS의 지휘 기능");
  });

  it("배정 카드를 실제 WorkItem/Handoff로 변환한다", () => {
    const card = createMakimaDelegationCards({
      agents,
      request: "마키마가 에이전트를 지휘하게 해줘",
    })[1]!;

    const result = createMakimaDelegationWorkItems({
      card,
      createdAt: "2026-06-08T10:00:00.000Z",
      orchestratorAgentId: "agent_orchestrator",
      request: "마키마가 에이전트를 지휘하게 해줘",
      sessionId: "session_desktop_001",
    });

    expect(result.workItem).toMatchObject({
      kind: "internal_coord",
      lane: "auto",
      ownerAgentId: "agent_builder",
      status: "planned",
      surface: "conversation",
    });
    expect(result.handoff).toMatchObject({
      approvalState: "required",
      targetSurface: "execution_slot",
      workItemId: result.workItem.id,
    });
  });
});

function createAgent(id: string, name: string, role: WorkbenchAgent["role"]): WorkbenchAgent {
  return {
    configSource: "internal",
    enabled: true,
    id,
    kind: "virtual",
    name,
    role,
    soulMode: "summary",
  };
}
