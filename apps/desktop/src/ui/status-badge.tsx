import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * v0 primitive — StatusBadge.
 * source: docs/v0/v0-output/components/shared/status-badge.tsx
 *
 * 12 variant + 2 size. 디자인 의도:
 *   - default / primary / success / warning / danger / muted — generic tones
 *   - orchestrator / architect / builder / reviewer / expert / companion —
 *     6 agent role tones (matches AvatarWithStatus role-color set)
 *
 * tokens.css 의 --primary / --success / --warning / --destructive /
 * --muted-foreground / --role-* 를 그대로 사용.
 *
 * 사용처 (예정):
 *   - DebateRoundCard 의 stage / tag badges
 *   - AgentCard 의 Primary / role indicator
 *   - Conversation header 의 메타 chip
 */

export type StatusBadgeVariant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "muted"
  | "orchestrator"
  | "architect"
  | "builder"
  | "reviewer"
  | "expert"
  | "companion";

export type StatusBadgeSize = "sm" | "md";

export type StatusBadgeProps = {
  children: React.ReactNode;
  variant?: StatusBadgeVariant;
  size?: StatusBadgeSize;
  className?: string;
};

const variantStyles: Record<StatusBadgeVariant, string> = {
  default: "bg-secondary text-secondary-foreground",
  primary: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
  muted: "bg-muted/50 text-muted-foreground",
  orchestrator: "bg-role-orchestrator/15 text-role-orchestrator",
  architect: "bg-role-architect/15 text-role-architect",
  builder: "bg-role-builder/15 text-role-builder",
  reviewer: "bg-role-reviewer/15 text-role-reviewer",
  expert: "bg-role-expert/15 text-role-expert",
  companion: "bg-role-companion/15 text-role-companion",
};

const sizeStyles: Record<StatusBadgeSize, string> = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-xs px-2 py-0.5",
};

export function StatusBadge({
  children,
  variant = "default",
  size = "sm",
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-medium",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
