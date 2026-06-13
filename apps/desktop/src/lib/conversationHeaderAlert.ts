import type { ProviderReadinessStatus } from "@ai-orchestrator/protocol";
import type { AgentActivityStatus } from "../types";

/**
 * 대화 헤더의 조건부 경고 배너(제안3, 안전판) — "상태 요약" Popover를 대체한다.
 * **문제가 있을 때만** 한 줄로 뜬다(평상시 undefined → 배너 미표시). 승인 관련은 전역
 * toast bar(제안1)를 가리키기만 한다(액션 중복 금지 — 결정 A).
 */
export type ConversationHeaderAlert = {
  label: string;
  tone: "amber" | "rose";
};

export function deriveConversationHeaderAlert(input: {
  pendingApprovalCount: number;
  providerReadinessStatus: ProviderReadinessStatus;
  selectedAgentActivity: AgentActivityStatus;
}): ConversationHeaderAlert | undefined {
  // 공급자 설정/차단 — 보내기 자체가 막힘
  if (input.providerReadinessStatus === "credential_required" || input.providerReadinessStatus === "blocked") {
    return { label: "공급자 설정이 필요합니다 — 보내기 전에 프로바이더를 확인하세요", tone: "rose" };
  }
  // 공급자 승인 필요 — toast 바로 위임
  if (input.providerReadinessStatus === "needs_approval") {
    return { label: "공급자 승인 필요 — 하단 승인 바에서 허용하면 바로 전송됩니다", tone: "amber" };
  }
  // 에이전트가 승인 대기 중
  if (input.selectedAgentActivity === "waiting_approval" && input.pendingApprovalCount > 0) {
    return { label: `승인 ${input.pendingApprovalCount}건 대기 — 하단 바에서 허용하면 에이전트가 이어집니다`, tone: "amber" };
  }
  // 마지막 요청 오류
  if (input.selectedAgentActivity === "error") {
    return { label: "마지막 요청에서 오류가 발생했습니다 — 다시 시도하거나 관제판을 확인하세요", tone: "rose" };
  }
  return undefined;
}
