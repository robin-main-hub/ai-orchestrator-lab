import { Check, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ApprovalToastBarItem } from "../lib/approvalToastBar";
import { resolveIdentityInitial, resolveRequesterName } from "../lib/personaIdentity";

/**
 * 승인 toast bar(제안1) — 화면 하단 고정. 승인 대기가 있을 때만 떠서 원터치로 허용/거절.
 * 전역 단일 승인 액션 표면(대시보드 hero·헤더 alert·빈대화 힌트는 이 바를 가리키기만 함).
 *
 * 동료감(companion): 익명 "에이전트"가 아니라 이름 있는 동료가 권한을 요청하는 것처럼 보이게 한다
 * ("시노부 · Implementer 가 터미널 실행 승인을 요청해요"). 신원은 best-effort(세션 활성 에이전트)이며,
 * 모르면 정직하게 actor enum 라벨("에이전트"/"운영자")로 폴백한다 — 가짜 페르소나를 만들지 않는다.
 *
 * 정직성: summary는 사람용 라벨이다. 실제 명령(commandPreview)이 있을 때만 모노스페이스로
 * 보여주고, safeCommandPolicy 허용 계열이면 "안전 계열" 배지를 읽기 전용으로 단다. 요약에서
 * 명령을 합성하지 않는다. 자동승인(계열 허용) 액션은 여기 두지 않는다 — 안전 계열 일괄 승인은
 * 별도 표면(작업 C)에서 명시적으로 처리한다.
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
  const requester = item.requester;
  const name = requester ? resolveRequesterName(requester) : undefined;
  const role = requester?.role?.trim() || undefined;
  const model = requester?.model?.trim() || undefined;
  const avatarUrl = requester?.avatarUrl?.trim() || undefined;
  // "이름 · 역할 가 …요" — 이름 있는 동료가 묻는 어조. 신원 없으면 actor 라벨로 자연스럽게 폴백.
  const askLine = name
    ? `${name}${role ? ` · ${role}` : ""} 가 승인을 요청해요`
    : undefined;

  return (
    <div
      aria-live="assertive"
      aria-label="승인 필요"
      className={cn(
        "fixed bottom-4 left-1/2 z-50 flex w-[min(640px,calc(100vw-32px))] -translate-x-1/2 items-center gap-3",
        "rounded-2xl border border-amber-400/30 bg-zinc-900/95 px-4 py-3 shadow-2xl shadow-amber-950/20 backdrop-blur-xl",
      )}
    >
      {requester ? (
        avatarUrl ? (
          <img
            alt={name ?? "요청 동료"}
            className="h-9 w-9 shrink-0 rounded-full border border-amber-400/30 object-cover"
            data-testid="approval-toast-requester-avatar"
            src={avatarUrl}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-400/30 bg-amber-500/15 text-sm font-semibold text-amber-200"
            data-testid="approval-toast-requester-initial"
          >
            {resolveIdentityInitial(name ?? "?")}
          </span>
        )
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-500/15">
          <ShieldAlert className="h-4 w-4 text-amber-300" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        {requester ? (
          <div className="mb-0.5 flex min-w-0 flex-wrap items-center gap-1.5" data-testid="approval-toast-requester">
            <span className="truncate text-sm font-semibold text-zinc-50" data-testid="approval-toast-requester-name">
              {name}
            </span>
            {role ? (
              <Badge
                variant="outline"
                className="border-amber-400/30 text-[10px] text-amber-200"
                data-testid="approval-toast-requester-role"
              >
                {role}
              </Badge>
            ) : null}
            {model ? (
              <span className="truncate text-[10px] text-zinc-500" data-testid="approval-toast-requester-model">
                {model}
              </span>
            ) : null}
          </div>
        ) : null}

        {askLine ? (
          <p className="truncate text-[11px] text-amber-200/80" data-testid="approval-toast-ask-line">
            {askLine}
          </p>
        ) : null}

        <p className="truncate text-sm font-medium text-zinc-100">{item.summary}</p>
        {item.commandPreview ? (
          <div className="mt-1 flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300" title={item.commandPreview}>
              {item.commandPreview}
            </code>
            {item.safeFamily ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300"
                title="safeCommandPolicy 허용 계열 (읽기 전용 표시)"
              >
                <ShieldCheck className="h-3 w-3" />
                안전 계열
              </span>
            ) : null}
          </div>
        ) : null}
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
