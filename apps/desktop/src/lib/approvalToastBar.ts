import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";

/**
 * 승인 toast bar(제안1) — 전역 단일 승인 액션 표면. 통합 control queue에서 지금 가장 급한
 * 승인 1건을 골라 화면 하단 고정 바로 보여준다. 대기 항목이 없으면 undefined → 바 숨김.
 *
 * 우선순위: 실행형(터미널/자율실행) 승인 먼저, 그 외 첫 required 항목.
 *
 * 정직성(중요): ApprovalQueueItem엔 **실제 명령 미리보기 필드가 없다**. summary는 명령이 아니라
 * 사람용 라벨("터미널 실행 · 사유" / "terminal_run from agent")이다. 따라서 toast는 **명령을
 * 표시하지 않고**(가짜 명령 금지) summary 라벨만 보여준다. "계열 허용"(명령 prefix 자동승인)도
 * 진짜 명령이 있는 StreamingDraftBubble 경로에만 두고 toast엔 두지 않는다(가짜 prefix가 세션
 * 자동승인 목록을 오염시키는 것 방지).
 */
export type ApprovalToastBarItem = {
  sourceItemId: string;
  summary: string;
};

/** "실행형" 승인인지 — replayKind=tmux_dispatch(자율실행) 또는 action=terminal_run. 정렬 우선용. */
function isCommandApproval(item: ApprovalQueueItem): boolean {
  return item.replayKind === "tmux_dispatch" || item.action === "terminal_run";
}

export function deriveApprovalToastItem(queue: ApprovalQueueItem[]): ApprovalToastBarItem | undefined {
  const pending = queue.filter((item) => item.state === "required");
  if (pending.length === 0) return undefined;

  // 실행형(터미널/자율실행) 승인을 우선 노출 — 운영자가 바로 판단할 가능성이 높다.
  const target = pending.find(isCommandApproval) ?? pending[0]!;
  return { sourceItemId: target.sourceItemId, summary: target.summary };
}
