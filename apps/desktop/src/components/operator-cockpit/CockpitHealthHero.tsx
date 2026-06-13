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
    ring: "border-red-500/40 bg-red-500/[0.07]",
    dot: "bg-red-500/15 text-red-300 shadow-[0_0_24px_rgba(239,68,68,0.25)]",
    icon: <CircleAlert className="h-6 w-6" />,
    cta: "bg-red-500/15 text-red-200 hover:bg-red-500/25 border-red-500/30",
  },
  yellow: {
    ring: "border-amber-400/40 bg-amber-400/[0.06]",
    dot: "bg-amber-400/15 text-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.20)]",
    icon: <AlertTriangle className="h-6 w-6" />,
    cta: "bg-amber-400/15 text-amber-100 hover:bg-amber-400/25 border-amber-400/30",
  },
  green: {
    ring: "border-emerald-500/30 bg-emerald-500/[0.05]",
    dot: "bg-emerald-500/15 text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.18)]",
    icon: <CheckCircle2 className="h-6 w-6" />,
    cta: "bg-zinc-100/5 text-zinc-300 hover:bg-zinc-100/10 border-zinc-100/10",
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
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              {COCKPIT_HEALTH_LABEL[rollup.level]}
            </span>
            <span className="text-[11px] text-zinc-500">· {rollup.signalSummary}</span>
          </div>
          <h2 className="mt-0.5 truncate text-base font-semibold text-zinc-50">{rollup.headline}</h2>
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
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-800/60 bg-zinc-900/30 py-1.5 text-[12px] text-zinc-400 transition hover:text-zinc-200"
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
