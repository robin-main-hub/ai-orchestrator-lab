import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";
import { deriveApprovalEvidence } from "./approvalCommandEvidence";

/**
 * 승인 toast bar(제안1) — 전역 단일 승인 액션 표면. 통합 control queue에서 지금 가장 급한
 * 승인 1건을 골라 화면 하단 고정 바로 보여준다. 대기 항목이 없으면 undefined → 바 숨김.
 *
 * 우선순위: 실행형(터미널/자율실행) 승인 먼저, 그 외 첫 required 항목.
 *
 * 정직성(중요): summary는 명령이 아니라 사람용 라벨이다. 명령은 항목이 **실제 commandPreview를
 * 들고 있을 때만**(터미널/tmux 디스패치) 노출한다. 요약에서 명령을 합성하지 않는다. provider/merge/
 * rollback/secret처럼 명령이 없는 항목은 commandPreview를 비워 둔다. safeFamily는 진짜 명령이
 * safeCommandPolicy 허용 계열일 때만 true — 자동승인 액션이 아니라 읽기 전용 표시다.
 */
export type ApprovalToastBarItem = {
  sourceItemId: string;
  summary: string;
  /** 진짜 명령 미리보기 — 있을 때만(모노스페이스로 표시). 없으면 라벨만 보여준다. */
  commandPreview?: string;
  /** 진짜 명령이 safeCommandPolicy 허용 계열이면 true (읽기 전용 안전 표시) */
  safeFamily?: boolean;
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
  const evidence = deriveApprovalEvidence(target);
  const base: ApprovalToastBarItem = { sourceItemId: target.sourceItemId, summary: target.summary };
  if (evidence.kind === "command") {
    base.commandPreview = evidence.commandPreview;
    base.safeFamily = evidence.safe.allowed;
  }
  return base;
}
