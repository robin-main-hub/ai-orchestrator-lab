import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";

/**
 * 승인 큐 항목이 "위험 실행"인지 — 드로어에서 일반 명령과 다른 UI(빨간 테두리 +
 * 한 번 더 확인)를 줄지 결정한다. 신뢰할 수 없는 출처(untrusted)면 위험으로 본다.
 * 실제 sourceTrust 필드에서만 도출 — 가짜 위험 표시 없음.
 *
 * 순수 함수 — 단위 테스트된다.
 */
export function isRiskyApprovalItem(item: Pick<ApprovalQueueItem, "sourceTrust">): boolean {
  return item.sourceTrust === "untrusted";
}
