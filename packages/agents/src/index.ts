import type {
  AgentProfile,
  CodingPacket,
  DebateRound,
  DebateRoundKind,
  DebateUtterance,
} from "@ai-orchestrator/protocol";

export type DebateContext = {
  sessionId: string;
  problem: string;
  conversationSummary: string;
  constraints: string[];
  openQuestions: string[];
  userPreferences: string[];
  memoryTraceIds: string[];
};

export const debateRoundTemplates: Array<{ kind: DebateRoundKind; title: string }> = [
  { kind: "problem_definition", title: "문제 정의" },
  { kind: "initial_proposals", title: "1차 제안" },
  { kind: "cross_critique", title: "상호 비판" },
  { kind: "orchestrator_summary", title: "오케스트레이터 요약" },
  { kind: "refinement", title: "보완 라운드" },
  { kind: "final_decision", title: "최종 결정" },
  { kind: "coding_packet", title: "코딩 전달 패킷" },
];

export function createDebateRounds(debateId: string): DebateRound[] {
  return debateRoundTemplates.map((template, index) => ({
    id: `${debateId}_round_${index + 1}`,
    debateId,
    kind: template.kind,
    title: template.title,
    status: index === 0 ? "running" : "pending",
    utterances: [],
  }));
}

export function createMockUtterance(params: {
  agent: AgentProfile;
  roundId: string;
  content: string;
  tag: DebateUtterance["tags"][number];
}): DebateUtterance {
  return {
    id: `utterance_${crypto.randomUUID()}`,
    agentId: params.agent.id,
    roundId: params.roundId,
    content: params.content,
    tags: [params.tag],
    createdAt: new Date().toISOString(),
  };
}

export function createCodingPacketDraft(context: DebateContext): CodingPacket {
  return {
    goal: context.problem,
    context: [
      context.conversationSummary,
      ...context.userPreferences.map((preference) => `사용자 선호: ${preference}`),
    ],
    decisions: ["초기 구현은 protocol-first monorepo skeleton으로 제한한다."],
    rejectedOptions: ["실제 모델 호출을 첫 커밋에 포함하지 않는다."],
    constraints: context.constraints,
    filesToInspect: [
      "packages/protocol/src/index.ts",
      "apps/desktop/src/App.tsx",
      "packages/providers/src/index.ts",
    ],
    implementationPlan: [
      "workspace 구조를 만든다.",
      "공통 타입과 Zod 스키마를 추가한다.",
      "Orchestrator Board UI 골격을 구현한다.",
      "provider/runtime/server는 stub으로 연결한다.",
    ],
    verificationPlan: ["pnpm typecheck", "pnpm test", "pnpm build"],
    reviewerNotes: [
      "API 키 원문은 저장하지 않는다.",
      "터미널 슬롯은 실제 명령 실행 없이 permission state만 표시한다.",
    ],
  };
}

export const defaultAgentProfiles: AgentProfile[] = [
  {
    id: "agent_orchestrator",
    name: "Orchestrator",
    kind: "virtual",
    role: "orchestrator",
    soulMode: "summary",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_architect",
    name: "Architect",
    kind: "virtual",
    role: "architect",
    soulMode: "summary",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_reviewer",
    name: "Reviewer",
    kind: "virtual",
    role: "reviewer",
    soulMode: "retrieved",
    enabled: true,
    permissionLevel: "read_only",
  },
  {
    id: "agent_executor",
    name: "Executor",
    kind: "real",
    role: "executor",
    soulMode: "off",
    enabled: false,
    permissionLevel: "run_safe_commands",
  },
];
