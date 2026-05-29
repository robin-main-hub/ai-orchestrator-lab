import { useState } from "react";
import { Eye, ShieldAlert, CheckCircle, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Stage8IngressSnapshot } from "../runtime/stage8Ingress";
import { triggerReauth } from "../lib/authHelper";

export type HumanPeekPanelProps = {
  ingressSnapshot?: Stage8IngressSnapshot;
};

export function HumanPeekPanel({ ingressSnapshot }: HumanPeekPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!ingressSnapshot) {
    return (
      <section className="rounded-lg border border-border bg-card p-3 text-center text-xs text-muted-foreground">
        대기 중인 외부 유입 Ingress 신호가 없습니다.
      </section>
    );
  }

  const { channel, result, approvals, checklist, zeroTokenSafety } = ingressSnapshot;

  // 세션 만료 및 재인증 요구 상황 감지
  const isSessionExpired = result.guardSteps.some(
    (step) => step.name.toLowerCase().includes("oauth") && step.status === "blocked"
  );

  const handleReauth = async () => {
    setIsRefreshing(true);
    try {
      await triggerReauth("grok-oauth-1");
    } catch (err) {
      console.error("Reauth trigger error:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <section
      aria-label="Human Peek"
      className="human-peek-root rounded-lg border border-border bg-card"
    >
      {/* 만료 경고 배너 */}
      {isSessionExpired && (
        <div className="bg-destructive/10 border-b border-destructive/20 p-3 flex flex-col gap-2 rounded-t-lg">
          <div className="flex items-center gap-2 text-destructive text-xs font-semibold">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>OAuth 세션이 만료되었습니다!</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-normal">
            API 호출이 차단되어 에이전트의 작동이 일시 정지되었습니다. 
            아래 재인증 단추를 클릭하여 OAuth 연결을 갱신하십시오.
          </p>
          <button
            onClick={handleReauth}
            disabled={isRefreshing}
            className="flex items-center justify-center gap-1.5 w-full py-1.5 bg-destructive text-destructive-foreground text-xs font-bold rounded-md hover:bg-destructive/90 transition-colors cursor-pointer"
          >
            <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
            {isRefreshing ? "인증 창 기동 중..." : "인증 즉시 갱신 (OAuth Re-auth)"}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <button
          aria-expanded={isOpen}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
          onClick={() => setIsOpen((o) => !o)}
          type="button"
        >
          <Eye className="h-4 w-4 text-muted-foreground" />
          Human Peek (Ingress Guard)
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
          {/* Status summary */}
          <div className="flex items-center justify-between rounded bg-muted/40 p-2">
            <div>
              <div className="font-semibold text-foreground">결과: {result.approvalState}</div>
              <div className="text-[10px] text-muted-foreground">{result.reason}</div>
            </div>
            {result.accepted ? (
              <CheckCircle className="h-5 w-5 text-primary" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-destructive" />
            )}
          </div>

          {/* 7-Stage Guard Steps */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Ingress Guard 7단계 검사
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
                    <span className="text-foreground shrink-0">{step.name}</span>
                    <div className="text-right min-w-0 pl-4">
                      <span className={cn(
                        "font-semibold",
                        isPassed && "text-primary",
                        isBlocked && "text-destructive",
                        isQueued && "text-warning"
                      )}>
                        [{step.status}]
                      </span>
                      <span className="text-muted-foreground block truncate max-w-[180px]" title={step.reason}>
                        {step.reason}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 0-Token Safety Area */}
          <div className="rounded-md border border-border/80 bg-card/40 p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              0-Token Safety Cron
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[10px] text-muted-foreground font-mono">
              <div>상태: <span className="text-foreground">Active ({zeroTokenSafety.cadence})</span></div>
              <div>지연 큐: <span className="text-warning font-semibold">{zeroTokenSafety.pendingCount}</span></div>
              <div className="col-span-2">최종 체크: {zeroTokenSafety.lastCheck}</div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
