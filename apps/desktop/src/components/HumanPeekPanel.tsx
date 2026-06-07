import { useState } from "react";
import { Eye, ShieldAlert, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Stage8IngressSnapshot } from "../runtime/stage8Ingress";
import { ingressReasonLabel } from "../lib/ingressReasonLabels";
import { guardStepLabel } from "../lib/uiLabels";
import { ingressApprovalStateLabel } from "../lib/railStatusLabels";

export type HumanPeekPanelProps = {
  ingressSnapshot?: Stage8IngressSnapshot;
};

export function HumanPeekPanel({ ingressSnapshot }: HumanPeekPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (!ingressSnapshot) {
    return (
      <section className="rounded-lg border border-border bg-card p-3 text-center text-xs text-muted-foreground">
        대기 중인 외부 유입 Ingress 신호가 없습니다.
      </section>
    );
  }

  const { channel, result, zeroTokenSafety } = ingressSnapshot;

  return (
    <section
      aria-label="외부 유입 확인"
      className="human-peek-root rounded-lg border border-border bg-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <button
          aria-expanded={isOpen}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
          onClick={() => setIsOpen((o) => !o)}
          type="button"
        >
          <Eye className="h-4 w-4 text-muted-foreground" />
          외부 유입 확인 (인입 보호)
        </button>
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded font-mono uppercase",
          result.accepted ? "bg-primary/20 text-primary" : "bg-destructive/20 text-destructive"
        )}>
          {channel}
        </span>
      </div>

      {isOpen ? (
        <div className="space-y-4 p-3 text-xs">
          {/* 상태 요약 */}
          <div className="flex items-center justify-between rounded bg-muted/40 p-2">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">상태 요약</div>
              <div className="font-semibold text-foreground">결과: {ingressApprovalStateLabel(result.approvalState)}</div>
              <div className="text-[10px] text-muted-foreground">{ingressReasonLabel(result.reason)}</div>
            </div>
            {result.accepted ? (
              <CheckCircle className="h-5 w-5 text-primary" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-destructive" />
            )}
          </div>

          {/* 7단계 보호 절차 */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              인입 보호 7단계 검사
            </div>
            <div className="space-y-1 font-mono text-[10px]">
              {result.guardSteps.map((step) => {
                const isPassed = step.status === "passed";
                const isBlocked = step.status === "blocked";
                const isQueued = step.status === "queued";

                return (
                  <div
                    key={step.name}
                    className="flex items-start justify-between border-b border-border/40 py-1"
                  >
                    <span className="text-foreground shrink-0">{guardStepLabel(step.name)}</span>
                    <div className="text-right min-w-0 pl-4">
                      <span className={cn(
                        "font-semibold",
                        isPassed && "text-primary",
                        isBlocked && "text-destructive",
                        isQueued && "text-warning"
                      )}>
                        [{guardStatusLabel(step.status)}]
                      </span>
                      <span className="text-muted-foreground block truncate max-w-[180px]" title={ingressReasonLabel(step.reason)}>
                        {ingressReasonLabel(step.reason)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 0토큰 안전 영역 */}
          <div className="rounded-md border border-border/80 bg-card/40 p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              0토큰 안전 크론
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[10px] text-muted-foreground font-mono">
              <div>상태: <span className="text-foreground">활성 ({zeroTokenSafety.cadence})</span></div>
              <div>지연 큐: <span className="text-warning font-semibold">{zeroTokenSafety.pendingCount}</span></div>
              <div className="col-span-2">최종 체크: {zeroTokenSafety.lastCheck}</div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function guardStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    blocked: "차단",
    passed: "통과",
    queued: "대기",
    skipped: "건너뜀",
  };
  return labels[status] ?? status;
}
