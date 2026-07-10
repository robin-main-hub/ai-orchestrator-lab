import type { AgentActivityStatus, AgentVisualSettings, WorkbenchAgent } from "../../types";
import { agentInitialsForDisplay, agentPrimaryDisplayName } from "../../lib/agentDisplay";
import {
  isSpeakingActivity,
  resolveAgentExpressionPortrait,
  resolveAgentIdentityAvatar,
} from "../../lib/conversationAgentPortrait";
import { AvatarWithStatus, type AvatarStatus, roleColorFromRole } from "@/ui/avatar-with-status";

/**
 * 대화 워크벤치 좌측 에이전트 레일 (Discord 서버 아이콘 패턴).
 * 18 에이전트를 1클릭으로 전환 — 팝오버 안 2클릭 동선을 제거한다. 활동 상태 도트로
 * "지금 손이 필요한" 에이전트를 표시(승인 대기·차단·응답 중). 진짜 미읽음 추적은
 * 데이터 모델에 없어, 실제 활동 상태를 도트로 쓴다(가짜 카운트 없음).
 */

/** 활동 상태 → 아바타 도트. idle은 도트 없음(산만함 방지) — 손이 필요한 상태만 표시. */
function activityToAvatarStatus(activity: AgentActivityStatus | undefined): AvatarStatus | undefined {
  switch (activity) {
    case "waiting_approval":
      return "pending";
    case "error":
      return "offline";
    case "responding":
    case "preparing":
    case "tooling":
    case "capturing":
    case "dispatching":
    case "testing":
      return "active";
    default:
      return undefined;
  }
}

export function ConversationAgentRail({
  agents,
  selectedAgentId,
  onSelectAgent,
  agentActivityById,
  agentVisualsById,
}: {
  agents: WorkbenchAgent[];
  selectedAgentId?: string;
  onSelectAgent: (agentId: string) => void;
  agentActivityById?: Record<string, AgentActivityStatus>;
  agentVisualsById?: Record<string, AgentVisualSettings>;
}) {
  if (agents.length === 0) return null;
  return (
    <nav
      aria-label="에이전트 빠른 전환"
      className="flex w-[60px] shrink-0 flex-col items-center gap-1.5 overflow-y-auto border-r border-border bg-surface/80 py-3"
    >
      {agents.map((agent) => {
        const active = agent.id === selectedAgentId;
        const activity = agentActivityById?.[agent.id] ?? "idle";
        const status = activityToAvatarStatus(activity);
        const avatar = resolveAgentIdentityAvatar(agent, { visuals: agentVisualsById?.[agent.id] });
        const name = agentPrimaryDisplayName(agent);
        return (
          <button
            key={agent.id}
            aria-current={active ? "true" : undefined}
            aria-label={`${name}${status === "pending" ? " · 승인 대기" : status === "offline" ? " · 막힘" : ""}`}
            className="group relative flex w-full items-center justify-center py-0.5"
            onClick={() => onSelectAgent(agent.id)}
            title={name}
            type="button"
          >
            {/* 활성 표시 — 좌측 필 (Discord 패턴) */}
            <span
              className={`absolute left-0 w-[3px] rounded-r-full bg-primary transition-all ${
                active ? "h-7 opacity-100" : "h-0 opacity-0 group-hover:h-3 group-hover:opacity-60"
              }`}
            />
            <AvatarWithStatus
              avatarDataUrl={avatar}
              initials={agentInitialsForDisplay(agent)}
              isPrimary={active}
              roleColor={roleColorFromRole(agent.role)}
              size="md"
              status={status}
            />
          </button>
        );
      })}
    </nav>
  );
}

/**
 * 대화 상단 에이전트 스포트라이트 — 현재 에이전트의 표정 스프라이트를 크게 보여줘
 * "지금 누구와, 어떤 상태로" 대화 중인지 한눈에. 캐릭터 OS의 감정 피드백 차별점.
 */
export function ConversationAgentSpotlight({
  agent,
  activity,
  displayName,
  workStatusLabel,
  visuals,
}: {
  agent?: WorkbenchAgent;
  activity?: AgentActivityStatus;
  displayName: string;
  workStatusLabel: string;
  visuals?: AgentVisualSettings;
}) {
  if (!agent) return null;
  const portrait = resolveAgentExpressionPortrait(agent, { activity, visuals });
  const speaking = isSpeakingActivity(activity);
  const attention = activity === "waiting_approval" ? "border-warning/40" : activity === "error" ? "border-destructive/40" : "border-border";
  return (
    <div className={`flex shrink-0 items-center gap-3 border-b bg-surface/70 px-4 py-2 ${attention}`}>
      <div
        className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 ring-1 ring-white/5 ${speaking ? "conversation-speaking" : ""}`}
      >
        {portrait ? (
          <img alt={displayName} className="h-full w-full object-cover" src={portrait} />
        ) : (
          <span className="font-mono text-sm text-primary">{agentInitialsForDisplay(agent)}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
        <span className="truncate text-[11.5px] text-muted-foreground">{workStatusLabel}</span>
      </div>
    </div>
  );
}
