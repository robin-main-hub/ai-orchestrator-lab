import React from "react";
import { cn } from "../../lib/utils";

export function AgentPortraitFrame({
  active,
  children,
  className,
  glowColor,
}: {
  active?: boolean;
  children: React.ReactNode;
  className?: string;
  glowColor: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-zinc-950 ring-1 ring-white/10 transition-all duration-300",
        active && "agent-portrait-frame-active",
        className,
      )}
      style={{
        boxShadow: active
          ? `0 0 18px ${glowColor}55, 0 0 34px ${glowColor}22`
          : `0 0 14px ${glowColor}24`,
        "--agent-portrait-glow": glowColor,
      } as React.CSSProperties}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-lg bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_32%)]"
      />
      {children}
    </span>
  );
}
