import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * v0 AgentActivity primitive.
 * 에이전트/워커가 어디에 표시되든 동일한 상태 언어를 쓰게 하는
 * 검은 OS 화면용 초상화, 상태 pill, 사고 중 dots 세트.
 */
export type AgentState =
  | "idle"
  | "thinking"
  | "responding"
  | "working"
  | "waiting_approval"
  | "blocked"
  | "error"
  | "success";

type StateStyle = {
  ring: string;
  glow?: string;
  dot: string;
  label: string;
  labelColor: string;
};

export const agentStateConfig: Record<AgentState, StateStyle> = {
  idle: {
    ring: "ring-1 ring-border",
    dot: "bg-muted-foreground",
    label: "대기",
    labelColor: "text-muted-foreground",
  },
  thinking: {
    ring: "ring-1 ring-primary/40",
    dot: "bg-primary",
    label: "사고 중",
    labelColor: "text-primary",
  },
  responding: {
    ring: "ring-1 ring-primary/50",
    glow: "os-glow-running",
    dot: "bg-primary",
    label: "응답 중",
    labelColor: "text-primary",
  },
  working: {
    ring: "ring-1 ring-primary/50",
    glow: "os-glow-working os-breathe",
    dot: "bg-primary",
    label: "작업 중",
    labelColor: "text-primary",
  },
  waiting_approval: {
    ring: "ring-1 ring-warning/50",
    glow: "os-glow-waiting",
    dot: "bg-warning",
    label: "승인 대기",
    labelColor: "text-warning",
  },
  blocked: {
    ring: "ring-1 ring-destructive/50",
    glow: "os-glow-blocked",
    dot: "bg-destructive",
    label: "차단됨",
    labelColor: "text-destructive",
  },
  error: {
    ring: "ring-1 ring-destructive/60",
    glow: "os-glow-blocked",
    dot: "bg-destructive",
    label: "오류",
    labelColor: "text-destructive",
  },
  success: {
    ring: "ring-1 ring-primary/50",
    dot: "bg-primary",
    label: "완료",
    labelColor: "text-primary",
  },
};

const sizeMap = {
  sm: { box: "h-8 w-8 rounded-lg text-[10px]", dot: "h-2 w-2", icon: "h-3 w-3" },
  md: { box: "h-10 w-10 rounded-lg text-xs", dot: "h-2.5 w-2.5", icon: "h-3.5 w-3.5" },
  lg: { box: "h-12 w-12 rounded-xl text-sm", dot: "h-3 w-3", icon: "h-4 w-4" },
};

export function AgentPortrait({
  initials,
  state,
  size = "md",
  tintClassName = "bg-muted text-foreground",
  className,
  avatarUrl,
}: {
  initials: string;
  state: AgentState;
  size?: keyof typeof sizeMap;
  tintClassName?: string;
  className?: string;
  /** persona portrait — fills the square instead of initials when present */
  avatarUrl?: string;
}) {
  const cfg = agentStateConfig[state];
  const s = sizeMap[size];

  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "flex items-center justify-center font-semibold transition-shadow duration-500",
          s.box,
          cfg.ring,
          cfg.glow,
          tintClassName,
        )}
      >
        {state === "thinking" || state === "responding" ? (
          <Loader2 className={cn(s.icon, "animate-spin", cfg.labelColor)} />
        ) : state === "error" ? (
          <AlertTriangle className={cn(s.icon, "text-destructive")} />
        ) : state === "success" ? (
          <Check className={cn(s.icon, "text-primary")} />
        ) : avatarUrl ? (
          <img alt="" className="h-full w-full rounded-[inherit] object-cover" src={avatarUrl} />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-background",
          s.dot,
          cfg.dot,
          (state === "working" || state === "waiting_approval") && "os-breathe",
        )}
      />
    </div>
  );
}

export function AgentStatePill({ state, className }: { state: AgentState; className?: string }) {
  const cfg = agentStateConfig[state];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium",
        cfg.labelColor,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

export function ThinkingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="os-thinking-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: "0ms" }} />
      <span className="os-thinking-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: "200ms" }} />
      <span className="os-thinking-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: "400ms" }} />
    </span>
  );
}
