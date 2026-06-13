import { Check, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApprovalToastBarItem } from "../lib/approvalToastBar";

/**
 * 승인 toast bar(제안1) — 화면 하단 고정. 승인 대기가 있을 때만 떠서 원터치로 허용/거절.
 * 전역 단일 승인 액션 표면(대시보드 hero·헤더 alert·빈대화 힌트는 이 바를 가리키기만 함).
 *
 * 정직성: ApprovalQueueItem엔 실제 명령 미리보기가 없어 summary(사람용 라벨)만 보여준다.
 * "계열 허용"은 진짜 명령을 가진 StreamingDraftBubble에만 둔다(가짜 prefix 자동승인 오염 방지).
 */
export function ApprovalToastBar({
  item,
  onApprove,
  onReject,
  onOpenHistory,
}: {
  item: ApprovalToastBarItem;
  onApprove: (sourceItemId: string) => void;
  onReject: (sourceItemId: string) => void;
  onOpenHistory?: () => void;
}) {
  return (
    <div
      aria-live="assertive"
      aria-label="승인 필요"
      className={cn(
        "fixed bottom-4 left-1/2 z-50 flex w-[min(640px,calc(100vw-32px))] -translate-x-1/2 items-center gap-3",
        "rounded-2xl border border-amber-400/30 bg-zinc-900/95 px-4 py-3 shadow-2xl shadow-amber-950/20 backdrop-blur-xl",
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-500/15">
        <ShieldAlert className="h-4 w-4 text-amber-300" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-100">{item.summary}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
          onClick={() => onApprove(item.sourceItemId)}
          type="button"
        >
          <Check className="h-3.5 w-3.5" />
          허용
        </button>

        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50"
          onClick={() => onReject(item.sourceItemId)}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
          거절
        </button>

        {onOpenHistory ? (
          <button
            className="inline-flex h-8 items-center rounded-lg border border-zinc-700/70 bg-zinc-800/50 px-2.5 text-[10px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/50"
            onClick={onOpenHistory}
            title="승인 이력 보기"
            type="button"
          >
            이력
          </button>
        ) : null}
      </div>
    </div>
  );
}
