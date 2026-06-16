import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";
import { deriveApprovalToastItem, type ApprovalToastRequesterContext } from "../lib/approvalToastBar";
import { ApprovalToastBar } from "./ApprovalToastBar";

/**
 * 통합 승인 큐를 읽어 대기 항목이 있을 때만 toast bar를 띄우는 커넥터. App.tsx 배선을 최소화.
 *
 * requester: App이 가진 세션 활성 에이전트 신원(이름/역할/모델/아바타)을 best-effort로 넘긴다.
 * 큐 항목엔 페르소나가 없으므로 이 컨텍스트로 "누가 요청하는지"를 투영한다. 없으면 정직 폴백.
 */
export function ApprovalToastBarConnector({
  queue,
  requester,
  onApprove,
  onReject,
  onOpenHistory,
}: {
  queue: ApprovalQueueItem[];
  /** 세션 활성 에이전트/운영자 신원(best-effort). 없으면 actor 라벨로 폴백. */
  requester?: ApprovalToastRequesterContext;
  onApprove: (sourceItemId: string) => void;
  onReject: (sourceItemId: string) => void;
  onOpenHistory?: () => void;
}) {
  const item = deriveApprovalToastItem(queue, requester);
  if (!item) return null;
  return <ApprovalToastBar item={item} onApprove={onApprove} onReject={onReject} onOpenHistory={onOpenHistory} />;
}
