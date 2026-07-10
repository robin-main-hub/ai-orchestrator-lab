import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import type { QueueItem } from "./annexData";
import { AnnexEmptyState } from "./AnnexEmptyState";

const statusIcon: Record<QueueItem["status"], ComponentType<{ className?: string }>> = {
  pending: AlertTriangle,
  ready: CheckCircle2,
  waiting: Clock,
};

function statusToneClass(status: QueueItem["status"]): string {
  if (status === "pending") return "text-warning";
  if (status === "ready") return "text-primary";
  return "text-muted-foreground";
}

function queueTypeLabel(type: QueueItem["type"]): string {
  if (type === "approval") return "승인";
  if (type === "draft") return "초안";
  return "작업";
}

export function AnnexQueuePanel({
  items,
  onViewApproval,
}: {
  items: QueueItem[];
  onViewApproval?: () => void;
}) {
  if (items.length === 0) {
    return (
      <div className="annex-v2__scroll">
        <AnnexEmptyState icon={Clock} title="대기열이 비어 있습니다" subtext="승인 요청이나 패킷 초안이 생기면 여기에 모입니다." />
      </div>
    );
  }

  return (
    <div className="annex-v2__scroll">
      <div className="annex-v2__queue">
        {items.map((item) => {
          const Icon = statusIcon[item.status];
          const clickable = item.type === "approval" && Boolean(onViewApproval);
          const inner = (
            <>
              <Icon className={cn("size-4 shrink-0", statusToneClass(item.status))} aria-hidden="true" />
              <span className="annex-v2__queue-body">
                <span className="annex-v2__queue-title">{item.title}</span>
                <span className="annex-v2__queue-type">{queueTypeLabel(item.type)}</span>
              </span>
              <span className="annex-v2__queue-time aol-mono">{item.timestamp}</span>
            </>
          );
          return clickable ? (
            <button className="annex-card annex-card--interactive annex-v2__queue-item" key={item.id} onClick={onViewApproval} type="button">
              {inner}
            </button>
          ) : (
            <div className="annex-card annex-v2__queue-item" key={item.id}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
