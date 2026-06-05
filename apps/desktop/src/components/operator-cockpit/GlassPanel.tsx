import React from "react";
import { cn } from "../../lib/utils";

type GlassPanelVariant = "default" | "elevated" | "glow" | "danger" | "warning";

const panelVariants: Record<GlassPanelVariant, string> = {
  default: "border-zinc-800/60 bg-zinc-900/40 backdrop-blur-xl",
  elevated: "border-zinc-700/50 bg-zinc-900/60 shadow-lg shadow-black/20 backdrop-blur-xl",
  glow: "border-cyan-900/30 bg-zinc-900/50 shadow-[0_0_30px_rgba(6,182,212,0.08)] backdrop-blur-xl",
  danger: "border-rose-900/40 bg-rose-950/20 shadow-[0_0_28px_rgba(244,63,94,0.08)] backdrop-blur-xl",
  warning: "border-amber-900/40 bg-amber-950/15 shadow-[0_0_28px_rgba(245,158,11,0.07)] backdrop-blur-xl",
};

export function GlassPanel({
  children,
  className,
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: GlassPanelVariant;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border transition-colors duration-200",
        panelVariants[variant],
        className,
      )}
    >
      {children}
    </section>
  );
}

export function GlassPanelHeader({
  action,
  children,
  className,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-zinc-800/60 px-4 py-3", className)}>
      <div className="min-w-0">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
