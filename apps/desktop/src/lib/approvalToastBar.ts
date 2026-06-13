import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";

/**
 * 승인 toast bar(제안1) — 전역 단일 승인 액션 표면. 통합 control queue에서 지금 가장 급한
 * 승인 1건을 골라 화면 하단 고정 바로 보여준다. 대기 항목이 없으면 undefined → 바 숨김.
 *
 * 우선순위: 실행 가능한 터미널/디스패치 승인(명령 미리보기 있음) 먼저, 그 외 첫 required 항목.
 * 정직성 주의: `command`는 실제 명령 미리보기가 있을 때만(없으면 미표시).
 */
export type ApprovalToastBarItem = {
  sourceItemId: string;
  summary: string;
  command?: string;
};

/** 명령 미리보기를 가진 "실행형" 승인인지 — replayKind=tmux_dispatch(자율실행) 또는 action=terminal_run. */
function isCommandApproval(item: ApprovalQueueItem): boolean {
  return item.replayKind === "tmux_dispatch" || item.action === "terminal_run";
}

export function deriveApprovalToastItem(queue: ApprovalQueueItem[]): ApprovalToastBarItem | undefined {
  const pending = queue.filter((item) => item.state === "required");
  if (pending.length === 0) return undefined;

  // 실행 가능한 명령 디스패치(터미널/자율실행)를 우선 — 운영자가 바로 판단할 수 있다.
  const target = pending.find(isCommandApproval) ?? pending[0]!;

  return {
    // 명령형 승인은 summary가 곧 명령 미리보기. 그 외엔 command 없음(가짜 명령 안 만듦).
    command: isCommandApproval(target) ? target.summary : undefined,
    sourceItemId: target.sourceItemId,
    summary: target.summary,
  };
}
