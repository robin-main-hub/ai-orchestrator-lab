import { CheckCircle2, CircleDashed, FileSearch, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublicWorkTrace, PublicWorkTraceTone } from "../lib/publicWorkTrace";

export function PublicWorkTracePanel({
  className,
  trace,
}: {
  className?: string;
  trace: PublicWorkTrace;
}) {
  if (trace.groups.length === 0) return null;

  return (
    <div
      aria-label="공개 작업 로그"
      className={cn(
        "mt-3 grid gap-2 rounded-xl border border-white/10 bg-black/20 p-2.5 shadow-inner shadow-black/20",
        "sm:grid-cols-3",
        className,
      )}
    >
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
