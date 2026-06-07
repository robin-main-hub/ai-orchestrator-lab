import { useState } from "react";
import { Eye, ShieldAlert, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Stage8IngressSnapshot } from "../runtime/stage8Ingress";
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

function ingressReasonLabel(reason: string): string {
  const direct: Record<string, string> = {
    "bot/manager author would create response loop": "봇/관리자 작성자는 응답 루프를 만들 수 있어 차단했습니다.",
    "dangerous actions require desktop/mobile approval": "위험 작업은 데스크톱/모바일 승인이 필요합니다.",
    "external user author accepted": "외부 사용자 작성자를 허용했습니다.",
    "external-agent checklist attached before session handoff": "세션 인계 전에 외부 에이전트 체크리스트를 붙였습니다.",
    "external channels are restricted from write, run, or secret access capabilities": "외부 채널은 파일 수정, 명령 실행, 비밀 접근 권한을 사용할 수 없습니다.",
    "external source marked untrusted": "외부 소스를 신뢰하지 않는 입력으로 표시했습니다.",
    "high confidence external input accepted": "신뢰도 높은 외부 입력을 허용했습니다.",
    "memory candidate stays quarantined until pinned": "기억 후보는 고정되기 전까지 격리 상태로 유지됩니다.",
    "message event kept": "메시지 이벤트를 유지했습니다.",
    "no prohibited external capability request detected": "금지된 외부 권한 요청이 감지되지 않았습니다.",
    "no sensitive request detected": "민감 요청이 감지되지 않았습니다.",
    "redacted event goes to Event Store; raw payload stays out of normal log": "마스킹된 이벤트만 저장소로 보내고 원본 페이로드는 일반 로그에 남기지 않습니다.",
    "secret-like text redacted and approval required": "비밀값처럼 보이는 텍스트를 마스킹했고 승인이 필요합니다.",
    "sensitive action waits for approval": "민감 작업은 승인 대기 상태입니다.",
    "single message; merge window clear": "단일 메시지이며 병합 창은 비어 있습니다.",
    "system/noise event skipped before model wakeup": "시스템/노이즈 이벤트는 모델 호출 전에 건너뜁니다.",
    "terminal/write/secret capabilities stay denied for External Agent": "외부 에이전트의 터미널/쓰기/비밀 접근 권한은 계속 거부됩니다.",
  };

  if (direct[reason]) {
    return direct[reason];
  }

  const confidenceMatch = reason.match(/^(high|medium|low) confidence external input queued for approval$/);
  if (confidenceMatch) {
    const confidence = confidenceMatch[1] === "high" ? "높은" : confidenceMatch[1] === "medium" ? "중간" : "낮은";
    return `${confidence} 신뢰도의 외부 입력을 승인 대기열에 넣었습니다.`;
  }

  const payloadMatch = reason.match(/^(.+) payload normalized into IngressEvent$/);
  if (payloadMatch) {
    return `${payloadMatch[1]} 페이로드를 인입 이벤트로 정규화했습니다.`;
  }

  const mergedMatch = reason.match(/^(\d+) messages merged in (\d+)ms window$/);
  if (mergedMatch) {
    return `${mergedMatch[1]}개 메시지를 ${mergedMatch[2]}ms 병합 창에서 합쳤습니다.`;
  }

  return reason;
}
