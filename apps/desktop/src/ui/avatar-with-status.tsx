import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * v0 primitive — AvatarWithStatus.
 * source: docs/v0/v0-output/components/shared/avatar-with-status.tsx
 *
 * 11 agent role 색상 + 5 status dot. tokens.css 의 --role-* /
 * --status-* / `.status-pulse` 를 그대로 사용.
 *
 * 기존 components/AgentAvatar.tsx 는 WorkbenchAgent + AgentVisualSettings
 * (data URL upload) 를 받는 우리 protocol-aware 컴포넌트. 이 primitive
 * 는 v0 의 단순 initials + role-color + status 형태. 둘 다 살림:
 *   - 새 surface (Conversation header dropdown, debate round card,
 *     command palette agent item 등) 는 이 v0 primitive 채택
 *   - 기존 surface 는 점진적으로 마이그레이션
 */

export type RoleColor =
  | "orchestrator"
  | "architect"
  | "builder"
  | "reviewer"
  | "expert"
  | "companion";

export type AvatarStatus =
  | "online"
  | "offline"
  | "pending"
  | "idle"
  | "active";

export type AvatarWithStatusProps = {
  initials: string;
  roleColor: RoleColor;
  status?: AvatarStatus;
  isPrimary?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  avatarDataUrl?: string;
};

const roleColorMap: Record<RoleColor, string> = {
  orchestrator: "bg-role-orchestrator/20 text-role-orchestrator",
  architect: "bg-role-architect/20 text-role-architect",
  builder: "bg-role-builder/20 text-role-builder",
  reviewer: "bg-role-reviewer/20 text-role-reviewer",
  expert: "bg-role-expert/20 text-role-expert",
  companion: "bg-role-companion/20 text-role-companion",
};

const statusColorMap: Record<AvatarStatus, string> = {
  online: "bg-status-online",
  offline: "bg-status-offline",
  pending: "bg-status-pending",
  idle: "bg-status-idle",
  active: "bg-status-active",
};

const sizeMap: Record<NonNullable<AvatarWithStatusProps["size"]>, string> = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-11 w-11 text-sm",
};

const statusSizeMap: Record<NonNullable<AvatarWithStatusProps["size"]>, string> = {
  sm: "h-2 w-2 -bottom-0.5 -right-0.5 ring-1",
  md: "h-2.5 w-2.5 -bottom-0.5 -right-0.5 ring-2",
  lg: "h-3 w-3 -bottom-0.5 -right-0.5 ring-2",
};

export function AvatarWithStatus({
  initials,
  roleColor,
  status,
  isPrimary = false,
  size = "md",
  className,
  avatarDataUrl,
}: AvatarWithStatusProps) {
  const [imgError, setImgError] = React.useState(false);

  return (
    <div className={cn("relative inline-flex", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-lg font-mono font-medium overflow-hidden",
          roleColorMap[roleColor],
          sizeMap[size],
          isPrimary && "ring-2 ring-primary/60",
        )}
      >
        {avatarDataUrl && !imgError ? (
          <img
            src={avatarDataUrl}
            alt={initials}
            onError={() => setImgError(true)}
            className="h-full w-full rounded-lg object-cover"
          />
        ) : (
          initials
        )}
      </div>
      {status ? (
        <span
          className={cn(
            "absolute rounded-full ring-background",
            statusColorMap[status],
            statusSizeMap[size],
            status === "active" && "status-pulse",
          )}
        />
      ) : null}
    </div>
  );
}

/**
 * Map our WorkbenchAgent.role enum (17 role) to v0's 6 RoleColor categories.
 * Useful when migrating surfaces from our AgentAvatar to AvatarWithStatus.
 */
export function roleColorFromRole(role: string): RoleColor {
  switch (role) {
    case "orchestrator":
      return "orchestrator";
    case "architect":
      return "architect";
    case "builder":
    case "executor":
      return "builder";
    case "reviewer":
    case "verifier":
    case "auditor":
      return "reviewer";
    case "researcher":
    case "memory_curator":
    case "domain_expert":
    case "watchdog":
    case "skeptic":
    case "risk_officer":
    case "mediator":
    case "negotiator":
    case "ux_critic":
      return "expert";
    case "companion":
    case "external":
    default:
      return "companion";
  }
}
