import { cn } from "@/lib/utils";
import {
  AvatarWithStatus,
  roleColorFromRole,
  type AvatarStatus,
  type RoleColor,
} from "@/ui/avatar-with-status";
import type { WorkbenchAgent, AgentVisualSettings } from "../../types";

export type AgentActivityState =
  | "idle"
  | "thinking"
  | "responding"
  | "working"
  | "waiting_approval"
  | "blocked"
  | "error"
  | "success";

export type LegacyAgentActivityState = "preparing";

export type AgentActivityInputState =
  | AgentActivityState
  | LegacyAgentActivityState
  | undefined;

const labels: Record<AgentActivityState, string> = {
  blocked: "blocked",
  error: "error",
  idle: "idle",
  responding: "responding",
  success: "success",
  thinking: "thinking",
  waiting_approval: "waiting approval",
  working: "working",
};

const pillClassNames: Record<AgentActivityState, string> = {
  blocked: "border-rose-300/20 bg-rose-400/10 text-rose-200",
  error: "border-rose-300/30 bg-rose-500/15 text-rose-100",
  idle: "border-zinc-700/60 bg-zinc-900/70 text-zinc-400",
  responding: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
  success: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
  thinking: "border-violet-300/25 bg-violet-400/10 text-violet-100",
  waiting_approval: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  working: "border-cyan-300/20 bg-cyan-500/10 text-cyan-100",
};

const glowClassNames: Record<AgentActivityState, string> = {
  blocked: "shadow-[0_0_24px_rgba(251,113,133,0.20)]",
  error: "shadow-[0_0_28px_rgba(244,63,94,0.24)]",
  idle: "",
  responding: "shadow-[0_0_28px_rgba(34,211,238,0.24)]",
  success: "shadow-[0_0_24px_rgba(52,211,153,0.20)]",
  thinking: "shadow-[0_0_26px_rgba(139,92,246,0.22)]",
  waiting_approval: "shadow-[0_0_24px_rgba(251,191,36,0.20)]",
  working: "shadow-[0_0_24px_rgba(34,211,238,0.20)]",
};

export function coerceAgentActivityStatus(
  status: AgentActivityInputState,
): AgentActivityState {
  if (!status) return "idle";
  if (status === "preparing") return "thinking";
  return status;
}

export function agentActivityLabel(status: AgentActivityInputState) {
  return labels[coerceAgentActivityStatus(status)];
}

export function agentActivityAvatarStatus(
  status: AgentActivityInputState,
): AvatarStatus {
  const normalized = coerceAgentActivityStatus(status);
  if (normalized === "responding" || normalized === "working") return "active";
  if (normalized === "thinking" || normalized === "waiting_approval") return "pending";
  if (normalized === "blocked" || normalized === "error") return "offline";
  if (normalized === "success") return "online";
  return "idle";
}

export function tmuxPaneStateToAgentActivity(state: string): AgentActivityState {
  if (state === "chat active") return "responding";
  if (state === "active") return "working";
  if (state === "ready") return "success";
  if (state === "dispatch gated" || state === "pending_approval") return "waiting_approval";
  if (state === "guarding") return "blocked";
  if (state === "failed" || state === "dispatch failed") return "error";
  return "idle";
}

export function activityRoleColor(agent?: Pick<WorkbenchAgent, "role">): RoleColor {
  return agent ? roleColorFromRole(agent.role) : "companion";
}

export function AgentStatePill({
  className,
  status,
}: {
  className?: string;
  status: AgentActivityInputState;
}) {
  const normalized = coerceAgentActivityStatus(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        pillClassNames[normalized],
        glowClassNames[normalized],
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          normalized === "idle" && "bg-zinc-500",
          normalized === "thinking" && "bg-violet-300",
          (normalized === "responding" || normalized === "working") && "bg-cyan-300",
          normalized === "waiting_approval" && "bg-amber-300",
          (normalized === "blocked" || normalized === "error") && "bg-rose-300",
          normalized === "success" && "bg-emerald-300",
        )}
      />
      {agentActivityLabel(normalized)}
    </span>
  );
}

export function ThinkingDots({ className }: { className?: string }) {
  return (
    <span aria-label="thinking" className={cn("inline-flex items-center gap-0.5", className)}>
      <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:0ms]" />
      <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:140ms]" />
      <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:280ms]" />
    </span>
  );
}

export function AgentActivity({
  agent,
  className,
  initials,
  showLabel = true,
  size = "sm",
  status,
  visual,
}: {
  agent?: Pick<WorkbenchAgent, "name" | "role">;
  className?: string;
  initials?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  status?: AgentActivityInputState;
  visual?: AgentVisualSettings;
}) {
  const normalized = coerceAgentActivityStatus(status);
  const resolvedInitials = initials ?? (agent?.name ?? "??").slice(0, 2).toUpperCase();

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <AvatarWithStatus
        avatarDataUrl={visual?.avatarDataUrl}
        initials={resolvedInitials}
        roleColor={activityRoleColor(agent)}
        size={size}
        status={agentActivityAvatarStatus(normalized)}
      />
      {showLabel ? <AgentStatePill status={normalized} /> : null}
      {(normalized === "thinking" || normalized === "responding") && showLabel ? (
        <ThinkingDots className="text-cyan-200/80" />
      ) : null}
    </span>
  );
}
