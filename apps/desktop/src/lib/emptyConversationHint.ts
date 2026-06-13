import type { AgentActivityStatus } from "../types";

/**
 * 빈 대화 화면 맥락 힌트(제안7) — 시스템 상태에 따라 "지금 먼저 할 것"을 한 줄로.
 * 승인 관련 힌트는 전역 toast bar(제안1)를 **가리키기만** 한다(액션 중복 금지 — 결정 A).
 */
export type EmptyConversationHint = {
  suggestion: string;
  detail: string;
  tone: "amber" | "cyan" | "neutral";
};

export function deriveEmptyConversationHint({
  agentName,
  hasMemoryRecords,
  pendingApprovalCount = 0,
  providerReady,
  selectedAgentActivity = "idle",
}: {
  agentName: string;
  hasMemoryRecords: boolean;
  pendingApprovalCount?: number;
  providerReady: boolean;
  selectedAgentActivity?: AgentActivityStatus;
}): EmptyConversationHint {
  // 공급자 미연결 — 보내기 자체가 막힘
  if (!providerReady) {
    return {
      detail: "좌측 프로바이더 메뉴에서 API 키를 등록하면 바로 대화할 수 있습니다.",
      suggestion: "먼저 공급자를 연결하세요",
      tone: "amber",
    };
  }

  // 승인 대기 — toast bar로 위임(여기선 가리키기만)
  if (pendingApprovalCount > 0) {
    return {
      detail: `${pendingApprovalCount}건의 승인이 대기 중입니다. 하단 승인 바에서 허용하면 이어집니다.`,
      suggestion: "하단 승인 바를 먼저 확인하세요",
      tone: "amber",
    };
  }

  // 에이전트가 승인 대기 중
  if (selectedAgentActivity === "waiting_approval") {
    return {
      detail: `${agentName}가 승인을 기다리고 있습니다. 하단 바에서 허용하면 답변이 이어집니다.`,
      suggestion: `${agentName}의 승인을 기다리는 중`,
      tone: "amber",
    };
  }

  // 기억이 있으면 이어가기 유도
  if (hasMemoryRecords) {
    return {
      detail: `${agentName}는 이전 대화의 맥락을 기억하고 있습니다. 이어서 물어보세요.`,
      suggestion: `${agentName}에게 이어서 말 걸기`,
      tone: "cyan",
    };
  }

  // 기본: 첫 대화
  return {
    detail: `${agentName}와의 첫 대화입니다. 무엇이든 물어보세요.`,
    suggestion: `${agentName}에게 첫 말 걸기`,
    tone: "neutral",
  };
}
