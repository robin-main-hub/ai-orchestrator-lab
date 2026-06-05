import React from "react";
import { cn } from "../../lib/utils";

type BadgeTone = "green" | "yellow" | "red" | "gray" | "blue" | "purple" | "outline";
type BadgeSize = "xs" | "sm" | "md";

const toneClasses: Record<BadgeTone, string> = {
  green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.08)]",
  yellow: "border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.08)]",
  red: "border-rose-500/20 bg-rose-500/10 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.08)]",
  gray: "border-zinc-700/70 bg-zinc-800/50 text-zinc-400",
  blue: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.08)]",
  purple: "border-violet-500/20 bg-violet-500/10 text-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.08)]",
  outline: "border-zinc-700/70 bg-transparent text-zinc-500",
};

const sizeClasses: Record<BadgeSize, string> = {
  xs: "px-1.5 py-0 text-[9px]",
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-[11px]",
};

export function Badge({
  children,
  className,
  color = "gray",
  pulse = false,
  size = "sm",
}: {
  children: React.ReactNode;
  className?: string;
  color?: BadgeTone;
  pulse?: boolean;
  size?: BadgeSize;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wider",
        toneClasses[color],
        sizeClasses[size],
        pulse && "animate-pulse",
        className,
      )}
    >
      {children}
    </span>
  );
}
