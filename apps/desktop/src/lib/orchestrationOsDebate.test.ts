import { describe, expect, it } from "vitest";
import type { AgentProfile, ProviderProfile } from "@ai-orchestrator/protocol";
import { createOrchestrationOsDebateSession } from "./orchestrationOsDebate";
import type { ExperienceRoadmapItem } from "./orchestrationExperienceRoadmap";

const agents: AgentProfile[] = [
  {
    id: "agent_orchestrator",
    name: "Orchestrator",
    enabled: true,
    kind: "virtual",
    modelId: "mimo-v2.5-pro",
    personaName: "orchestrator",
    providerProfileId: "provider_mimo",
    role: "orchestrator",
    soulMode: "full",
    configSource: "internal",
  },
  {
    id: "agent_architect",
    name: "Architect",
    enabled: true,
    kind: "virtual",
    modelId: "claude-opus-4-8",
    personaName: "architect",
    providerProfileId: "provider_claude",
    role: "architect",
    soulMode: "full",
    configSource: "internal",
  },
  {
    id: "agent_reviewer",
    name: "Reviewer",
    enabled: true,
    kind: "virtual",
    modelId: "claude-opus-4-8",
    personaName: "reviewer",
    providerProfileId: "provider_claude",
    role: "reviewer",
    soulMode: "full",
    configSource: "internal",
  },
  {
    id: "agent_memory",
    name: "Memory",
    enabled: true,
    kind: "virtual",
    modelId: "mimo-v2.5-pro",
    personaName: "memory_curator",
    providerProfileId: "provider_mimo",
    role: "memory_curator",
    soulMode: "full",
    configSource: "internal",
  },
  {
    id: "agent_executor",
    name: "Executor",
    enabled: true,
    kind: "virtual",
    modelId: "claude-opus-4-8",
    personaName: "executor",
    providerProfileId: "provider_claude",
    role: "executor",
    soulMode: "full",
    configSource: "internal",
  },
];

const providers: ProviderProfile[] = [
  {
    id: "provider_mimo",
    name: "MiMo",
    enabled: true,
    kind: "openai",
    baseUrl: "http://localhost:4317",
    defaultModel: "mimo-v2.5-pro",
    trustLevel: "trusted",
    tags: [],
  },
  {
    id: "provider_claude",
    name: "Claude",
    enabled: true,
    kind: "anthropic",
    baseUrl: "http://localhost:4317/anthropic",
    defaultModel: "claude-opus-4-8",
    trustLevel: "trusted",
    tags: [],
  },
];

const roadmap: ExperienceRoadmapItem[] = [
  {
    id: "agent_rooms",
    label: "에이전트별 진짜 대화방",
    detail: "각 캐릭터가 자기 기억과 스킬을 가진다.",
    source: "notion",
    status: "next",
  },
  {
    id: "thinking_trace",
    label: "생각/도구/검증 상태 노출",
    detail: "침묵 없이 작업 중 상태를 보여준다.",
    source: "cursor",
    status: "next",
  },
  {
    id: "security_masking",
    label: "렌더 직전 보안 마스킹",
    detail: "공개 브리핑에서 비밀을 가린다.",
    source: "cline",
    status: "blocked",
  },
];

describe("createOrchestrationOsDebateSession", () => {
  it("OS 안에서 실행할 5턴 토론 세션을 캐릭터 이름과 결정 노드로 생성한다", () => {
    const session = createOrchestrationOsDebateSession({
      agents,
      createdAt: "2026-06-07T12:00:00.000Z",
      debateId: "debate_os_test",
      providers,
      roadmap,
      trigger: "20개 큰 바위 다음 실행 순서 결정",
    });

    expect(session.id).toBe("debate_os_test");
    expect(session.problem).toContain("20개 큰 바위 다음 실행 순서 결정");
    expect(session.participants.map((participant) => participant.name)).toEqual(
      expect.arrayContaining(["마키마", "오시노 시노부", "시노미야 카구야", "아야나미 레이", "렘"]),
    );
    expect(session.rounds).toHaveLength(5);
    expect(session.rounds.every((round) => round.status === "completed")).toBe(true);

    const utterances = session.rounds.flatMap((round) => round.utterances);
    expect(utterances).toHaveLength(5);
    expect(utterances.map((utterance) => utterance.content).join(" ")).toContain("에이전트별 진짜 대화방");
    expect(utterances.map((utterance) => utterance.content).join(" ")).toContain("렌더 직전 보안 마스킹");
    expect(utterances.at(-1)?.decisionId).toBe("decision_os_next_big_rock");
    expect(utterances.at(-1)?.tags).toEqual(expect.arrayContaining(["agreement", "coding_impact"]));
  });
});
