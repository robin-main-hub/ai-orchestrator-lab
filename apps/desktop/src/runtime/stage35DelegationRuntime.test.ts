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

    expect(prompt).toContain("새 <delegate> 태그를 추가로 출력하지 마세요.");
    expect(prompt).toContain("하위 에이전트 결과:");
    expect(prompt).not.toContain("Sub-agent results");
    expect(prompt).toContain("결과");
  });

  it("uses Korean status lines in delegation follow-up prompts", () => {
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
        {
          kind: "blocked",
          tag: makeTag("executor"),
          reason: "승인 필요",
        },
        {
          kind: "unknown_target",
          tag: makeTag("ghost"),
        },
        {
          kind: "self_delegation",
          tag: makeTag("chae_arin"),
        },
        {
          kind: "failed",
          tag: makeTag("auditor"),
          targetAgentId: "agent_auditor",
          targetAgentName: "Auditor",
          reason: "호출 실패",
        },
      ],
    });

    expect(prompt).toContain("상태: 완료");
    expect(prompt).toContain("상태: 차단");
    expect(prompt).toContain("상태: 알 수 없는 대상");
    expect(prompt).toContain("상태: 자기 자신에게 위임 차단");
    expect(prompt).toContain("상태: 실패");
    expect(prompt).not.toContain("Status:");
    expect(prompt).not.toContain("Original user request");
    expect(prompt).not.toContain("Final answer instructions");
  });
});
