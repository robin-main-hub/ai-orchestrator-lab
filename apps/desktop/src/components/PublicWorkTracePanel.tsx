import { CheckCircle2, CircleDashed, FileSearch, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createPublicWorkReceiptSummary,
  createPublicTraceSafetyReport,
  type PublicWorkTrace,
  type PublicWorkTraceTone,
} from "../lib/publicWorkTrace";

export function PublicWorkTracePanel({
  className,
  trace,
}: {
  className?: string;
  trace: PublicWorkTrace;
}) {
  if (trace.groups.length === 0) return null;
  const safetyReport = createPublicTraceSafetyReport(trace);
  const receiptSummary = createPublicWorkReceiptSummary(trace);

  return (
    <div
      aria-label="공개 작업 로그"
      className={cn(
        "mt-3 rounded-xl border border-white/10 bg-black/20 p-2.5 shadow-inner shadow-black/20",
        className,
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500">
        <span className="font-semibold text-zinc-300">공개 작업 로그</span>
        <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-1.5 py-0.5 text-violet-200">
          내부 추론 비공개
        </span>
        <span
          className={cn(
            "rounded-full border px-1.5 py-0.5",
            safetyReport.isSafe
              ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
              : "border-rose-400/25 bg-rose-500/10 text-rose-200",
          )}
          title={safetyReport.blockedReasons.join(", ") || safetyReport.label}
        >
          {safetyReport.label}
        </span>
        <span>요약 단계와 검증 근거만 표시</span>
      </div>
      {trace.receipt && receiptSummary ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[10px] text-zinc-300">
          <span
            className="max-w-full truncate font-semibold uppercase tracking-[0.18em] text-violet-200"
            title={receiptSummary.compactLabel}
          >
            {trace.receipt.label}
          </span>
          <span className={cn("rounded-full border px-1.5 py-0.5", receiptStatusClassName(trace.receipt.status))}>
            {receiptSummary.statusLabel}
          </span>
          {receiptSummary.detailItems.slice(0, 3).map((item) => (
            <span className="max-w-full truncate rounded-full bg-black/20 px-1.5 py-0.5" key={`${item.label}:${item.value}`}>
              {item.label}: {item.value}
            </span>
          ))}
          {receiptSummary.detailItems.length > 3 ? (
            <span
              className="rounded-full bg-black/20 px-1.5 py-0.5 text-zinc-500"
              title={receiptSummary.detailItems.map((item) => `${item.label}: ${item.value}`).join(" · ")}
            >
              +{receiptSummary.detailItems.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        {trace.groups.map((group) => {
          const Icon = group.id === "steps" ? CircleDashed : group.id === "commands" ? TerminalSquare : FileSearch;
          return (
            <section className="min-w-0 space-y-1.5" key={group.id}>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                <Icon className="h-3 w-3 text-violet-300" />
                {group.title}
              </div>
              <ul className="space-y-1">
                {group.items.slice(0, 3).map((item) => (
                  <li
                    className={cn(
                      "rounded-lg border px-2 py-1.5 text-[10px] leading-relaxed",
                      toneClassName(item.tone),
                    )}
                    key={item.id}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 shrink-0 opacity-70" />
                      <span className="shrink-0 font-semibold">{item.label}</span>
                      <span className="min-w-0 truncate text-zinc-300/90">{item.value}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function toneClassName(tone: PublicWorkTraceTone) {
  switch (tone) {
    case "success":
      return "border-cyan-400/20 bg-cyan-400/10 text-cyan-200";
    case "warning":
      return "border-amber-400/25 bg-amber-400/10 text-amber-200";
    case "danger":
      return "border-rose-400/25 bg-rose-400/10 text-rose-200";
    case "info":
      return "border-violet-400/20 bg-violet-400/10 text-violet-200";
    case "neutral":
    default:
      return "border-zinc-700/70 bg-zinc-900/60 text-zinc-300";
  }
}

function receiptStatusClassName(status: NonNullable<PublicWorkTrace["receipt"]>["status"]) {
  switch (status) {
    case "checkpointed":
      return "border-cyan-400/20 bg-cyan-400/10 text-cyan-200";
    case "live":
      return "border-violet-400/20 bg-violet-400/10 text-violet-200";
    case "fallback":
      return "border-amber-400/25 bg-amber-400/10 text-amber-200";
    case "blocked":
      return "border-rose-400/25 bg-rose-400/10 text-rose-200";
    default:
      return "border-zinc-700/70 bg-zinc-900/60 text-zinc-300";
  }
}
