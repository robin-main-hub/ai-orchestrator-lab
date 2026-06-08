import type { AgentRole } from "@ai-orchestrator/protocol";
import type { AgentActivityStatus } from "../types";
import { sanitizePublicText } from "./publicRedaction";

export type AgentConversationPromptSuggestionsInput = {
  activity: AgentActivityStatus;
  displayName: string;
  lastAssistantMessageContent?: string;
  memoryRecordCount: number;
  messageCount: number;
  pendingApprovalCount: number;
  role: AgentRole;
};

export function createAgentConversationPromptSuggestions({
  activity,
  displayName,
  lastAssistantMessageContent,
  memoryRecordCount,
  messageCount,
  pendingApprovalCount,
  role,
}: AgentConversationPromptSuggestionsInput): string[] {
  const name = sanitizePublicText(displayName.trim() || "이 동료");
  const latestAnswer = sanitizePublicText(lastAssistantMessageContent?.trim() ?? "");
  if (!latestAnswer) {
    return [];
  }

  const suggestions = [
    createContextFollowupPrompt(role, name, latestAnswer),
    createQueuePrompt(name, pendingApprovalCount, activity),
    createContinuityPrompt(name, memoryRecordCount, messageCount),
  ];

  return suggestions
    .map((suggestion) => sanitizePublicText(suggestion))
    .filter(Boolean)
    .slice(0, 3);
}

function createContextFollowupPrompt(role: AgentRole, name: string, latestAnswer: string) {
  const lower = latestAnswer.toLowerCase();
  if (lower.includes("mock local provider") || latestAnswer.includes("대체 경로")) {
    return `${name}, 방금 대체 경로가 실제 작업 흐름에 미치는 영향과 원래 공급자로 복귀할 조건을 정리해줘.`;
  }
  if (latestAnswer.includes("승인") || latestAnswer.includes("권한")) {
    return `${name}, 방금 답변 기준으로 지금 승인해야 할 항목과 미뤄도 되는 항목을 나눠줘.`;
  }
  if (latestAnswer.includes("테스트") || latestAnswer.includes("검증")) {
    return `${name}, 방금 말한 검증을 내가 바로 실행할 순서로 압축해줘.`;
  }
  if (latestAnswer.includes("기억") || latestAnswer.includes("맥락")) {
    return `${name}, 방금 답변에서 장기 기억으로 남길 것과 버릴 것을 골라줘.`;
  }

  const prompts: Record<AgentRole, string> = {
    architect: `${name}, 방금 답변을 기준으로 설계 경계와 다음 수정 단위를 다시 잡아줘.`,
    auditor: `${name}, 방금 답변에서 증거가 부족한 부분과 검수 포인트를 골라줘.`,
    builder: `${name}, 방금 답변을 바로 코드 작업으로 옮기려면 어떤 파일부터 볼지 정리해줘.`,
    companion: `${name}, 방금 흐름을 이어가기 쉬운 다음 질문 3개로 바꿔줘.`,
    domain_expert: `${name}, 방금 답변에서 빠진 전문 전제나 확인해야 할 개념을 보강해줘.`,
    executor: `${name}, 방금 답변을 실행하려면 명령, 승인, 되돌림 순서를 나눠줘.`,
    external: `${name}, 방금 답변을 외부 공유용 요약과 내부 메모로 분리해줘.`,
    mediator: `${name}, 방금 답변에서 결정된 것과 아직 합의가 필요한 것을 나눠줘.`,
    memory_curator: `${name}, 방금 답변에서 이 에이전트 방에 기억할 핵심만 골라줘.`,
    negotiator: `${name}, 방금 답변을 제안서로 바꾸면 어떤 양보와 조건이 필요한지 정리해줘.`,
    orchestrator: `${name}, 방금 답변 기준으로 다음 큰 바위와 즉시 할 일을 분리해줘.`,
    researcher: `${name}, 방금 답변에서 추가 조사해야 할 출처와 검증 질문을 골라줘.`,
    reviewer: `${name}, 방금 답변에서 회귀 위험과 빠진 테스트만 짚어줘.`,
    risk_officer: `${name}, 방금 답변의 실패 시나리오와 되돌림 기준을 정리해줘.`,
    skeptic: `${name}, 방금 답변에서 가장 약한 가정과 반례를 찔러줘.`,
    verifier: `${name}, 방금 답변을 통과시키기 위한 검증 명령과 성공 기준을 써줘.`,
    watchdog: `${name}, 방금 답변 이후 방치하면 위험한 신호를 찾아줘.`,
  };
  return prompts[role] ?? `${name}, 방금 답변을 기준으로 다음 행동을 제안해줘.`;
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
