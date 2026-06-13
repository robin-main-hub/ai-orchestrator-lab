import type {
  AgentProfile,
  BlueprintDebateReview,
  ConversationMessage,
  DebateRound,
  DebateRoundKind,
  DebateTag,
  DebateUtterance,
  DesignBlueprintInput,
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
import { promoteDebateDecisions } from "../lib/promoteDebateDecisions";
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
  /** 앱빌더 검토 패널에서 승격된 토론이면 출처 세션 id(provenance). conversation-only면 undefined. */
  sourceSessionId?: string;
  /** 앱빌더 초안에서 승격된 토론이면 그 초안 제목(맥락 표시용). conversation-only면 undefined. */
  blueprintTitle?: string;
  /** 앱빌더 초안에서 승격된 토론이면 그 전체 초안(토론 종료 후 review 계산용). conversation-only면 undefined. */
  blueprintContext?: DesignBlueprintInput;
  /** 토론 종료 후 도출된 초안 리뷰(point 5). 모델 출력이므로 truthStatus="generated"(observed 아님). */
  blueprintReview?: BlueprintDebateReview;
};

export type Stage3DebateInput = {
  messages: ConversationMessage[];
  agents: AgentProfile[];
  providers: ProviderProfile[];
  events: EventEnvelope[];
  runtime: RuntimeSnapshot;
  createdAt?: string;
  /**
   * 앱빌더 검토 패널 → 토론 분기. 있으면 토론은 이 **편집된 초안을 검토·반박·개선**하는 것으로
   * 문제를 잡는다(대화 마지막 발화 대신). 없으면 기존 conversation-only 동작 그대로.
   */
  blueprintContext?: DesignBlueprintInput;
  /** 앱빌더 출처 세션(provenance) — debate record/이벤트에 남긴다. */
  sourceSessionId?: string;
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

/**
 * 토론 문제 도출(순수). 앱빌더 초안(blueprintContext)이 있으면 **그 편집된 초안을 검토·반박·
 * 개선**하는 것으로 문제를 잡고(대화 마지막 발화 대신), 없으면 기존 conversation-only 동작.
 * 초안/토론 입력은 planned일 뿐 observed가 아니다 — 여긴 문자열만 만든다(상태 주장 없음).
 */
export function deriveDebateProblem(input: { messages: ConversationMessage[]; blueprintContext?: DesignBlueprintInput }): string {
  if (input.blueprintContext) {
    const bp = input.blueprintContext;
    // 항목당 캡 후 join — 거대 단일 화면이 아래 "검토·반박·개선" 지시를 2000자 밖으로 밀어내지 못하게.
    const screens = bp.screens.map((screen) => `· ${screen.name} (주요액션 ${screen.primaryAction})`.slice(0, 200)).join("\n");
    const accept = bp.acceptanceCriteria.length ? `\n수용 기준: ${bp.acceptanceCriteria.join("; ").slice(0, 400)}` : "";
    return [
      `[앱 초안 검토·반박·개선] "${bp.title}"`,
      `의도: ${bp.userIntent}`,
      `대상: ${bp.targetSurface} · 화면 ${bp.screens.length}개`,
      screens,
      accept,
      "이 초안(planned)을 그대로 받지 말고, 화면 구조·주요 액션·빈/오류 상태·접근성을 검토·반박하고 개선안을 제시하라.",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2_000);
  }
  const lastUserMessage = [...input.messages].reverse().find((message) => message.role === "user");
  return lastUserMessage?.content ?? "Conversation context를 Debate Mode로 승격";
}

/**
 * 초안의 화면/수용기준을 토론 constraints로(엔진 프롬프트에 들어간다). 초안 없으면 빈 배열.
 * 토론 핸드오프 경로는 zod 검증을 거치지 않고(미션 경로만 거침) 엔진도 constraint를 truncate하지
 * 않으므로, 항목 수(32)뿐 아니라 **항목당 길이(300자)도 여기서 가둔다** — 거대/악성 초안이
 * 매 라운드 프롬프트를 부풀리는 것 방지(deriveDebateProblem의 2000자 클립과 같은 방어).
 */
export function blueprintDebateConstraints(blueprintContext?: DesignBlueprintInput): string[] {
  if (!blueprintContext) return [];
  return [
    ...blueprintContext.screens.map((screen) => `화면 "${screen.name}": ${screen.purpose} — 주요 액션 ${screen.primaryAction}`.slice(0, 300)),
    ...blueprintContext.acceptanceCriteria.map((criterion) => `수용 기준: ${criterion}`.slice(0, 300)),
  ].slice(0, 32);
}

export function createStage3DebateSession({
  messages,
  agents,
  providers,
  events,
  runtime,
  createdAt = new Date().toISOString(),
  blueprintContext,
  sourceSessionId,
}: Stage3DebateInput): Stage3DebateSession {
  const debateId = `debate_${crypto.randomUUID()}`;
  const problem = deriveDebateProblem({ messages, blueprintContext });
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
    // 초안 승격이면 초안 제목을 맥락 미리보기 맨 앞에 둔다(어디서 왔는지 보이게).
    contextPreview: [
      ...(blueprintContext ? [`앱 초안: ${blueprintContext.title}`] : []),
      ...messages.slice(-5).map((message) => `${message.role}: ${message.content}`),
    ],
    participants,
    rounds,
    humanPeek: createHumanPeek(participants, rounds, events, createdAt, false),
    statusHub: createStatusHub(runtime, providers, events),
    promotedAt: createdAt,
    sourceSessionId,
    blueprintTitle: blueprintContext?.title,
    // 토론 종료 후 review 계산을 위해 전체 초안을 보존(없으면 일반 토론 — review 미생성).
    blueprintContext,
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
  /** 실제 멀티에이전트 엔진이 돌아간 라이브 결과인가 — mock/스켈레톤이면 false. */
  observed: boolean,
): HumanPeekEntry[] {
  const orchestrator = participants.find((participant) => participant.role === "orchestrator") ?? participants[0];
  const architect = participants.find((participant) => participant.role === "architect") ?? participants[1];
  const reviewer = participants.find((participant) => participant.role === "reviewer") ?? participants[2];

  // 지휘자→설계자/검토자 릴레이는 실제 라이브 실행일 때만 "관측"으로 본다. mock/스켈레톤이면
  // 아직 진짜로 일어난 일이 아니므로 pending — 가짜 observed 금지(프로젝트 핵심 원칙).
  const relayState: HumanPeekEntry["state"] = observed ? "observed" : "pending";

  return [
    {
      id: "peek_spawn_architect",
      kind: "spawn",
      actor: orchestrator?.name ?? "지휘자",
      target: architect?.name ?? "설계자",
      summary: "Debate Context를 전달하고 1차 구조 제안을 요청",
      state: relayState,
      createdAt,
    },
    {
      id: "peek_send_reviewer",
      kind: "send",
      actor: orchestrator?.name ?? "지휘자",
      target: reviewer?.name ?? "검토자",
      summary: "리스크/누락/보안 경계 검토 요청",
      state: relayState,
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
    /**
     * P1-7: 합의 기반 조기 종료(Aegean). 켜면 라운드마다 발언들의 의미적 합의를
     * 감지해, 다수 의견이 β 라운드 지속되면 남은 라운드를 건너뛴다. 기본 켬.
     */
    consensus?: { alpha?: number; beta?: number; similarityThreshold?: number } | false;
  },
): Promise<Stage3DebateSession> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const baseSession = createStage3DebateSession(input);
  if (input.debateId) {
    baseSession.id = input.debateId;
  }

  // Extract debate context from input. 앱빌더 초안이 있으면 문제를 "초안 검토·반박·개선"으로
  // 잡고, 화면/수용기준을 constraints로 넣어 에이전트 프롬프트까지 실제로 전달한다(척 아님).
  const problem = deriveDebateProblem({ messages: input.messages, blueprintContext: input.blueprintContext });
  const summary = summarizeConversation(input.messages);

  const debateContext: DebateContext = {
    sessionId: input.sourceSessionId ?? input.messages[0]?.sessionId ?? "session_desktop_001",
    problem,
    conversationSummary: summary,
    constraints: [...blueprintDebateConstraints(input.blueprintContext), ...(input.packet?.constraints ?? [])],
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
    // P1-7: 명시적으로 false면 끄고, 아니면 기본 합의 종료(α는 발언자 과반 자동)
    consensus:
      input.consensus === false ? undefined : { beta: 2, similarityThreshold: 0.5, ...(input.consensus ?? {}) },
  });

  // 패치 3: accept/reject/ref 마커를 스키마 링크로 — 의장 confidence가 진짜 신호를 받는다
  // + 결정 노드/코딩 영향 승격: 이게 없으면 결정 준비도 게이트가 모든 실토론을 차단한다
  const linkedRounds = promoteDebateDecisions(applyDebateCrossLinks(debateResult.rounds));
  const updatedParticipants = baseSession.participants;
  // 라이브 실행 결과 — 실제 엔진이 돌았으므로 릴레이 관측을 observed로 표기.
  const updatedHumanPeek = createHumanPeek(updatedParticipants, linkedRounds, input.events, baseSession.promotedAt, true);

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
