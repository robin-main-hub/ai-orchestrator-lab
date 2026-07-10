import type { AgentRole } from "@ai-orchestrator/protocol";
import { CheckCircle2, MessageCircle, Route, Wrench, type LucideIcon } from "lucide-react";
import {
  agentInitialsForDisplay,
  agentPrimaryDisplayName,
  agentSecondaryDisplayLabel,
} from "../../lib/agentDisplay";
import { getAgentToolProfileSummary } from "../../lib/agentToolProfiles";
import { resolvePersonaPortraitUrl } from "../../lib/personaPortrait";
import type { AgentActivityStatus, WorkbenchAgent } from "../../types";
import { AgentPortrait, type AgentState } from "../shared/AgentActivity";

export function AgentRosterSkillPicker({
  agents,
  agentActivityById,
  messageCountByAgentId,
  onOpenMemory,
  onOpenModel,
  onOpenSkills,
  onSelectAgent,
  selectedAgentId,
}: {
  agents: WorkbenchAgent[];
  agentActivityById?: Record<string, AgentActivityStatus>;
  messageCountByAgentId?: Record<string, number>;
  onOpenMemory?: (agentId: string) => void;
  onOpenModel?: (agentId: string) => void;
  onOpenSkills?: (agentId: string) => void;
  onSelectAgent: (agentId: string) => void;
  selectedAgentId?: string;
}) {
  return (
    <div className="space-y-2 p-2">
      <div className="flex items-center justify-between gap-2 px-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">대화 동료 선택</p>
          <p className="text-xs text-muted-foreground">이름, 역할, 스킬, 모델을 보고 바로 전환합니다.</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted-foreground">
          {agents.length}명
        </span>
      </div>
      <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
        {agents.map((agent) => {
          const selected = agent.id === selectedAgentId;
          const activity = agentActivityById?.[agent.id] ?? "idle";
          const state = mapRosterAgentState(activity);
          const messageCount = messageCountByAgentId?.[agent.id] ?? 0;
          const messageActionLabel = messageCount > 0 ? `대화 ${messageCount}` : "새 대화";
          const portraitUrl = resolvePersonaPortraitUrl(agent.personaName, agent.role);

          return (
            <article
              className={`group w-full rounded-xl border px-3 py-2.5 text-left transition ${
                selected
                  ? "border-primary/35 bg-primary/10 shadow-[0_0_26px_var(--accent-dim)]"
                  : "border-border bg-surface/55 hover:border-border hover:bg-surface/80"
              }`}
              key={agent.id}
            >
              <button
                aria-current={selected ? "true" : undefined}
                className="flex w-full items-start gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={() => onSelectAgent(agent.id)}
                type="button"
              >
                <AgentPortrait
                  avatarUrl={portraitUrl}
                  initials={agentInitialsForDisplay(agent)}
                  state={state}
                  tintClassName={selected ? "bg-primary/15 text-primary" : "bg-primary/10 text-primary"}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{agentPrimaryDisplayName(agent)}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{agentSecondaryDisplayLabel(agent)}</p>
                    </div>
                    {selected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : null}
                  </div>
                </div>
              </button>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <RosterAction icon={Wrench} label="스킬" onClick={() => onOpenSkills?.(agent.id)} title={describeRoleWork(agent.role)} />
                <RosterAction
                  icon={Route}
                  label="모델"
                  onClick={() => onOpenModel?.(agent.id)}
                  title={`${agentPrimaryDisplayName(agent)} 모델 변경`}
                />
                <RosterAction
                  icon={MessageCircle}
                  label={messageActionLabel}
                  onClick={() => (messageCount > 0 ? onSelectAgent(agent.id) : onOpenMemory?.(agent.id))}
                  title={messageCount > 0 ? `${messageCount}개 대화 열기` : "새 대화 시작"}
                />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function RosterAction({
  icon: Icon,
  label,
  onClick,
  title,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  title: string;
}) {
  return (
    <button
      className="inline-flex min-w-0 items-center justify-center gap-1 rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!onClick}
      onClick={onClick}
      title={title}
      type="button"
    >
      <Icon className="h-3 w-3 shrink-0 text-primary/60" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function mapRosterAgentState(status: AgentActivityStatus): AgentState {
  if (status === "waiting_approval") return "waiting_approval";
  if (status === "error") return "error";
  if (status === "idle") return "idle";
  if (status === "preparing") return "thinking";
  return "responding";
}

function describeRoleWork(role: AgentRole) {
  const labels: Record<AgentRole, string> = {
    architect: "설계 경계와 명세를 정리합니다",
    auditor: "근거와 범위를 감사합니다",
    builder: "코드를 고치고 테스트 흐름을 엮습니다",
    companion: "대화 흐름과 다음 질문을 이어줍니다",
    domain_expert: "전문 맥락을 붙여 답변합니다",
    executor: "실행과 승인 지점을 관리합니다",
    external: "외부 전달 문맥을 정리합니다",
    mediator: "충돌을 합의 문장으로 바꿉니다",
    memory_curator: "장기 기억을 고르고 정리합니다",
    negotiator: "제안과 양보선을 만듭니다",
    orchestrator: "작업 우선순위와 분배를 지휘합니다",
    researcher: "출처와 자료를 선별합니다",
    reviewer: "회귀와 빠진 검증을 찾습니다",
    risk_officer: "영향 범위와 복구책을 봅니다",
    skeptic: "가정과 반례를 꺼냅니다",
    verifier: "빌드와 검증 근거를 확인합니다",
    watchdog: "변화와 이상 신호를 감시합니다",
  };
  return labels[role] ?? "역할에 맞는 보조 작업을 맡습니다";
}
