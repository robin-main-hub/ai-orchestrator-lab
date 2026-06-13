import type { ApprovalQueueItem } from "@ai-orchestrator/protocol";
import { deriveApprovalToastItem } from "../lib/approvalToastBar";
import { ApprovalToastBar } from "./ApprovalToastBar";

/**
 * 통합 승인 큐를 읽어 대기 항목이 있을 때만 toast bar를 띄우는 커넥터. App.tsx 배선을 최소화.
 */
export function ApprovalToastBarConnector({
  queue,
  onApprove,
  onApprovePattern,
  onReject,
  onOpenHistory,
}: {
  queue: ApprovalQueueItem[];
  onApprove: (sourceItemId: string) => void;
  onApprovePattern?: (command: string) => void;
  onReject: (sourceItemId: string) => void;
  onOpenHistory?: () => void;
}) {
  const item = deriveApprovalToastItem(queue);
  if (!item) return null;
  return (
    <ApprovalToastBar
      item={item}
      onApprove={onApprove}
      onApprovePattern={onApprovePattern}
      onReject={onReject}
      onOpenHistory={onOpenHistory}
    />
  );
}
