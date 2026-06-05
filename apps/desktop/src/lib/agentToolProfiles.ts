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

export function getAgentToolProfileSummary(role: AgentRole) {
  const profile = getAgentToolProfile(role);
  return {
    label: profile.label,
    runtime: createAgentToolRuntimeSummary(profile.tools),
    visibleBadges: getAgentToolBadgeLabels(role).slice(0, 3),
  };
}

export function createAgentToolRuntimeSummary(tools: string[]): AgentToolRuntimeSummary {
  const boundaries = tools.map((tool) => toolBoundaries[tool] ?? "read");
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
