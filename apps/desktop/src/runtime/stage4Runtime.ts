import type {
  AgentProfile,
  CodingPacket,
  ConversationMessage,
  EventEnvelope,
  MemoryRecord,
  RecallResult,
  Reflection,
  TerminalSlot,
} from "@ai-orchestrator/protocol";

export type Stage4RunStepStatus = "planned" | "ready" | "blocked" | "verified";

export type Stage4RunStep = {
  id: string;
  title: string;
  ownerAgentId: string;
  status: Stage4RunStepStatus;
  permissionState: TerminalSlot["permissionState"];
  summary: string;
};

export type Stage4VerifierReport = {
  id: string;
  status: "passed" | "warning" | "blocked";
  checks: Array<{
    label: string;
    status: "pass" | "warn" | "fail";
  }>;
  notes: string[];
};

export type Stage4RunReplay = {
  id: string;
  eventIds: string[];
  replayable: boolean;
  summary: string;
};

export type Stage4AgentRun = {
  id: string;
  status: "planned" | "ready_for_approval" | "completed";
  primaryAgentId: string;
  soulSummary: string;
  recallTrace: RecallResult[];
  reflection: Reflection;
  steps: Stage4RunStep[];
  verifier: Stage4VerifierReport;
  replay: Stage4RunReplay;
  createdAt: string;
};

export type Stage4AgentRunInput = {
  packet: CodingPacket;
  primaryAgent?: AgentProfile;
  agents: AgentProfile[];
  messages: ConversationMessage[];
  events: EventEnvelope[];
  createdAt?: string;
};

export function createStage4AgentRun({
  packet,
  primaryAgent,
  agents,
  messages,
  events,
  createdAt = new Date().toISOString(),
}: Stage4AgentRunInput): Stage4AgentRun {
  const selectedAgent = primaryAgent ?? agents.find((agent) => agent.role === "orchestrator") ?? agents[0];
  const ownerAgentId = selectedAgent?.id ?? "agent_unassigned";
  const recallTrace = createRecallTrace(packet, messages, createdAt);
  const steps = createRunSteps(packet, ownerAgentId, agents);
  const verifier = createVerifierReport(packet, steps);

  return {
    id: `run_${crypto.randomUUID()}`,
    status: steps.some((step) => step.permissionState === "required") ? "ready_for_approval" : "planned",
    primaryAgentId: ownerAgentId,
    soulSummary: createSoulSummary(selectedAgent),
    recallTrace,
    reflection: createReflection(packet, recallTrace, createdAt),
    steps,
    verifier,
    replay: {
      id: `replay_${crypto.randomUUID()}`,
      eventIds: events.slice(0, 8).map((event) => event.id),
      replayable: true,
      summary: "Event Store의 최근 이벤트와 Coding Packet을 기준으로 run replay stub을 구성했다.",
    },
    createdAt,
  };
}

function createSoulSummary(agent?: AgentProfile): string {
  if (!agent || agent.soulMode === "off") {
    return "soul:off - 실행자는 짧은 작업 지시와 permission boundary만 받는다.";
  }

  if (agent.soulMode === "full") {
    return `${agent.name} full soul - 장기 정체성 파일 전체를 주입 대상으로 표시한다.`;
  }

  if (agent.soulMode === "retrieved") {
    return `${agent.name} retrieved soul - 현재 작업과 관련된 soul 섹션만 검색해 주입한다.`;
  }

  return `${agent.name} summary soul - 역할, 판단 기준, 금기만 요약 주입한다.`;
}

function createRecallTrace(
  packet: CodingPacket,
  messages: ConversationMessage[],
  createdAt: string,
): RecallResult[] {
  const seeds: Array<Pick<MemoryRecord, "layer" | "title" | "content" | "trustLevel">> = [
    {
      layer: "project_memory",
      title: "이벤트 저장소 우선",
      content: "대화, 토론, 실행, 백업은 Event Store를 원본으로 삼고 projection으로 내보낸다.",
      trustLevel: "trusted",
    },
    {
      layer: "user_memory",
      title: "데스크톱 작업실 선호",
      content: "사용자는 맥북 중심의 어두운 작업실 UI와 DGX-02 authority 구조를 선호한다.",
      trustLevel: "trusted",
    },
    {
      layer: "reflection",
      title: "코딩 전달 원칙",
      content: "토론 결과는 자연어 요약이 아니라 CodingPacket 구조로 넘겨야 한다.",
      trustLevel: "trusted",
    },
  ];

  return seeds.map((seed, index) => ({
    record: {
      id: `memory_stage4_${index + 1}`,
      sourceChannel: "desktop",
      createdAt,
      pinned: index < 2,
      ...seed,
    },
    score: Math.max(0.96 - index * 0.08, 0.72),
    usedInDecision: index !== 1 || packet.constraints.length > 0 || messages.length > 0,
    reason: index === 0 ? "run storage boundary" : index === 1 ? "user environment preference" : "handoff format guard",
  }));
}

function createRunSteps(packet: CodingPacket, ownerAgentId: string, agents: AgentProfile[]): Stage4RunStep[] {
  const reviewer = agents.find((agent) => agent.role === "reviewer")?.id ?? ownerAgentId;
  const verifier = agents.find((agent) => agent.role === "verifier")?.id ?? reviewer;
  const executor = agents.find((agent) => agent.role === "executor")?.id ?? ownerAgentId;

  return [
    {
      id: "step_context_assembly",
      title: "Context Assembly",
      ownerAgentId,
      status: "ready",
      permissionState: "not_required",
      summary: `${packet.context.length}개 context와 ${packet.decisions.length}개 decision을 prompt input 후보로 조립`,
    },
    {
      id: "step_coding_handoff",
      title: "Coding Handoff",
      ownerAgentId: executor,
      status: "blocked",
      permissionState: "required",
      summary: "실제 파일 변경/터미널 실행은 approval 전까지 차단",
    },
    {
      id: "step_review",
      title: "Reviewer Pass",
      ownerAgentId: reviewer,
      status: "planned",
      permissionState: "not_required",
      summary: `${packet.verificationPlan.length}개 verification plan을 리뷰 기준으로 사용`,
    },
    {
      id: "step_verifier",
      title: "Verifier Replay",
      ownerAgentId: verifier,
      status: "verified",
      permissionState: "not_required",
      summary: "현재 단계에서는 mock verifier가 구조/권한/백업 경계를 검사",
    },
  ];
}

function createVerifierReport(packet: CodingPacket, steps: Stage4RunStep[]): Stage4VerifierReport {
  const hasPermissionGate = steps.some((step) => step.permissionState === "required");
  const hasVerificationPlan = packet.verificationPlan.length > 0;
  const hasRejectedOptions = packet.rejectedOptions.length > 0;

  return {
    id: `verifier_${crypto.randomUUID()}`,
    status: hasPermissionGate && hasVerificationPlan ? "passed" : "warning",
    checks: [
      {
        label: "permission gate",
        status: hasPermissionGate ? "pass" : "warn",
      },
      {
        label: "verification plan",
        status: hasVerificationPlan ? "pass" : "warn",
      },
      {
        label: "rejected options preserved",
        status: hasRejectedOptions ? "pass" : "warn",
      },
    ],
    notes: [
      "실제 executor 실행은 아직 막혀 있다.",
      "강한 모델 검증과 로컬 모델 검증을 둘 다 받을 수 있게 verifier 단계를 독립시켰다.",
    ],
  };
}

function createReflection(packet: CodingPacket, recallTrace: RecallResult[], createdAt: string): Reflection {
  return {
    sessionId: "session_desktop_001",
    summary: `${packet.goal} 작업을 agent run으로 전환할 준비가 되었다.`,
    decisions: packet.decisions.slice(0, 4),
    risks: recallTrace
      .filter((trace) => trace.record.trustLevel !== "trusted" || !trace.usedInDecision)
      .map((trace) => trace.reason),
    createdAt,
  };
}
