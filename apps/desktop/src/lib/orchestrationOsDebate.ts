import type { AgentProfile, DebateRound, DebateTag, ProviderProfile } from "@ai-orchestrator/protocol";
import { agentPrimaryDisplayName } from "./agentDisplay";
import type { ExperienceRoadmapItem } from "./orchestrationExperienceRoadmap";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";

export type OrchestrationOsDebateInput = {
  agents: AgentProfile[];
  createdAt?: string;
  debateId?: string;
  providers: ProviderProfile[];
  roadmap: ExperienceRoadmapItem[];
  trigger: string;
};

type Participant = Stage3DebateSession["participants"][number];

type DebateTurn = {
  content: string;
  decisionId?: string;
  kind: DebateRound["kind"];
  role: AgentProfile["role"];
  tags: DebateTag[];
  title: string;
};

export function createOrchestrationOsDebateSession({
  agents,
  createdAt = new Date().toISOString(),
  debateId = `debate_os_${crypto.randomUUID()}`,
  providers,
  roadmap,
  trigger,
}: OrchestrationOsDebateInput): Stage3DebateSession {
  const participants = createParticipants(agents, providers);
  const nextItems = roadmap.filter((item) => item.status === "next");
  const blockedItems = roadmap.filter((item) => item.status === "blocked");
  const liveItems = roadmap.filter((item) => item.status === "live");
  const primaryNext = nextItems[0] ?? roadmap[0];
  const secondNext = nextItems[1] ?? nextItems[0] ?? roadmap[1] ?? primaryNext;
  const primaryBlocked = blockedItems[0];
  const triggerText = trigger.trim() || "오케스트레이션 OS 다음 큰 바위 결정";
  const problem = `OS 토론: ${triggerText}`;
  const summary = [
    `가동 ${liveItems.length}개`,
    `다음 ${nextItems.length}개`,
    `막힘 ${blockedItems.length}개`,
    primaryNext ? `우선 후보: ${primaryNext.label}` : "우선 후보 없음",
  ].join(" / ");
  const turns: DebateTurn[] = [
    {
      kind: "problem_definition",
      role: "orchestrator",
      tags: ["evidence"],
      title: "1턴 · 문제 재정의",
      content: `지금 판단할 문제는 "${triggerText}"입니다. 앱 밖 회의록이 아니라 Debate 화면 안에서 다음 큰 바위를 결정해야 합니다.`,
    },
    {
      kind: "initial_proposals",
      role: "architect",
      tags: ["evidence", "coding_impact"],
      title: "2턴 · 구조 제안",
      content: primaryNext
        ? `첫 후보는 "${primaryNext.label}"입니다. 이유는 ${primaryNext.detail}`
        : "로드맵 후보가 비어 있으니 Cockpit이 먼저 다음 행동 후보를 만들어야 합니다.",
    },
    {
      kind: "cross_critique",
      role: "reviewer",
      tags: ["risk"],
      title: "3턴 · 리스크 검토",
      content: primaryBlocked
        ? `막힌 축 "${primaryBlocked.label}"을 무시하면 완성처럼 보여도 실제 운영에서 다시 멈춥니다. ${primaryBlocked.detail}`
        : "현재 막힌 축은 없지만, 화면이 과밀해지면 사용자가 다시 흐름을 잃습니다.",
    },
    {
      kind: "refinement",
      role: "memory_curator",
      tags: ["evidence"],
      title: "4턴 · 기억과 연속성",
      content: secondNext
        ? `"${secondNext.label}"도 함께 묶어야 합니다. 에이전트별 기억과 스킬 맥락이 이어져야 토론 결과가 다음 대화에서 살아납니다.`
        : "토론 결과는 기억 후보와 작업 브리핑에 남겨 다음 세션에서도 이어져야 합니다.",
    },
    {
      decisionId: "decision_os_next_big_rock",
      kind: "final_decision",
      role: "executor",
      tags: ["agreement", "coding_impact"],
      title: "5턴 · 실행 결정",
      content: primaryNext
        ? `결정: 다음 실행은 "${primaryNext.label}"부터 진행합니다. 동시에 토론 결과를 작업 패킷과 브리핑으로 남겨 OS 안에서 추적 가능하게 합니다.`
        : "결정: 로드맵 후보 생성부터 복구하고, 그 결과를 작업 패킷과 브리핑으로 남깁니다.",
    },
  ];

  const rounds = turns.map((turn, index): DebateRound => {
    const speaker = pickParticipant(participants, turn.role) ?? participants[index % Math.max(participants.length, 1)];
    const roundId = `${debateId}_turn_${index + 1}`;
    return {
      debateId,
      id: roundId,
      kind: turn.kind,
      status: "completed",
      title: turn.title,
      utterances: speaker
        ? [
            {
              content: turn.content,
              createdAt,
              decisionId: turn.decisionId,
              id: `${roundId}_utt_1`,
              agentId: speaker.agentId,
              roundId,
              tags: turn.tags,
            },
          ]
        : [],
    };
  });

  return {
    contextPreview: roadmap.slice(0, 6).map((item) => `${statusLabel(item.status)} · ${item.label}: ${item.detail}`),
    humanPeek: [
      {
        actor: "OS",
        createdAt,
        id: "peek_os_debate_generated",
        kind: "yield",
        state: "observed",
        summary: "Command Palette에서 Debate 세션을 직접 생성",
        target: "Debate Chamber",
      },
    ],
    id: debateId,
    participants,
    problem,
    promotedAt: createdAt,
    rounds,
    statusHub: [
      { id: "roadmap_live", label: "가동", tone: "ok", value: `${liveItems.length}개` },
      { id: "roadmap_next", label: "다음", tone: "warn", value: `${nextItems.length}개` },
      { id: "roadmap_blocked", label: "막힘", tone: blockedItems.length > 0 ? "danger" : "ok", value: `${blockedItems.length}개` },
    ],
    summary,
  };
}

function createParticipants(agents: AgentProfile[], providers: ProviderProfile[]): Participant[] {
  return agents
    .filter((agent) => agent.enabled)
    .map((agent) => {
      const provider = providers.find((candidate) => candidate.id === agent.providerProfileId);
      return {
        agentId: agent.id,
        modelId: agent.modelId ?? provider?.defaultModel ?? "모델 연결 대기",
        name: agentPrimaryDisplayName(agent),
        providerName: provider?.name ?? "공급자 미지정",
        role: agent.role,
      };
    });
}

function pickParticipant(participants: Participant[], role: AgentProfile["role"]) {
  return participants.find((participant) => participant.role === role) ?? participants[0];
}

function statusLabel(status: ExperienceRoadmapItem["status"]) {
  if (status === "live") return "가동";
  if (status === "blocked") return "막힘";
  return "다음";
}
