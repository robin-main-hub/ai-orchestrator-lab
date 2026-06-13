import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WorkbenchAgent } from "../../types";
import { ConversationAgentRail, ConversationAgentSpotlight } from "./ConversationAgentRail";

function agent(role: string, id = role): WorkbenchAgent {
  return { id, name: id, role, enabled: true } as unknown as WorkbenchAgent;
}

const agents = [agent("orchestrator"), agent("executor"), agent("verifier")];

describe("ConversationAgentRail", () => {
  it("renders one switch button per agent (1-click switch)", () => {
    const html = renderToStaticMarkup(
      <ConversationAgentRail agents={agents} onSelectAgent={vi.fn()} selectedAgentId="executor" />,
    );
    // a button per agent — count the role label aria-labels (마키마/렘/마키세 크리스)
    expect(html).toContain("마키마");
    expect(html).toContain("렘");
    expect(html).toContain("마키세 크리스");
    expect(html).toContain('aria-label="에이전트 빠른 전환"');
  });

  it("marks the selected agent as current", () => {
    const html = renderToStaticMarkup(
      <ConversationAgentRail agents={agents} onSelectAgent={vi.fn()} selectedAgentId="executor" />,
    );
    expect(html).toContain('aria-current="true"');
  });

  it("surfaces an attention hint in the aria-label for agents needing a hand", () => {
    const html = renderToStaticMarkup(
      <ConversationAgentRail
        agents={agents}
        agentActivityById={{ verifier: "waiting_approval", executor: "error" }}
        onSelectAgent={vi.fn()}
        selectedAgentId="orchestrator"
      />,
    );
    expect(html).toContain("승인 대기");
    expect(html).toContain("막힘");
  });

  it("renders nothing when there are no agents", () => {
    expect(renderToStaticMarkup(<ConversationAgentRail agents={[]} onSelectAgent={vi.fn()} />)).toBe("");
  });
});

describe("ConversationAgentSpotlight", () => {
  it("shows the current agent name and work-status label", () => {
    const html = renderToStaticMarkup(
      <ConversationAgentSpotlight
        activity="responding"
        agent={agent("orchestrator")}
        displayName="마키마"
        workStatusLabel="마키마가 답변을 다듬는 중"
      />,
    );
    expect(html).toContain("마키마");
    expect(html).toContain("답변을 다듬는 중");
  });

  it("renders nothing without a selected agent", () => {
    expect(
      renderToStaticMarkup(
        <ConversationAgentSpotlight agent={undefined} displayName="" workStatusLabel="" />,
      ),
    ).toBe("");
  });

  it("pulses the portrait while the agent is actively working, not when idle", () => {
    const speaking = renderToStaticMarkup(
      <ConversationAgentSpotlight activity="responding" agent={agent("orchestrator")} displayName="마키마" workStatusLabel="응답 중" />,
    );
    expect(speaking).toContain("conversation-speaking");
    const idle = renderToStaticMarkup(
      <ConversationAgentSpotlight activity="idle" agent={agent("orchestrator")} displayName="마키마" workStatusLabel="대기" />,
    );
    expect(idle).not.toContain("conversation-speaking");
  });
});
