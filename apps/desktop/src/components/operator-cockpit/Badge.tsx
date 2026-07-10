import React from "react";
import { cn } from "../../lib/utils";

type BadgeTone = "green" | "yellow" | "red" | "gray" | "blue" | "purple" | "outline";
type BadgeSize = "xs" | "sm" | "md";

const toneClasses: Record<BadgeTone, string> = {
  green: "border-primary/20 bg-primary/10 text-primary",
  yellow: "border-warning/20 bg-warning/10 text-warning",
  red: "border-destructive/20 bg-destructive/10 text-destructive",
  gray: "border-border bg-muted/50 text-muted-foreground",
  blue: "border-primary/20 bg-primary/10 text-primary",
  purple: "border-primary/20 bg-primary/10 text-primary",
  outline: "border-border bg-transparent text-muted-foreground",
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
