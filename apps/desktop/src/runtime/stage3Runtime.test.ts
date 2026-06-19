import { describe, expect, it } from "vitest";
import type {
  AgentProfile,
  ConversationMessage,
  EventEnvelope,
  ProviderProfile,
  RuntimeSnapshot,
} from "@ai-orchestrator/protocol";
import type { DesignBlueprintInput } from "@ai-orchestrator/protocol";
import {
  blueprintDebateConstraints,
  createStage3DebateSession,
  deriveDebateProblem,
  runStage3DebateSession,
} from "./stage3Runtime";

const messages: ConversationMessage[] = [
  {
    id: "message_user_1",
    sessionId: "session_desktop_001",
    role: "user",
    content: "토론으로 돌려보고 코딩 패킷으로 넘기자",
    createdAt: "2026-05-24T00:00:00.000Z",
  },
];

const agents: AgentProfile[] = [
  {
    id: "agent_orchestrator",
    name: "Orchestrator",
    kind: "virtual",
    role: "orchestrator",
    providerProfileId: "provider_mock",
    modelId: "mock-orchestrator",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
  },
  {
    id: "agent_architect",
    name: "Architect",
    kind: "virtual",
    role: "architect",
    providerProfileId: "provider_mock",
    modelId: "mock-architect",
    soulMode: "summary",
    configSource: "internal",
    enabled: true,
  },
  {
    id: "agent_reviewer",
    name: "Reviewer",
    kind: "virtual",
    role: "reviewer",
    providerProfileId: "provider_mock",
    modelId: "mock-reviewer",
    soulMode: "retrieved",
    configSource: "internal",
    enabled: true,
  },
];

const providers: ProviderProfile[] = [
  {
    id: "provider_mock",
    name: "Mock Provider",
    kind: "custom",
    enabled: true,
    tags: ["mock"],
    trustLevel: "trusted",
  },
  {
    id: "provider_proxy",
    name: "Proxy Provider",
    kind: "custom",
    enabled: true,
    tags: ["proxy"],
    trustLevel: "untrusted",
  },
];

const events: EventEnvelope[] = [
  {
    id: "event_1",
    sessionId: "session_desktop_001",
    type: "conversation.message.created",
    payload: {},
    createdAt: "2026-05-24T00:00:00.000Z",
    source: "desktop",
    sourceTrust: "trusted",
    redacted: false,
  },
];

const runtime: RuntimeSnapshot = {
  status: "degraded",
  dgxStatus: "offline",
  localModelStatus: "online",
  memorySyncStatus: "syncing",
  runtimeNodes: [],
  localModels: [],
  syncTopology: {
    authorityNodeId: "dgx-02",
    authorityLabel: "DGX-02",
    eventStoreMode: "dgx02_authoritative_with_client_cache",
    offlineWritePolicy: "append_local_outbox_when_offline",
    conflictPolicy: "dgx02_authority_wins",
    clients: [],
  },
  updatedAt: "2026-05-24T00:00:00.000Z",
};

describe("stage3 debate runtime", () => {
  it("promotes conversation context into a tagged debate session", () => {
    const session = createStage3DebateSession({
      messages,
      agents,
      providers,
      events,
      runtime,
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(session.problem).toBe("토론으로 돌려보고 코딩 패킷으로 넘기자");
    expect(session.rounds).toHaveLength(7);
    expect(session.rounds.flatMap((round) => round.utterances).some((utterance) => utterance.tags.includes("risk"))).toBe(true);
    expect(session.humanPeek).toHaveLength(3);
    expect(session.statusHub.find((item) => item.id === "providers")?.value).toBe("2 active / 1 risky");
    // 라이브 실행 전(스켈레톤/mock)에는 어떤 릴레이도 observed로 표시하지 않는다(가짜 관측 금지).
    expect(
      session.humanPeek.filter((peek) => peek.kind === "spawn" || peek.kind === "send").every((peek) => peek.state === "pending"),
    ).toBe(true);
  });

  it("uses roles, not English names, to create mock debate utterances", () => {
    const localizedAgents: AgentProfile[] = [
      { ...agents[0]!, id: "agent_makima", name: "마키마", role: "orchestrator" },
      { ...agents[1]!, id: "agent_shinobu", name: "오시노 시노부", role: "architect" },
      { ...agents[2]!, id: "agent_kaguya", name: "시노미야 카구야", role: "reviewer" },
      {
        id: "agent_rem",
        name: "렘",
        kind: "virtual",
        role: "executor",
        providerProfileId: "provider_mock",
        modelId: "mock-executor",
        soulMode: "off",
        configSource: "internal",
        enabled: true,
      },
      {
        id: "agent_yohane",
        name: "츠시마 요시코",
        kind: "virtual",
        role: "skeptic",
        providerProfileId: "provider_mock",
        modelId: "mock-skeptic",
        soulMode: "summary",
        configSource: "markdown",
        enabled: true,
      },
    ];

    const session = createStage3DebateSession({
      messages,
      agents: localizedAgents,
      providers,
      events,
      runtime,
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    const allUtteranceAgentIds = session.rounds.flatMap((round) => round.utterances.map((utterance) => utterance.agentId));

    expect(session.participants).toHaveLength(5);
    expect(session.participants.find((participant) => participant.role === "reviewer")?.agentId).toBe("agent_kaguya");
    expect(allUtteranceAgentIds).toContain("agent_makima");
    expect(allUtteranceAgentIds).toContain("agent_shinobu");
    expect(allUtteranceAgentIds).toContain("agent_kaguya");
    expect(allUtteranceAgentIds).toContain("agent_rem");
  });

  it("runs the live debate end-to-end using runStage3DebateSession", async () => {
    const fakeFetch = async (url: string, init?: RequestInit) => {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            status: "succeeded",
            content: "가상 에이전트의 모의 토론 발언입니다. [[tag:agreement]]",
            route: "server_proxy",
          }),
      } as Response;
    };

    const session = await runStage3DebateSession({
      messages,
      agents,
      providers,
      events,
      runtime,
      fetchImpl: fakeFetch as any,
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(session.rounds).toHaveLength(7);
    expect(session.rounds[0]?.utterances.length).toBeGreaterThan(0);
    expect(session.rounds[0]?.utterances[0]?.content).toContain("가상 에이전트의 모의 토론 발언입니다.");
  });

  it("preserves each agent provider and model binding in live debate proxy requests", async () => {
    const boundAgents: AgentProfile[] = [
      {
        ...agents[0]!,
        providerProfileId: "provider_orchestrator",
        modelId: "model-orchestrator-bound",
      },
      {
        ...agents[1]!,
        providerProfileId: "provider_architect",
        modelId: "model-architect-bound",
      },
      {
        ...agents[2]!,
        providerProfileId: "provider_reviewer",
        modelId: "model-reviewer-bound",
      },
    ];
    const boundProviders: ProviderProfile[] = boundAgents.map((agent) => ({
      id: agent.providerProfileId!,
      name: `${agent.name} Provider`,
      kind: "custom",
      defaultModel: "fallback-model-must-not-win",
      enabled: true,
      tags: ["server-proxy"],
      trustLevel: "trusted",
    }));
    const seenBindings = new Set<string>();
    const fakeFetch = async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        providerProfileId: string;
        modelId: string;
      };
      seenBindings.add(`${body.providerProfileId}:${body.modelId}`);
      expect(body.modelId).not.toBe("fallback-model-must-not-win");
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            status: "succeeded",
            content: "바인딩된 에이전트 발언입니다. [[tag:agreement]]",
            route: "server_proxy",
          }),
      } as Response;
    };

    await runStage3DebateSession({
      messages,
      agents: boundAgents,
      providers: boundProviders,
      events,
      runtime,
      fetchImpl: fakeFetch as any,
      createdAt: "2026-06-05T00:00:00.000Z",
      consensus: false, // 모든 에이전트 발언 검증 — 합의 조기 종료 비활성
    });

    expect(seenBindings).toEqual(
      new Set([
        "provider_orchestrator:model-orchestrator-bound",
        "provider_architect:model-architect-bound",
        "provider_reviewer:model-reviewer-bound",
      ]),
    );
  });
});

describe("patch 19 — 3~4턴 실토론 시뮬레이션 (fold-prior + 상호 인용)", () => {
  it("이전 라운드 발언이 후속 라운드 프롬프트에 접혀 들어가고, 에이전트가 이를 인용한다", async () => {
    const capturedPrompts: Array<{ body: string }> = [];
    const fakeFetch = async (_url: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      capturedPrompts.push({ body });
      // 역할별/맥락별 응답: 설계자는 PLAN-ALPHA 제안, 이후 라운드에서 프롬프트에
      // PLAN-ALPHA가 보이면(=fold-prior 작동) 그걸 인용해 비판한다.
      const isArchitect = body.includes("mock-architect");
      const seesPlan = body.includes("PLAN-ALPHA");
      const content = isArchitect
        ? "PLAN-ALPHA: 어댑터 계층을 분리하는 설계를 제안합니다. [[tag:proposal]]"
        : seesPlan
          ? "PLAN-ALPHA의 어댑터 분리는 마이그레이션 위험이 있습니다. [[tag:risk]]"
          : "맥락 검토 중입니다. [[tag:agreement]]";
      return {
        ok: true,
        text: async () => JSON.stringify({ status: "succeeded", content, route: "server_proxy" }),
      } as Response;
    };

    const session = await runStage3DebateSession({
      messages,
      agents,
      providers,
      events,
      runtime,
      fetchImpl: fakeFetch as any,
      createdAt: "2026-06-11T00:00:00.000Z",
    });

    // ① 3~4턴 이상 실제 진행: 7라운드 전부 발언이 채워짐
    const filledRounds = session.rounds.filter((round) => round.utterances.length > 0);
    expect(filledRounds.length).toBeGreaterThanOrEqual(4);

    // ② fold-prior: 설계자의 PLAN-ALPHA가 어떤 후속 요청 프롬프트에 포함됨
    const promptsWithPlan = capturedPrompts.filter((req) => req.body.includes("PLAN-ALPHA"));
    expect(promptsWithPlan.length).toBeGreaterThan(0);

    // ③ 상호 인용: 비판 라운드 발언 중 PLAN-ALPHA를 인용한 발언이 존재
    const allUtterances = session.rounds.flatMap((round) => round.utterances);
    const citing = allUtterances.filter((utterance) => utterance.content.includes("PLAN-ALPHA의"));
    expect(citing.length).toBeGreaterThan(0);

    // ④ 라운드 상태 전이: 채워진 라운드는 completed
    for (const round of filledRounds) {
      expect(round.status).toBe("completed");
    }
  });
});

describe("앱빌더 → 토론 분기 (blueprintContext + sourceSessionId)", () => {
  const blueprint: DesignBlueprintInput = {
    title: "할 일 칸반",
    userIntent: "카드를 컬럼으로 관리",
    targetSurface: "new_app",
    screens: [
      { name: "보드", purpose: "칸반", primaryAction: "카드 추가", secondaryActions: [], dataNeeded: [], emptyState: "없음", errorState: "실패" },
      { name: "설정", purpose: "컬럼 편집", primaryAction: "컬럼 추가", secondaryActions: [], dataNeeded: [], emptyState: "없음", errorState: "실패" },
    ],
    designTokens: { density: "balanced", tone: "clean_builder", motion: "subtle" },
    acceptanceCriteria: ["드래그로 카드 이동"],
  };

  it("deriveDebateProblem: 초안이 있으면 검토·반박·개선 프레이밍, 없으면 대화 마지막 발화(회귀 없음)", () => {
    const withBp = deriveDebateProblem({ messages, blueprintContext: blueprint });
    expect(withBp).toContain("앱 초안 검토·반박·개선");
    expect(withBp).toContain("할 일 칸반");
    expect(withBp).toContain("검토·반박");

    const withoutBp = deriveDebateProblem({ messages });
    expect(withoutBp).toBe("토론으로 돌려보고 코딩 패킷으로 넘기자"); // 기존 conversation-only 동작 유지
  });

  it("blueprintDebateConstraints: 화면/수용기준을 constraints로(엔진 프롬프트 전달), 초안 없으면 빈 배열", () => {
    const constraints = blueprintDebateConstraints(blueprint);
    expect(constraints.some((c) => c.includes("보드"))).toBe(true);
    expect(constraints.some((c) => c.includes("드래그로 카드 이동"))).toBe(true);
    expect(blueprintDebateConstraints(undefined)).toEqual([]);
  });

  it("createStage3DebateSession: 초안 승격이면 problem이 초안 기반 + sourceSessionId/blueprintTitle 적재", () => {
    const session = createStage3DebateSession({
      messages,
      agents,
      providers,
      events,
      runtime,
      createdAt: "2026-05-24T00:00:00.000Z",
      blueprintContext: blueprint,
      sourceSessionId: "session_appbuild_9",
    });
    expect(session.problem).toContain("할 일 칸반");
    expect(session.sourceSessionId).toBe("session_appbuild_9"); // provenance 적재
    expect(session.blueprintTitle).toBe("할 일 칸반");
    expect(session.contextPreview[0]).toContain("앱 초안: 할 일 칸반");
  });

  it("createStage3DebateSession: 초안 없으면 provenance 필드 undefined(가짜 출처 안 만듦)", () => {
    const session = createStage3DebateSession({ messages, agents, providers, events, runtime, createdAt: "2026-05-24T00:00:00.000Z" });
    expect(session.sourceSessionId).toBeUndefined();
    expect(session.blueprintTitle).toBeUndefined();
  });

  it("거대/악성 초안도 프롬프트를 부풀리지 못한다 — problem 2000자, constraint 항목당 300자 캡", () => {
    const huge = "가".repeat(50_000);
    const hostile: DesignBlueprintInput = {
      ...blueprint,
      title: huge,
      userIntent: huge,
      screens: [{ name: huge, purpose: huge, primaryAction: huge, secondaryActions: [], dataNeeded: [], emptyState: "x", errorState: "y" }],
      acceptanceCriteria: [huge],
    };
    expect(deriveDebateProblem({ messages, blueprintContext: hostile }).length).toBeLessThanOrEqual(2_000);
    const constraints = blueprintDebateConstraints(hostile);
    expect(constraints.length).toBeLessThanOrEqual(32);
    for (const entry of constraints) expect(entry.length).toBeLessThanOrEqual(300); // 항목당 캡(엔진이 truncate 안 함)
  });
});

// Characterization tests for previously-uncovered stage3 debate-runtime pure
// projections (no behavior change, no network, no secret). These pin the
// authority-adjacent debate-promotion seam's pure side-effect-free branches:
// deriveDebateProblem's conversation fallback (last user message reverse-find,
// then the "Debate Mode로 승격" default when no user turn exists), its
// blueprint accept-line omission when acceptanceCriteria is empty,
// summarizeConversation's empty-context default surfaced via the session
// summary, and createStatusHub's tone decision tree (dgx online→ok/offline→
// danger/other→warn, local online→ok else warn, providers untrusted→warn,
// events buffered→ok else warn) surfaced via createStage3DebateSession.
// Only the crypto.randomUUID debate ids are non-deterministic and are not
// asserted.
describe("stage3 debate runtime — pure projection characterization", () => {
  function statusHubOf(over: Partial<RuntimeSnapshot>, providerList = providers, eventList = events) {
    const session = createStage3DebateSession({
      messages,
      agents,
      providers: providerList,
      events: eventList,
      runtime: { ...runtime, ...over },
      createdAt: "2026-05-24T00:00:00.000Z",
    });
    return (id: string) => session.statusHub.find((item) => item.id === id);
  }

  it("returns the last user message and falls back when no user turn exists", () => {
    const multiUser: ConversationMessage[] = [
      { ...messages[0]!, id: "m1", content: "첫 사용자 발화" },
      { ...messages[0]!, id: "m2", role: "assistant", content: "어시스턴트 답" },
      { ...messages[0]!, id: "m3", content: "마지막 사용자 발화" },
    ];
    expect(deriveDebateProblem({ messages: multiUser })).toBe("마지막 사용자 발화");

    const assistantOnly: ConversationMessage[] = [{ ...messages[0]!, role: "assistant", content: "사용자 없음" }];
    expect(deriveDebateProblem({ messages: assistantOnly })).toBe("Conversation context를 Debate Mode로 승격");
    expect(deriveDebateProblem({ messages: [] })).toBe("Conversation context를 Debate Mode로 승격");
  });

  it("omits the acceptance-criteria line in the blueprint problem when none are given", () => {
    const blueprint: DesignBlueprintInput = {
      title: "빈 수용기준 초안",
      userIntent: "테스트",
      targetSurface: "new_app",
      screens: [
        { name: "화면", purpose: "용도", primaryAction: "액션", secondaryActions: [], dataNeeded: [], emptyState: "x", errorState: "y" },
      ],
      designTokens: { density: "balanced", tone: "clean_builder", motion: "subtle" },
      acceptanceCriteria: [],
    };
    const problem = deriveDebateProblem({ messages, blueprintContext: blueprint });
    expect(problem).toContain("빈 수용기준 초안");
    expect(problem).not.toContain("수용 기준:");
  });

  it("summarizes an empty conversation as the no-context default", () => {
    const session = createStage3DebateSession({
      messages: [],
      agents,
      providers,
      events,
      runtime,
      createdAt: "2026-05-24T00:00:00.000Z",
    });
    expect(session.summary).toBe("대화 맥락 없음");
  });

  it("maps DGX status to ok/danger/warn tones", () => {
    expect(statusHubOf({ dgxStatus: "online" })("dgx")?.tone).toBe("ok");
    expect(statusHubOf({ dgxStatus: "offline" })("dgx")?.tone).toBe("danger");
    expect(statusHubOf({ dgxStatus: "degraded" })("dgx")?.tone).toBe("warn");
    expect(statusHubOf({ dgxStatus: "syncing" })("dgx")?.tone).toBe("warn");
  });

  it("maps local model status to ok only when online", () => {
    expect(statusHubOf({ localModelStatus: "online" })("local")?.tone).toBe("ok");
    expect(statusHubOf({ localModelStatus: "degraded" })("local")?.tone).toBe("warn");
  });

  it("warns the providers tile when any provider is untrusted, otherwise ok", () => {
    const trustedOnly: ProviderProfile[] = [{ ...providers[0]! }];
    expect(statusHubOf({}, trustedOnly)("providers")?.tone).toBe("ok");
    expect(statusHubOf({}, trustedOnly)("providers")?.value).toBe("1 active / 0 risky");
    expect(statusHubOf({}, providers)("providers")?.tone).toBe("warn");
  });

  it("warns the events tile only when no events are buffered", () => {
    expect(statusHubOf({}, providers, events)("events")?.tone).toBe("ok");
    expect(statusHubOf({}, providers, [])("events")?.tone).toBe("warn");
    expect(statusHubOf({}, providers, [])("events")?.value).toBe("0 buffered");
  });
});
