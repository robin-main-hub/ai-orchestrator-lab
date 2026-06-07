import type { AgentRole } from "@ai-orchestrator/protocol";

export type AgentToolProfile = {
  label: string;
  tools: string[];
};

export type AgentToolBoundary = "approval" | "read" | "write";

export type AgentToolRuntimeSummary = {
  approvalRequiredCount: number;
  boundaryLabel: string;
  readOnlyCount: number;
  writeCapableCount: number;
};

export type AgentToolCollaborationProfile = {
  focusLabel: string;
  handoffLabel: string;
  headline: string;
  rhythmLabel: string;
};

const assistantToolProfile: AgentToolProfile = {
  label: "보조 도구",
  tools: ["memory.recall", "question.ask", "handoff"],
};

const roleToolProfiles: Record<AgentRole, AgentToolProfile> = {
  orchestrator: {
    label: "지휘 도구",
    tools: ["work.queue", "approval", "tmux.plan"],
  },
  architect: {
    label: "설계 도구",
    tools: ["plan.spec", "diagram", "risk.map"],
  },
  builder: {
    label: "구현 도구",
    tools: ["code.edit", "test.run", "diff.review"],
  },
  reviewer: {
    label: "검토 도구",
    tools: ["diff.review", "evidence.check", "request.change"],
  },
  skeptic: {
    label: "비판 도구",
    tools: ["assumption.check", "countercase", "risk.map"],
  },
  verifier: {
    label: "검증 도구",
    tools: ["test.run", "build.check", "evidence.check"],
  },
  memory_curator: {
    label: "기억 도구",
    tools: ["memory.recall", "memory.rank", "forget.request"],
  },
  executor: {
    label: "실행 도구",
    tools: ["tmux.dispatch", "approval", "run.log"],
  },
  external: assistantToolProfile,
  auditor: {
    label: "감사 도구",
    tools: ["scope.audit", "evidence.check", "policy.guard"],
  },
  researcher: {
    label: "조사 도구",
    tools: ["web.research", "source.rank", "citation"],
  },
  negotiator: {
    label: "협상 도구",
    tools: ["stakeholder.map", "offer.draft", "risk.map"],
  },
  risk_officer: {
    label: "위험 도구",
    tools: ["worstcase", "blast.radius", "rollback.plan"],
  },
  mediator: {
    label: "조율 도구",
    tools: ["conflict.merge", "decision.draft", "handoff"],
  },
  watchdog: {
    label: "감시 도구",
    tools: ["drift.scan", "alert.queue", "evidence.check"],
  },
  domain_expert: {
    label: "전문 도구",
    tools: ["domain.recall", "source.rank", "answer.draft"],
  },
  companion: {
    label: "동행 도구",
    tools: ["memory.recall", "question.ask", "daily.plan"],
  },
};

const roleCollaborationProfiles: Record<AgentRole, AgentToolCollaborationProfile> = {
  orchestrator: {
    focusLabel: "우선순위와 대기열",
    handoffLabel: "결정·승인 정리",
    headline: "흩어진 일을 순서대로 묶고, 지금 누가 무엇을 맡을지 또렷하게 나눕니다.",
    rhythmLabel: "짧게 방향 잡고 바로 분배",
  },
  architect: {
    focusLabel: "구조와 경계",
    handoffLabel: "명세·위험 단서",
    headline: "아이디어를 실행 가능한 구조로 접고, 애매한 경계를 먼저 표시합니다.",
    rhythmLabel: "큰 그림을 잡은 뒤 작은 단위로 쪼갬",
  },
  builder: {
    focusLabel: "작게 고치는 구현",
    handoffLabel: "변경 diff와 확인 포인트",
    headline: "필요한 코드만 만지고, 사용자가 바로 체감할 수 있는 동작으로 연결합니다.",
    rhythmLabel: "읽고 고치고 확인",
  },
  reviewer: {
    focusLabel: "회귀와 빠진 검증",
    handoffLabel: "수정 요청과 근거",
    headline: "변경의 좋은 점보다 먼저 깨질 수 있는 지점을 차분히 찾습니다.",
    rhythmLabel: "증거부터 보고 짧게 판정",
  },
  skeptic: {
    focusLabel: "가정과 반례",
    handoffLabel: "놓친 조건 목록",
    headline: "당연해 보이는 선택을 한 번 비틀어 보고, 실패할 장면을 먼저 꺼냅니다.",
    rhythmLabel: "불편한 질문을 작게 던짐",
  },
  verifier: {
    focusLabel: "테스트와 재현성",
    handoffLabel: "검증 결과와 남은 위험",
    headline: "말로 끝내지 않고 확인 가능한 근거를 붙여 작업 상태를 정리합니다.",
    rhythmLabel: "확인 명령과 결과를 나란히 봄",
  },
  memory_curator: {
    focusLabel: "장기 기억과 맥락",
    handoffLabel: "기억 후보와 정리 요청",
    headline: "이전 대화에서 지금 필요한 단서만 꺼내고, 오래된 기억은 정리 대상으로 넘깁니다.",
    rhythmLabel: "기억을 고르고 말투에 반영",
  },
  executor: {
    focusLabel: "실행 순서와 승인",
    handoffLabel: "실행 기록과 다음 명령",
    headline: "명령을 바로 던지기보다 목적, 입력, 승인 지점을 먼저 맞춰 움직입니다.",
    rhythmLabel: "멈춤 지점을 두고 실행",
  },
  external: {
    focusLabel: "질문과 인계",
    handoffLabel: "상대에게 보낼 말",
    headline: "외부에 보여도 되는 말과 내부에 남겨야 할 맥락을 분리해 정리합니다.",
    rhythmLabel: "조심스럽게 묻고 짧게 넘김",
  },
  auditor: {
    focusLabel: "범위와 정책 경계",
    handoffLabel: "감사 메모와 증거",
    headline: "작업이 약속한 범위 안에 있는지 보고, 설명 가능한 흔적을 남깁니다.",
    rhythmLabel: "체크리스트처럼 차분히 확인",
  },
  researcher: {
    focusLabel: "출처와 맥락",
    handoffLabel: "출처 묶음과 요약",
    headline: "정보를 많이 모으기보다 믿을 수 있는 단서를 골라 대화에 붙입니다.",
    rhythmLabel: "찾고 거르고 짧게 인용",
  },
  negotiator: {
    focusLabel: "이해관계와 제안",
    handoffLabel: "선택지와 양보선",
    headline: "상대가 받아들일 수 있는 표현과 우리가 지킬 선을 함께 정리합니다.",
    rhythmLabel: "말의 온도를 먼저 맞춤",
  },
  risk_officer: {
    focusLabel: "영향 범위와 복구",
    handoffLabel: "위험도와 되돌림 계획",
    headline: "가장 안 좋은 경우를 먼저 상상하고, 작게 되돌릴 길을 붙입니다.",
    rhythmLabel: "위험을 낮춘 뒤 진행",
  },
  mediator: {
    focusLabel: "충돌 지점과 합의",
    handoffLabel: "결정 초안과 인계",
    headline: "서로 다른 의견을 한 화면에 놓고, 다음 결정으로 넘어갈 문장을 만듭니다.",
    rhythmLabel: "차이를 줄이고 결론을 씀",
  },
  watchdog: {
    focusLabel: "변화 감시와 알림",
    handoffLabel: "이상 신호와 대기열",
    headline: "작은 변화가 쌓여 방향이 틀어지는 순간을 조용히 잡아냅니다.",
    rhythmLabel: "조용히 보고 필요할 때 알림",
  },
  domain_expert: {
    focusLabel: "도메인 기억과 답변",
    handoffLabel: "전문 맥락과 초안",
    headline: "일반론보다 해당 분야의 맥락을 먼저 붙여 답변의 밀도를 올립니다.",
    rhythmLabel: "전문 단서를 쉬운 말로 바꿈",
  },
  companion: {
    focusLabel: "대화 흐름과 일정",
    handoffLabel: "질문·계획·인계",
    headline: "사용자가 지금 이어가기 좋은 다음 한 문장을 찾고, 흐름이 끊기지 않게 받칩니다.",
    rhythmLabel: "가볍게 묻고 오래 기억",
  },
};

const toolBadgeLabels: Record<string, string> = {
  "alert.queue": "알림 대기열",
  "answer.draft": "답변 초안",
  "approval": "승인 확인",
  "assumption.check": "가정 점검",
  "blast.radius": "영향 범위",
  "build.check": "빌드 확인",
  "citation": "출처 정리",
  "code.edit": "코드 수정",
  "conflict.merge": "의견 병합",
  "countercase": "반례 검토",
  "daily.plan": "일정 정리",
  "decision.draft": "결정 초안",
  "diagram": "구조도",
  "diff.review": "변경 검토",
  "domain.recall": "전문 기억",
  "drift.scan": "변화 감시",
  "evidence.check": "근거 확인",
  "forget.request": "기억 정리 요청",
  "handoff": "인계 정리",
  "memory.rank": "기억 순위",
  "memory.recall": "기억 조회",
  "offer.draft": "제안 초안",
  "plan.spec": "기획 명세",
  "policy.guard": "정책 점검",
  "question.ask": "질문 정리",
  "request.change": "수정 요청",
  "risk.map": "위험 지도",
  "rollback.plan": "복구 계획",
  "run.log": "실행 기록",
  "scope.audit": "범위 감사",
  "source.rank": "출처 선별",
  "stakeholder.map": "관계자 지도",
  "test.run": "테스트 확인",
  "tmux.dispatch": "Tmux 전달",
  "tmux.plan": "Tmux 계획",
  "web.research": "웹 조사",
  "work.queue": "작업 대기열",
  "worstcase": "최악 상황",
};

const toolBoundaries: Record<string, AgentToolBoundary> = {
  "alert.queue": "read",
  "answer.draft": "write",
  "approval": "approval",
  "assumption.check": "read",
  "blast.radius": "read",
  "build.check": "read",
  "citation": "read",
  "code.edit": "approval",
  "conflict.merge": "write",
  "countercase": "read",
  "daily.plan": "write",
  "decision.draft": "write",
  "diagram": "write",
  "diff.review": "read",
  "domain.recall": "read",
  "drift.scan": "read",
  "evidence.check": "read",
  "forget.request": "approval",
  "handoff": "write",
  "memory.rank": "read",
  "memory.recall": "read",
  "offer.draft": "write",
  "plan.spec": "write",
  "policy.guard": "read",
  "question.ask": "write",
  "request.change": "approval",
  "risk.map": "read",
  "rollback.plan": "approval",
  "run.log": "read",
  "scope.audit": "read",
  "source.rank": "read",
  "stakeholder.map": "read",
  "test.run": "approval",
  "tmux.dispatch": "approval",
  "tmux.plan": "write",
  "web.research": "read",
  "work.queue": "read",
  "worstcase": "read",
};

export function getAgentToolProfile(role: AgentRole): AgentToolProfile {
  return roleToolProfiles[role] ?? assistantToolProfile;
}

export function getAgentToolBadgeLabels(role: AgentRole): string[] {
  return getAgentToolProfile(role).tools.map((tool) => toolBadgeLabels[tool] ?? tool);
}

export function getRoleToolDefinitionGaps(): string[] {
  const tools = new Set(
    Object.values(roleToolProfiles)
      .flatMap((profile) => profile.tools),
  );
  return [...tools]
    .filter((tool) => !toolBadgeLabels[tool] || !toolBoundaries[tool])
    .sort();
}

export function getAgentToolProfileSummary(role: AgentRole) {
  const profile = getAgentToolProfile(role);
  return {
    label: profile.label,
    runtime: createAgentToolRuntimeSummary(profile.tools),
    visibleBadges: getAgentToolBadgeLabels(role).slice(0, 3),
  };
}

export function getAgentToolCollaborationProfile(role: AgentRole): AgentToolCollaborationProfile {
  return roleCollaborationProfiles[role] ?? roleCollaborationProfiles.external;
}

export function createAgentToolRuntimeSummary(tools: string[]): AgentToolRuntimeSummary {
  const boundaries = tools.map((tool) => toolBoundaries[tool] ?? "approval");
  const approvalRequiredCount = boundaries.filter((boundary) => boundary === "approval").length;
  const writeCapableCount = boundaries.filter((boundary) => boundary === "write").length;
  const readOnlyCount = boundaries.filter((boundary) => boundary === "read").length;
  const boundaryLabel =
    approvalRequiredCount > 0
      ? `승인 필요 ${approvalRequiredCount}개`
      : writeCapableCount > 0
        ? `초안 작성 ${writeCapableCount}개`
        : "읽기 중심";

  return {
    approvalRequiredCount,
    boundaryLabel,
    readOnlyCount,
    writeCapableCount,
  };
}
