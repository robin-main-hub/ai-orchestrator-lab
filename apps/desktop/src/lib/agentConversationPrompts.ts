import type { AgentRole } from "@ai-orchestrator/protocol";
import type { AgentActivityStatus } from "../types";
import { sanitizePublicText } from "./publicRedaction";

export type AgentConversationPromptSuggestionsInput = {
  activity: AgentActivityStatus;
  displayName: string;
  memoryRecordCount: number;
  messageCount: number;
  pendingApprovalCount: number;
  role: AgentRole;
};

export function createAgentConversationPromptSuggestions({
  activity,
  displayName,
  memoryRecordCount,
  messageCount,
  pendingApprovalCount,
  role,
}: AgentConversationPromptSuggestionsInput): string[] {
  const name = sanitizePublicText(displayName.trim() || "이 동료");
  const suggestions = [
    createRolePrompt(role, name),
    createQueuePrompt(name, pendingApprovalCount, activity),
    createContinuityPrompt(name, memoryRecordCount, messageCount),
  ];

  return suggestions
    .map((suggestion) => sanitizePublicText(suggestion))
    .filter(Boolean)
    .slice(0, 3);
}

function createRolePrompt(role: AgentRole, name: string) {
  const prompts: Record<AgentRole, string> = {
    architect: `${name}, 지금 구조에서 가장 먼저 고쳐야 할 경계와 설계 결정을 정리해줘.`,
    auditor: `${name}, 이번 변경 범위와 증거가 맞는지 감사 관점으로 봐줘.`,
    builder: `${name}, 바로 구현 가능한 최소 작업 단위와 수정 파일을 잡아줘.`,
    companion: `${name}, 내가 이어가기 쉬운 다음 질문과 작업 흐름을 만들어줘.`,
    domain_expert: `${name}, 이 문제에 필요한 전문 맥락과 빠진 전제를 먼저 설명해줘.`,
    executor: `${name}, 지금 실행할 명령과 승인 경계를 먼저 보여줘.`,
    external: `${name}, 외부에 전달해도 되는 요약과 내부에 남길 맥락을 분리해줘.`,
    mediator: `${name}, 서로 충돌하는 의견을 합의 가능한 결정문으로 정리해줘.`,
    memory_curator: `${name}, 이 대화방에서 기억해야 할 것과 버려도 되는 것을 골라줘.`,
    negotiator: `${name}, 상대가 받아들일 제안과 우리가 지킬 선을 함께 써줘.`,
    orchestrator: `${name}, 지금 막힌 일과 다음 큰 바위부터 순서대로 정리해줘.`,
    researcher: `${name}, 믿을 수 있는 자료와 확인해야 할 출처를 먼저 골라줘.`,
    reviewer: `${name}, 이 변경에서 회귀할 수 있는 지점과 빠진 테스트를 찾아줘.`,
    risk_officer: `${name}, 최악의 실패 시나리오와 되돌림 계획을 먼저 잡아줘.`,
    skeptic: `${name}, 내가 놓친 반례와 불편한 가정을 먼저 찔러줘.`,
    verifier: `${name}, 지금 통과해야 할 검증 명령과 성공 기준을 정리해줘.`,
    watchdog: `${name}, 지금 흐름에서 이상 신호와 방치된 작업을 찾아줘.`,
  };
  return prompts[role] ?? `${name}, 지금 맡기 좋은 일을 먼저 제안해줘.`;
}

function createQueuePrompt(name: string, pendingApprovalCount: number, activity: AgentActivityStatus) {
  if (pendingApprovalCount > 0) {
    return `${name}, 승인 대기 ${pendingApprovalCount}건을 먼저 처리해야 하는지 판단해줘.`;
  }
  if (activity === "error") {
    return `${name}, 방금 막힌 원인을 사용자 관점에서 짧게 정리해줘.`;
  }
  if (activity === "waiting_approval") {
    return `${name}, 어떤 승인이 필요한지 근거와 함께 보여줘.`;
  }
  return `${name}, 지금 바로 실행 가능한 다음 행동 3개를 제안해줘.`;
}

function createContinuityPrompt(name: string, memoryRecordCount: number, messageCount: number) {
  if (memoryRecordCount > 0) {
    return `${name}, 지난 기억 ${memoryRecordCount}개를 참고해서 이어서 할 일을 제안해줘.`;
  }
  if (messageCount > 0) {
    return `${name}, 방금 대화 ${messageCount}개를 요약하고 다음 액션을 잡아줘.`;
  }
  return `${name}, 너의 역할과 잘 쓰는 도구를 먼저 소개해줘.`;
}
