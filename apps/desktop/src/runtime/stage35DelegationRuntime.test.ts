import { describe, expect, it } from "vitest";
import { defaultAgentProfiles, type DelegateTag } from "@ai-orchestrator/agents";
import {
  buildDelegationFollowupPrompt,
  delegationAuthorityLevel,
  resolveDelegationTargetAgent,
  serializeDelegationOutcome,
  type DesktopDelegationOutcome,
} from "./stage35DelegationRuntime";
import type { WorkbenchAgent } from "../types";

const agents = defaultAgentProfiles as WorkbenchAgent[];
const chaeArin = agents.find((agent) => agent.personaName === "chae_arin")!;

function makeTag(target: string): DelegateTag {
  return {
    target,
    prompt: `${target}에게 확인할 일`,
    raw: `<delegate to="${target}">${target}에게 확인할 일</delegate>`,
    startIndex: 0,
    endIndex: 10,
  };
}

describe("stage35DelegationRuntime", () => {
  it("treats companion delegation as orchestrator-plus authority", () => {
    expect(delegationAuthorityLevel(chaeArin)).toBe("orchestrator_plus");
  });

  it("lets Chae Arin target every registered sub-agent role, including sensitive roles as completion-only targets", () => {
    for (const target of ["researcher", "executor", "external", "auditor"]) {
      expect(resolveDelegationTargetAgent(target, chaeArin, agents)?.role).toBe(target);
    }
  });

  it("does not resolve self-delegation back to the caller", () => {
    expect(resolveDelegationTargetAgent("companion", chaeArin, agents)?.id).not.toBe(chaeArin.id);
    expect(resolveDelegationTargetAgent("chae_arin", chaeArin, agents)).toBeUndefined();
  });

  it("serializes successful delegation outcomes for conversation metadata", () => {
    const outcome: DesktopDelegationOutcome = {
      kind: "succeeded",
      tag: makeTag("researcher"),
      targetAgentId: "agent_researcher",
      targetAgentName: "Researcher",
      targetRole: "researcher",
      providerProfileId: "provider_apifun_claude",
      modelId: "claude-opus-4-6",
      response: "시장 규모 확인 완료",
    };

    expect(serializeDelegationOutcome(outcome)).toMatchObject({
      status: "succeeded",
      target: "researcher",
      targetAgentName: "Researcher",
      response: "시장 규모 확인 완료",
    });
  });

  it("builds a follow-up prompt that prevents chain delegation", () => {
    const prompt = buildDelegationFollowupPrompt({
      caller: chaeArin,
      initialReply: '<delegate to="researcher">확인</delegate>',
      originalUserMessage: "시장 확인해줘",
      outcomes: [
        {
          kind: "succeeded",
          tag: makeTag("researcher"),
          targetAgentId: "agent_researcher",
          targetAgentName: "Researcher",
          targetRole: "researcher",
          providerProfileId: "provider_apifun_claude",
          modelId: "claude-opus-4-6",
          response: "결과",
        },
      ],
    });

    expect(prompt).toContain("Do not emit any new <delegate> tags");
    expect(prompt).toContain("Sub-agent results");
    expect(prompt).toContain("결과");
  });
});
