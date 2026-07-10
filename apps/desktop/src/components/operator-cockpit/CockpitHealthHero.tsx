import { AlertTriangle, CheckCircle2, ChevronDown, CircleAlert } from "lucide-react";
import { COCKPIT_HEALTH_LABEL, type CockpitHealthRollup } from "../../lib/cockpitHealthRollup";
import type { CockpitNextActionItem } from "../../lib/cockpitNextActions";

/**
 * 콕핏 L1 — 첫 눈 건강 히어로.
 *
 * 운영자가 화면을 켜면 가장 먼저(그리고 기본적으로 유일하게) 보는 것: 전체
 * 신호 한 줄(red/yellow/green)과 "지금 처리할 일 하나"의 CTA. 상세 카드들은
 * '전체 현황 펼치기'로 한 단계 들어가야 보인다 — 정보 과부하 대신 다음 행동.
 */
const TONE = {
  red: {
    ring: "border-destructive/40 bg-destructive/[0.07]",
    dot: "bg-destructive/15 text-destructive shadow-[0_0_24px_color-mix(in_srgb,var(--destructive)_12%,transparent)]",
    icon: <CircleAlert className="h-6 w-6" />,
    cta: "bg-destructive/15 text-destructive hover:bg-destructive/25 border-destructive/30",
  },
  yellow: {
    ring: "border-warning/40 bg-warning/[0.06]",
    dot: "bg-warning/15 text-warning shadow-[0_0_24px_color-mix(in_srgb,var(--warning)_12%,transparent)]",
    icon: <AlertTriangle className="h-6 w-6" />,
    cta: "bg-warning/15 text-warning hover:bg-warning/25 border-warning/30",
  },
  green: {
    ring: "border-primary/30 bg-primary/[0.05]",
    dot: "bg-primary/15 text-primary shadow-[0_0_24px_var(--accent-dim)]",
    icon: <CheckCircle2 className="h-6 w-6" />,
    cta: "bg-muted/50 text-muted-foreground hover:bg-muted/70 border-border",
  },
} as const;

export function CockpitHealthHero({
  rollup,
  expanded,
  onToggleExpand,
  onActivateTopAction,
}: {
  rollup: CockpitHealthRollup;
  expanded: boolean;
  onToggleExpand: () => void;
  onActivateTopAction?: (action: CockpitNextActionItem) => void;
}) {
  const tone = TONE[rollup.level];
  return (
    <section
      className={`rounded-xl border ${tone.ring} px-5 py-4 backdrop-blur-sm`}
      aria-label="운영 건강 요약"
    >
      <div className="flex items-start gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone.dot}`}>
          {tone.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {COCKPIT_HEALTH_LABEL[rollup.level]}
            </span>
            <span className="text-[11px] text-muted-foreground">· {rollup.signalSummary}</span>
          </div>
          <h2 className="mt-0.5 truncate text-base font-semibold text-foreground">{rollup.headline}</h2>
        </div>
        {rollup.topAction && onActivateTopAction ? (
          <button
            className={`shrink-0 rounded-lg border px-3.5 py-2 text-sm font-medium transition ${tone.cta}`}
            onClick={() => onActivateTopAction(rollup.topAction!)}
            type="button"
          >
            {rollup.topAction.ctaLabel}
          </button>
        ) : null}
      </div>

      <button
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/30 py-1.5 text-[12px] text-muted-foreground transition hover:text-foreground"
        onClick={onToggleExpand}
        type="button"
        aria-expanded={expanded}
      >
        {expanded ? "전체 현황 접기" : `전체 현황 펼치기${rollup.pendingCount > 0 ? ` · 신호 ${rollup.pendingCount}` : ""}`}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
    </section>
  );
}
