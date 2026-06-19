import { describe, expect, it } from "vitest";
import { defaultAgentProfiles, type DelegateTag } from "@ai-orchestrator/agents";
import {
  buildDelegatedAgentPrompt,
  buildDelegationFollowupPrompt,
  delegationAuthorityLevel,
  resolveDelegationTargetAgent,
  serializeDelegationOutcome,
  type DesktopDelegationOutcome,
} from "./stage35DelegationRuntime";
import type { WorkbenchAgent } from "../types";

const agents = defaultAgentProfiles as WorkbenchAgent[];
const kurumi = agents.find((agent) => agent.personaName === "kurumi")!;
const orchestrator = agents.find((agent) => agent.role === "orchestrator")!;

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
    expect(delegationAuthorityLevel(kurumi)).toBe("orchestrator_plus");
  });

  it("lets Kurumi target every registered sub-agent role, including sensitive roles as completion-only targets", () => {
    for (const target of ["researcher", "executor", "external", "auditor"]) {
      expect(resolveDelegationTargetAgent(target, kurumi, agents)?.role).toBe(target);
    }
  });

  it("does not resolve self-delegation back to the caller", () => {
    expect(resolveDelegationTargetAgent("companion", kurumi, agents)?.id).not.toBe(kurumi.id);
    expect(resolveDelegationTargetAgent("kurumi", kurumi, agents)).toBeUndefined();
  });

  it("위임 프롬프트에도 내부 역할명이 아니라 캐릭터 이름을 쓴다", () => {
    const prompt = buildDelegatedAgentPrompt({
      caller: orchestrator,
      originalUserMessage: "검토자에게 회귀 위험을 보게 해줘",
      tag: makeTag("reviewer"),
    });

    expect(prompt).toContain("[Delegated by 마키마 / orchestrator]");
    expect(prompt).not.toContain("[Delegated by Orchestrator");
  });

  it("위임 후 종합 프롬프트도 호출자 캐릭터 이름으로 시작한다", () => {
    const prompt = buildDelegationFollowupPrompt({
      caller: kurumi,
      initialReply: '<delegate to="researcher">확인</delegate>',
      originalUserMessage: "시장 확인해줘",
      outcomes: [],
    });

    expect(prompt).toContain("쿠루미가 작업 일부를 하위 에이전트에게 위임했습니다.");
    expect(prompt).not.toContain("Chae");
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
      caller: kurumi,
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
      caller: kurumi,
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
          tag: makeTag("kurumi"),
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

// Characterization tests for previously-uncovered stage35 delegation-runtime
// branches (no behavior change, no network, no secret). These pin the
// authority-adjacent delegation seam: the non-companion authority level, the
// enabled/elevated visibility rule in resolveDelegationTargetAgent (disabled
// targets are hidden from ordinary callers but reachable by elevated ones, plus
// personaName + normalization matching), the non-succeeded serialization shapes,
// and the follow-up prompt's long-response truncation.
describe("stage35 delegation runtime — authority & serialization characterization", () => {
  const makeAgent = (overrides: Partial<WorkbenchAgent> & Pick<WorkbenchAgent, "id" | "role">): WorkbenchAgent =>
    ({
      name: overrides.id,
      kind: "virtual",
      soulMode: "summary",
      configSource: "markdown",
      enabled: true,
      ...overrides,
    }) as WorkbenchAgent;

  it("treats every non-companion role (including orchestrator) as plain agent authority", () => {
    expect(delegationAuthorityLevel(orchestrator)).toBe("agent");
    expect(delegationAuthorityLevel(makeAgent({ id: "agent_r", role: "researcher" }))).toBe("agent");
  });

  it("hides disabled targets from ordinary callers but reveals them to elevated callers", () => {
    const ordinaryCaller = makeAgent({ id: "agent_caller", role: "researcher" });
    const elevatedCaller = makeAgent({ id: "agent_lead", role: "orchestrator" });
    const disabledTarget = makeAgent({ id: "agent_exec", name: "Executor", role: "executor", enabled: false });

    expect(resolveDelegationTargetAgent("executor", ordinaryCaller, [ordinaryCaller, disabledTarget])).toBeUndefined();
    expect(resolveDelegationTargetAgent("executor", elevatedCaller, [elevatedCaller, disabledTarget])?.id).toBe(
      "agent_exec",
    );
  });

  it("matches a target by personaName after case/whitespace normalization", () => {
    const caller = makeAgent({ id: "agent_caller", role: "researcher" });
    const personaTarget = makeAgent({
      id: "agent_special",
      name: "Helper",
      role: "reviewer",
      personaName: "Special One",
    });

    expect(resolveDelegationTargetAgent("  SPECIAL one ", caller, [caller, personaTarget])?.id).toBe("agent_special");
  });

  it("serializes blocked outcomes with the base tag fields and no succeeded-only keys", () => {
    const serialized = serializeDelegationOutcome({
      kind: "blocked",
      tag: makeTag("executor"),
      reason: "승인 필요",
    });

    expect(serialized).toMatchObject({
      status: "blocked",
      target: "executor",
      prompt: "executor에게 확인할 일",
      reason: "승인 필요",
    });
    expect(serialized).not.toHaveProperty("targetAgentId");
    expect(serialized).not.toHaveProperty("response");
  });

  it("serializes unknown_target and self_delegation outcomes as base-only status records", () => {
    expect(serializeDelegationOutcome({ kind: "unknown_target", tag: makeTag("ghost") })).toMatchObject({
      status: "unknown_target",
      target: "ghost",
    });
    expect(serializeDelegationOutcome({ kind: "self_delegation", tag: makeTag("kurumi") })).toMatchObject({
      status: "self_delegation",
      target: "kurumi",
    });
  });

  it("serializes failed outcomes with target identity and reason", () => {
    const serialized = serializeDelegationOutcome({
      kind: "failed",
      tag: makeTag("auditor"),
      targetAgentId: "agent_auditor",
      targetAgentName: "Auditor",
      reason: "호출 실패",
    });

    expect(serialized).toMatchObject({
      status: "failed",
      target: "auditor",
      targetAgentId: "agent_auditor",
      targetAgentName: "Auditor",
      reason: "호출 실패",
    });
    expect(serialized).not.toHaveProperty("response");
  });

  it("truncates an oversized succeeded response in the follow-up prompt with an ellipsis", () => {
    const longResponse = "a".repeat(2300);
    const prompt = buildDelegationFollowupPrompt({
      caller: kurumi,
      initialReply: "초기 응답",
      originalUserMessage: "긴 응답 확인",
      outcomes: [
        {
          kind: "succeeded",
          tag: makeTag("researcher"),
          targetAgentId: "agent_researcher",
          targetAgentName: "Researcher",
          targetRole: "researcher",
          providerProfileId: "provider_apifun_claude",
          modelId: "claude-opus-4-6",
          response: longResponse,
        },
      ],
    });

    expect(prompt).toContain(`${"a".repeat(2199)}…`);
    expect(prompt).not.toContain(longResponse);
  });
});
