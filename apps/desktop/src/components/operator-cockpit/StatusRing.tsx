import React from "react";
import { cn } from "../../lib/utils";

type RingTone = "green" | "yellow" | "red" | "gray";

const ringClasses: Record<RingTone, string> = {
  green: "border-emerald-500/80 bg-emerald-500/10 shadow-[0_0_18px_rgba(16,185,129,0.35)]",
  yellow: "border-amber-500/80 bg-amber-500/10 shadow-[0_0_18px_rgba(245,158,11,0.32)]",
  red: "border-rose-500/80 bg-rose-500/10 shadow-[0_0_18px_rgba(244,63,94,0.34)]",
  gray: "border-zinc-600 bg-zinc-700/20",
};

const dotClasses: Record<RingTone, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-rose-400",
  gray: "bg-zinc-500",
};

export function StatusRing({
  children,
  className,
  status,
}: {
  children?: React.ReactNode;
  className?: string;
  status: RingTone;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold uppercase",
        ringClasses[status],
        className,
      )}
      title={status}
    >
      {children}
      <span
        aria-hidden
        className={cn(
          "absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-zinc-950",
          dotClasses[status],
          status === "green" && "animate-pulse",
        )}
      />
    </span>
  );
}

export function StatusDot({ status }: { status: RingTone }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-1.5 w-1.5 rounded-full", dotClasses[status], status === "green" && "animate-pulse")}
    />
  );
}
