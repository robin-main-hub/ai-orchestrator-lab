import React from "react";
import { cn } from "../../lib/utils";

type GlassPanelVariant = "default" | "elevated" | "glow" | "danger" | "warning";

const panelVariants: Record<GlassPanelVariant, string> = {
  default: "border-border bg-muted/40 backdrop-blur-xl",
  elevated: "border-border bg-muted/60 shadow-lg shadow-black/20 backdrop-blur-xl",
  glow: "border-primary/30 bg-muted/50 shadow-[0_0_30px_var(--accent-dim)] backdrop-blur-xl",
  danger: "border-destructive/40 bg-destructive/10 shadow-[0_0_28px_color-mix(in_srgb,var(--destructive)_10%,transparent)] backdrop-blur-xl",
  warning: "border-warning/40 bg-warning/10 shadow-[0_0_28px_color-mix(in_srgb,var(--warning)_10%,transparent)] backdrop-blur-xl",
};

export function GlassPanel({
  ariaLabel,
  children,
  className,
  variant = "default",
}: {
  ariaLabel?: string;
  children: React.ReactNode;
  className?: string;
  variant?: GlassPanelVariant;
}) {
  return (
    <section
      aria-label={ariaLabel}
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
    <div className={cn("flex items-center justify-between gap-3 border-b border-border px-4 py-3", className)}>
      <div className="min-w-0">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
