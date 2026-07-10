import { CheckCircle2, CircleDashed, FileSearch, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createPublicWorkReceiptSummary,
  createPublicTraceSafetyReport,
  maskPublicWorkTraceForRender,
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
  const renderTrace = maskPublicWorkTraceForRender(trace);
  const safetyReport = createPublicTraceSafetyReport(renderTrace);
  const receiptSummary = createPublicWorkReceiptSummary(renderTrace);

  return (
    <div
      aria-label="공개 작업 로그"
      className={cn(
        "mt-3 rounded-xl border border-white/10 bg-black/20 p-2.5 shadow-inner shadow-black/20",
        className,
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="font-semibold text-foreground">공개 작업 로그</span>
        <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-muted-foreground">
          내부 추론 비공개
        </span>
        <span
          className={cn(
            "rounded-full border px-1.5 py-0.5",
            safetyReport.isSafe
              ? "border-primary/20 bg-primary/10 text-primary"
              : "border-destructive/25 bg-destructive/10 text-destructive",
          )}
          title={safetyReport.blockedReasons.join(", ") || safetyReport.label}
        >
          {safetyReport.label}
        </span>
        <span>요약 단계와 검증 근거만 표시</span>
      </div>
      {renderTrace.receipt && receiptSummary ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[10px] text-foreground">
          <span
            className="max-w-full truncate font-semibold uppercase tracking-[0.18em] text-foreground"
            title={receiptSummary.compactLabel}
          >
            {renderTrace.receipt.label}
          </span>
          <span className={cn("rounded-full border px-1.5 py-0.5", receiptStatusClassName(renderTrace.receipt.status))}>
            {receiptSummary.statusLabel}
          </span>
          {receiptSummary.detailItems.slice(0, 3).map((item) => (
            <span className="max-w-full truncate rounded-full bg-black/20 px-1.5 py-0.5" key={`${item.label}:${item.value}`}>
              {item.label}: {item.value}
            </span>
          ))}
          {receiptSummary.detailItems.length > 3 ? (
            <span
              className="rounded-full bg-black/20 px-1.5 py-0.5 text-muted-foreground"
              title={receiptSummary.detailItems.map((item) => `${item.label}: ${item.value}`).join(" · ")}
            >
              +{receiptSummary.detailItems.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        {renderTrace.groups.map((group) => {
          const Icon = group.id === "steps" ? CircleDashed : group.id === "commands" ? TerminalSquare : FileSearch;
          return (
            <section className="min-w-0 space-y-1.5" key={group.id}>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Icon className="h-3 w-3 text-muted-foreground" />
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
                      <span className="min-w-0 truncate text-foreground/90">{item.value}</span>
                    </span>
                  </li>
                ))}
                {group.items.length > 3 ? (
                  <li
                    className="rounded-lg border border-border bg-muted px-2 py-1.5 text-[10px] text-muted-foreground"
                    title={group.items.slice(3).map((item) => `${item.label}: ${item.value}`).join(" · ")}
                  >
                    +{group.items.length - 3}개 더 있음
                  </li>
                ) : null}
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
      return "border-primary/20 bg-primary/10 text-primary";
    case "warning":
      return "border-warning/25 bg-warning/10 text-warning";
    case "danger":
      return "border-destructive/25 bg-destructive/10 text-destructive";
    case "info":
      return "border-border bg-muted text-muted-foreground";
    case "neutral":
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function receiptStatusClassName(status: NonNullable<PublicWorkTrace["receipt"]>["status"]) {
  switch (status) {
    case "checkpointed":
      return "border-primary/20 bg-primary/10 text-primary";
    case "live":
      return "border-primary/20 bg-primary/10 text-primary";
    case "fallback":
      return "border-warning/25 bg-warning/10 text-warning";
    case "blocked":
      return "border-destructive/25 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}
