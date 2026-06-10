import { Bot, Cpu, LayoutGrid, MessagesSquare, Radar, ShieldCheck, Swords, TerminalSquare } from "lucide-react";
import { StatusBadge } from "@/ui/status-badge";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import type { CenterMode, NavItemId } from "../types";
import type { AutonomyRunSummary } from "../lib/autonomyRunHistory";
import { runHistoryStatusLabel, runHistoryStatusVariant } from "../lib/autonomyRunHistory";
import type { HermesPoolSummary } from "../lib/hermesSlotPool";
import { buildPersonaCard } from "../lib/personaCard";
import { PersonaCard } from "./PersonaCard";

/**
 * 대시보드 — the landing view. One calm, elegant screen that answers
 * "지금 내 OS는 어떤 상태인가": persona showcase (gacha cards), system pulse
 * (runtime/slots/queue), and big mission tiles into the operation surfaces.
 * Everything detailed lives in its own tab; nothing here scrolls forever.
 * Presentational only — verified via static markup.
 */

export type DashboardQuickAction = {
  id: string;
  label: string;
  description: string;
  icon: "autonomy" | "parallel" | "debate" | "swarm" | "cockpit" | "sessions";
  target: { nav?: NavItemId; mode?: CenterMode };
};

const QUICK_ACTIONS: DashboardQuickAction[] = [
  { id: "autonomy", label: "자율실행", description: "페르소나 1명에게 미션을 맡기고 폐루프로 완주", icon: "autonomy", target: { nav: "autonomy" } },
  { id: "parallel", label: "병렬실행", description: "여러 에이전트를 각자의 터미널에서 동시 가동", icon: "parallel", target: { nav: "parallel" } },
  { id: "debate", label: "토론 무대", description: "에이전트 합의 라운드 → 의장 종합 → 코딩 패킷", icon: "debate", target: { mode: "debate" } },
  { id: "swarm", label: "스웜 보드", description: "tmux pane 실황과 게이트 큐를 한 화면에서", icon: "swarm", target: { mode: "tmux" } },
  { id: "cockpit", label: "콕핏", description: "운영자 시점의 시스템 전황판", icon: "cockpit", target: { mode: "cockpit" } },
  { id: "sessions", label: "대화", description: "쿠루미와의 일상 — 모든 것은 여기서 시작", icon: "sessions", target: { nav: "sessions", mode: "conversation" } },
];

const ACTION_ICONS = {
  autonomy: Bot,
  parallel: LayoutGrid,
  debate: Swords,
  swarm: TerminalSquare,
  cockpit: Radar,
  sessions: MessagesSquare,
} as const;

export type DashboardPersona = {
  personaName: string;
  displayName: string;
  role: string;
  avatarUrl?: string;
  tagline: string;
};

export function DashboardView({
  personas,
  runtime,
  hermesPool,
  pendingApprovals,
  history,
  onNavigate,
}: {
  personas: DashboardPersona[];
  runtime: RuntimeSnapshot;
  hermesPool: HermesPoolSummary;
  pendingApprovals: number;
  history?: AutonomyRunSummary[];
  onNavigate: (target: { nav?: NavItemId; mode?: CenterMode }) => void;
}) {
  const onlineNodes = runtime.runtimeNodes.filter((node) => node.status === "online").length;
  const recentRuns = (history ?? []).slice(0, 4);

  return (
    <div className="dashboard">
      <header className="dashboard__hero">
        <div>
          <p className="dashboard__eyebrow">REFLECORE ORCHESTRATOR</p>
          <h1 className="dashboard__title">
            오늘도 무대는 <span className="dashboard__title-accent">준비 완료</span>
          </h1>
          <p className="dashboard__subtitle">페르소나를 소환하고, 미션을 내리고, 지켜보세요. 나머지는 스웜이 합니다.</p>
        </div>
        <div className="dashboard__pulse" role="status" aria-label="시스템 상태 요약">
          <div className="dashboard__pulse-item">
            <Cpu size={14} aria-hidden />
            <span className="dashboard__pulse-label">런타임</span>
            <strong>{onlineNodes}/{runtime.runtimeNodes.length} 온라인</strong>
          </div>
          <div className="dashboard__pulse-item">
            <Bot size={14} aria-hidden />
            <span className="dashboard__pulse-label">Hermes 슬롯</span>
            <strong>사용 {hermesPool.bound} · 여유 {hermesPool.spare}</strong>
          </div>
          <button
            className={`dashboard__pulse-item dashboard__pulse-button ${pendingApprovals > 0 ? "attention" : ""}`}
            onClick={() => onNavigate({ mode: "cockpit" })}
            type="button"
            title="승인 큐 열기"
          >
            <ShieldCheck size={14} aria-hidden />
            <span className="dashboard__pulse-label">승인 대기</span>
            <strong>{pendingApprovals}건</strong>
          </button>
        </div>
      </header>

      <section className="dashboard__section" aria-label="페르소나 쇼케이스">
        <h2 className="dashboard__section-title">소환진 — 오늘의 파티</h2>
        <div className="dashboard__party">
          {personas.map((persona) => (
            <figure className="dashboard__party-member" key={persona.personaName}>
              <PersonaCard
                card={buildPersonaCard({
                  personaName: persona.personaName,
                  displayName: persona.displayName,
                  role: persona.role as never,
                  avatarUrl: persona.avatarUrl,
                })}
              />
              <figcaption className="dashboard__party-tagline">{persona.tagline}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="dashboard__section" aria-label="작전 바로가기">
        <h2 className="dashboard__section-title">작전 개시</h2>
        <div className="dashboard__tiles">
          {QUICK_ACTIONS.map((action) => {
            const Icon = ACTION_ICONS[action.icon];
            return (
              <button
                className="dashboard__tile"
                key={action.id}
                onClick={() => onNavigate(action.target)}
                type="button"
              >
                <Icon size={20} aria-hidden className="dashboard__tile-icon" />
                <span className="dashboard__tile-label">{action.label}</span>
                <span className="dashboard__tile-desc">{action.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      {recentRuns.length > 0 ? (
        <section className="dashboard__section" aria-label="최근 자율실행">
          <h2 className="dashboard__section-title">최근 작전 기록</h2>
          <ul className="dashboard__runs">
            {recentRuns.map((run) => (
              <li className="dashboard__run" key={run.runId}>
                <span className="dashboard__run-persona">{run.personaName ?? "(이름 없음)"}</span>
                <span className="dashboard__run-goal" title={run.goal ?? ""}>
                  {run.goal ?? run.runId}
                </span>
                <StatusBadge variant={runHistoryStatusVariant(run.status)}>
                  {runHistoryStatusLabel(run.status)}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
