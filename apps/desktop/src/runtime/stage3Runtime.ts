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
  ProviderCompletionResponse,
  CodingPacket,
} from "@ai-orchestrator/protocol";
import {
  applyDebateCrossLinks,
  runDebate,
  buildAgentSystemPrompt,
  type DebateContext,
  type DebateEngineAgentSlot,
  type LlmCompletionFn,
} from "@ai-orchestrator/agents";
import { agentPrimaryDisplayName } from "../lib/agentDisplay";
import { requestDgxProviderCompletion } from "./stage12DgxProvider";


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
    role: AgentProfile["role"];
    providerName: string;
    modelId: string;
  }>;
  rounds: DebateRound[];
  humanPeek: HumanPeekEntry[];
  statusHub: StatusHubItem[];
  promotedAt: string;
  /** 실제 멀티에이전트 엔진 실행 상태 (mock=박힌 데모, running=호출 중, live=실제 응답, error=실패) */
  runState?: "mock" | "running" | "live" | "error";
  /** runState==="error"일 때의 사유 */
  runError?: string;
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
    .map((agent) => {
      const provider = providers.find((profile) => profile.id === agent.providerProfileId);
      return {
        agentId: agent.id,
        name: agentPrimaryDisplayName(agent),
        role: agent.role,
        providerName: provider?.name ?? "공급자 미지정",
        modelId: agent.modelId ?? provider?.defaultModel ?? "모델 연결 대기",
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
  const orchestrator = participants.find((participant) => participant.role === "orchestrator") ?? participants[0];
  const architect = participants.find((participant) => participant.role === "architect") ?? participants[1] ?? orchestrator;
  const reviewer = participants.find((participant) => participant.role === "reviewer") ?? participants[2] ?? orchestrator;
  const executor = participants.find((participant) => participant.role === "executor") ?? participants[3] ?? architect;

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
  const orchestrator = participants.find((participant) => participant.role === "orchestrator") ?? participants[0];
  const architect = participants.find((participant) => participant.role === "architect") ?? participants[1];
  const reviewer = participants.find((participant) => participant.role === "reviewer") ?? participants[2];

  return [
    {
      id: "peek_spawn_architect",
      kind: "spawn",
      actor: orchestrator?.name ?? "지휘자",
      target: architect?.name ?? "설계자",
      summary: "Debate Context를 전달하고 1차 구조 제안을 요청",
      state: "observed",
      createdAt,
    },
    {
      id: "peek_send_reviewer",
      kind: "send",
      actor: orchestrator?.name ?? "지휘자",
      target: reviewer?.name ?? "검토자",
      summary: "리스크/누락/보안 경계 검토 요청",
      state: "observed",
      createdAt,
    },
    {
      id: "peek_yield_summary",
      kind: "yield",
      actor: reviewer?.name ?? "검토자",
      target: orchestrator?.name ?? "지휘자",
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

export function createDgxLlmCompletionFn(
  provider: ProviderProfile,
  fetchImpl: typeof fetch = fetch,
): LlmCompletionFn {
  return async (request, ctx) => {
    const messages: ConversationMessage[] = request.messages.map((m, idx) => ({
      id: `msg_debate_${idx}_${crypto.randomUUID()}`,
      sessionId: request.sessionId,
      role: m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user",
      content: m.content,
      createdAt: new Date().toISOString(),
    }));

    const result = await requestDgxProviderCompletion({
      provider,
      modelId: request.modelId,
      messages,
      fetchImpl,
      proxyTimeoutMs: ctx.timeoutMs,
    });

    return {
      id: `res_debate_${crypto.randomUUID()}`,
      requestId: request.id,
      providerProfileId: provider.id,
      modelId: request.modelId,
      status: "succeeded",
      content: result.content,
      endpoint: result.endpoint,
      route: result.route,
      usage: result.usage,
      createdAt: new Date().toISOString(),
    };
  };
}

export async function runStage3DebateSession(
  input: Stage3DebateInput & {
    packet?: CodingPacket;
    debateId?: string;
    fetchImpl?: typeof fetch;
    perAgentTimeoutMs?: number;
  },
): Promise<Stage3DebateSession> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const baseSession = createStage3DebateSession(input);
  if (input.debateId) {
    baseSession.id = input.debateId;
  }

  // Extract debate context from input
  const lastUserMessage = [...input.messages].reverse().find((m) => m.role === "user");
  const problem = lastUserMessage?.content ?? "Conversation context를 Debate Mode로 승격";
  const summary = summarizeConversation(input.messages);

  const debateContext: DebateContext = {
    sessionId: input.messages[0]?.sessionId ?? "session_desktop_001",
    problem,
    conversationSummary: summary,
    constraints: input.packet?.constraints ?? [],
    openQuestions: input.packet?.reviewerNotes ?? [],
    userPreferences: [],
    memoryTraceIds: [],
  };

  // Build Slots for agents
  const fileSource = getDesktopFileSource();
  const slots: DebateEngineAgentSlot[] = await Promise.all(
    input.agents
      .filter((agent) => agent.enabled)
      .map(async (agent) => {
        const provider = input.providers.find((p) => p.id === agent.providerProfileId);
        if (!provider) {
          throw new Error(`Provider not found for agent ${agent.id}`);
        }

        let systemPrompt = `당신은 ${agent.name} (${agent.role}) 에이전트입니다. 역할과 목적에 맞게 토론에 참여해 주세요.`;
        try {
          const promptReport = await buildAgentSystemPrompt(agent, fileSource);
          if (promptReport.promptText) {
            systemPrompt = promptReport.promptText;
          }
        } catch (e) {
          console.warn(`Failed to build system prompt for agent ${agent.id}`, e);
        }

        return {
          agent,
          complete: createDgxLlmCompletionFn(provider, fetchImpl),
          systemPrompt,
          modelId: agent.modelId ?? provider.defaultModel ?? "gpt-5.5-pro",
          resolveSecret: async () => provider.secretRef?.id,
        };
      })
  );

  // Execute debate rounds via agents engine
  const initialRounds: DebateRound[] = baseSession.rounds.map((round, idx) => ({
    ...round,
    status: idx === 0 ? ("running" as const) : ("pending" as const),
    utterances: [],
  }));

  const enabledRoles = input.agents.filter((a) => a.enabled).map((a) => a.role);
  const roleCounts = enabledRoles.reduce((acc, role) => {
    acc[role] = (acc[role] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const allowMultiPersonaRoles = Object.keys(roleCounts).filter((role) => roleCounts[role]! > 1);

  const debateResult = await runDebate({
    debateId: baseSession.id,
    initialRounds,
    context: debateContext,
    slots,
    engineOptions: {
      perAgentTimeoutMs: input.perAgentTimeoutMs ?? 30000,
      allowMultiPersonaRoles: allowMultiPersonaRoles.length > 0 ? allowMultiPersonaRoles : ["skeptic"],
    },
  });

  // 패치 3: accept/reject/ref 마커를 스키마 링크로 — 의장 confidence가 진짜 신호를 받는다
  const linkedRounds = applyDebateCrossLinks(debateResult.rounds);
  const updatedParticipants = baseSession.participants;
  const updatedHumanPeek = createHumanPeek(updatedParticipants, linkedRounds, input.events, baseSession.promotedAt);

  return {
    ...baseSession,
    rounds: linkedRounds,
    humanPeek: updatedHumanPeek,
  };
}

function getDesktopFileSource() {
  const requireNode = (() => {
    try {
      return Function("return typeof require === 'function' ? require : undefined")();
    } catch {
      return undefined;
    }
  })();

  if (requireNode) {
    try {
      const fs = requireNode("node:fs");
      const path = requireNode("node:path");
      const repoRoot = process.cwd();

      return {
        async readMarkdown(relativePath: string): Promise<string | null> {
          const absolutePath = path.resolve(repoRoot, relativePath);
          try {
            return fs.readFileSync(absolutePath, "utf8");
          } catch (error: any) {
            if (error?.code === "ENOENT") return null;
            throw error;
          }
        },
      };
    } catch (e) {
      console.warn("Failed to initialize Node-based file source", e);
    }
  }

  return {
    async readMarkdown(relativePath: string): Promise<string | null> {
      return null;
    },
  };
}
