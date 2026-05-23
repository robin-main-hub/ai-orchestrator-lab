import type {
  AgentProfile,
  ConversationMessage,
  DebateRound,
  DebateRoundKind,
  DebateTag,
  DebateUtterance,
  EventEnvelope,
  ProviderProfile,
  RuntimeSnapshot,
} from "@ai-orchestrator/protocol";

export type HumanPeekEntry = {
  id: string;
  kind: "spawn" | "send" | "yield" | "approval";
  actor: string;
  target: string;
  summary: string;
  state: "observed" | "pending" | "blocked";
  createdAt: string;
};

export type StatusHubItem = {
  id: string;
  label: string;
  value: string;
  tone: "ok" | "warn" | "danger";
};

export type Stage3DebateSession = {
  id: string;
  problem: string;
  summary: string;
  contextPreview: string[];
  participants: Array<{
    agentId: string;
    name: string;
    providerName: string;
    modelId: string;
  }>;
  rounds: DebateRound[];
  humanPeek: HumanPeekEntry[];
  statusHub: StatusHubItem[];
  promotedAt: string;
};

export type Stage3DebateInput = {
  messages: ConversationMessage[];
  agents: AgentProfile[];
  providers: ProviderProfile[];
  events: EventEnvelope[];
  runtime: RuntimeSnapshot;
  createdAt?: string;
};

const roundTemplates: Array<{ kind: DebateRoundKind; title: string }> = [
  { kind: "problem_definition", title: "문제 정의" },
  { kind: "initial_proposals", title: "1차 제안" },
  { kind: "cross_critique", title: "상호 비판" },
  { kind: "orchestrator_summary", title: "오케스트레이터 요약" },
  { kind: "refinement", title: "보완 라운드" },
  { kind: "final_decision", title: "최종 결정" },
  { kind: "coding_packet", title: "코딩 패킷" },
];

export function createStage3DebateSession({
  messages,
  agents,
  providers,
  events,
  runtime,
  createdAt = new Date().toISOString(),
}: Stage3DebateInput): Stage3DebateSession {
  const debateId = `debate_${crypto.randomUUID()}`;
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const problem = lastUserMessage?.content ?? "Conversation context를 Debate Mode로 승격";
  const summary = summarizeConversation(messages);
  const participants = agents
    .filter((agent) => agent.enabled)
    .slice(0, 4)
    .map((agent) => {
      const provider = providers.find((profile) => profile.id === agent.providerProfileId);
      return {
        agentId: agent.id,
        name: agent.name,
        providerName: provider?.name ?? "provider pending",
        modelId: agent.modelId ?? provider?.defaultModel ?? "model pending",
      };
    });

  const rounds = roundTemplates.map((template, index) => {
    const roundId = `${debateId}_round_${index + 1}`;
    const utterances = createRoundUtterances(roundId, template.kind, problem, summary, participants, createdAt);
    const status: DebateRound["status"] = index < 5 ? "completed" : index === 5 ? "running" : "pending";

    return {
      id: roundId,
      debateId,
      kind: template.kind,
      title: template.title,
      status,
      utterances,
    };
  });

  return {
    id: debateId,
    problem,
    summary,
    contextPreview: messages.slice(-5).map((message) => `${message.role}: ${message.content}`),
    participants,
    rounds,
    humanPeek: createHumanPeek(participants, rounds, events, createdAt),
    statusHub: createStatusHub(runtime, providers, events),
    promotedAt: createdAt,
  };
}

function createRoundUtterances(
  roundId: string,
  kind: DebateRoundKind,
  problem: string,
  summary: string,
  participants: Stage3DebateSession["participants"],
  createdAt: string,
): DebateUtterance[] {
  const orchestrator = participants.find((participant) => participant.name === "Orchestrator") ?? participants[0];
  const architect = participants.find((participant) => participant.name === "Architect") ?? participants[1] ?? orchestrator;
  const reviewer = participants.find((participant) => participant.name === "Reviewer") ?? participants[2] ?? orchestrator;
  const executor = participants.find((participant) => participant.name === "Executor") ?? participants[3] ?? architect;

  if (!orchestrator || !architect || !reviewer || !executor) {
    return [];
  }

  const rows: Record<DebateRoundKind, Array<{ participant: typeof orchestrator; tags: DebateTag[]; content: string }>> = {
    problem_definition: [
      {
        participant: orchestrator,
        tags: ["agreement", "evidence"],
        content: `현재 대화의 핵심 문제는 "${trimForCard(problem)}"이고, 단순 요약이 아니라 코딩 결정으로 넘겨야 한다.`,
      },
    ],
    initial_proposals: [
      {
        participant: architect,
        tags: ["evidence", "coding_impact"],
        content: "Conversation context를 Debate Context로 승격하고, 라운드/태그/결정 필드를 구조화해 Event Store에 남기는 편이 좋다.",
      },
      {
        participant: executor,
        tags: ["coding_impact"],
        content: "실행은 아직 mock으로 두되, 이후 CLI slot과 DGX remote slot에 연결할 수 있도록 payload 경계를 고정해야 한다.",
      },
    ],
    cross_critique: [
      {
        participant: reviewer,
        tags: ["objection", "risk"],
        content: "같은 모델에서 여러 가상 에이전트를 만들면 합의가 과장될 수 있다. 검증 모델과 로컬 모델을 모두 선택 가능하게 남겨야 한다.",
      },
    ],
    orchestrator_summary: [
      {
        participant: orchestrator,
        tags: ["agreement", "coding_impact"],
        content: `합의: ${trimForCard(summary)}. 다음 행동은 Debate 결과를 Coding Packet 후보로 갱신하는 것이다.`,
      },
    ],
    refinement: [
      {
        participant: architect,
        tags: ["evidence"],
        content: "Status Hub와 Human Peek를 붙이면 숨은 agent-to-agent 흐름과 DGX/local fallback 상태를 한 화면에서 추적할 수 있다.",
      },
    ],
    final_decision: [
      {
        participant: orchestrator,
        tags: ["agreement", "coding_impact"],
        content: "Stage3의 첫 결정은 Debate 승격 UI, 라운드 기반 발언, Human Peek, Status Hub를 먼저 연결하는 것이다.",
      },
      {
        participant: reviewer,
        tags: ["risk"],
        content: "실제 모델 호출, PTY 실행, 서버 병렬 실행은 permission/event 경계가 더 단단해진 뒤 켠다.",
      },
    ],
    coding_packet: [
      {
        participant: orchestrator,
        tags: ["coding_impact"],
        content: "최종 결정은 Coding Packet으로 승격할 수 있어야 하며, rejectedOptions와 verificationPlan을 잃지 않아야 한다.",
      },
    ],
  };

  return rows[kind].map((row, index) => ({
    id: `utterance_${roundId}_${index + 1}`,
    agentId: row.participant.agentId,
    roundId,
    content: row.content,
    tags: row.tags,
    createdAt,
  }));
}

function createHumanPeek(
  participants: Stage3DebateSession["participants"],
  rounds: DebateRound[],
  events: EventEnvelope[],
  createdAt: string,
): HumanPeekEntry[] {
  const orchestrator = participants.find((participant) => participant.name === "Orchestrator") ?? participants[0];
  const architect = participants.find((participant) => participant.name === "Architect") ?? participants[1];
  const reviewer = participants.find((participant) => participant.name === "Reviewer") ?? participants[2];

  return [
    {
      id: "peek_spawn_architect",
      kind: "spawn",
      actor: orchestrator?.name ?? "Orchestrator",
      target: architect?.name ?? "Architect",
      summary: "Debate Context를 전달하고 1차 구조 제안을 요청",
      state: "observed",
      createdAt,
    },
    {
      id: "peek_send_reviewer",
      kind: "send",
      actor: orchestrator?.name ?? "Orchestrator",
      target: reviewer?.name ?? "Reviewer",
      summary: "리스크/누락/보안 경계 검토 요청",
      state: "observed",
      createdAt,
    },
    {
      id: "peek_yield_summary",
      kind: "yield",
      actor: reviewer?.name ?? "Reviewer",
      target: orchestrator?.name ?? "Orchestrator",
      summary: `${rounds.length}개 라운드, ${events.length}개 최근 이벤트 기준으로 결과 반환`,
      state: "pending",
      createdAt,
    },
  ];
}

function createStatusHub(
  runtime: RuntimeSnapshot,
  providers: ProviderProfile[],
  events: EventEnvelope[],
): StatusHubItem[] {
  const enabledProviders = providers.filter((provider) => provider.enabled).length;
  const untrustedProviders = providers.filter((provider) => provider.trustLevel === "untrusted").length;

  return [
    {
      id: "dgx",
      label: "DGX",
      value: runtime.dgxStatus,
      tone: runtime.dgxStatus === "online" ? "ok" : runtime.dgxStatus === "offline" ? "danger" : "warn",
    },
    {
      id: "local",
      label: "Local",
      value: runtime.localModelStatus,
      tone: runtime.localModelStatus === "online" ? "ok" : "warn",
    },
    {
      id: "providers",
      label: "Providers",
      value: `${enabledProviders} active / ${untrustedProviders} risky`,
      tone: untrustedProviders > 0 ? "warn" : "ok",
    },
    {
      id: "events",
      label: "Events",
      value: `${events.length} buffered`,
      tone: events.length > 0 ? "ok" : "warn",
    },
  ];
}

function summarizeConversation(messages: ConversationMessage[]): string {
  const recent = messages.slice(-4).map((message) => `${message.role}: ${message.content}`);
  if (recent.length === 0) {
    return "대화 맥락 없음";
  }

  return recent.join(" / ");
}

function trimForCard(value: string, limit = 120): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 1)}...`;
}
