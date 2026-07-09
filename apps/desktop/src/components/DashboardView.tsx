import { useState } from "react";
import { ArrowRight, Bot, Cpu, LayoutGrid, MessagesSquare, Radar, Swords, TerminalSquare } from "lucide-react";
import { StatusBadge } from "@/ui/status-badge";
import { COCKPIT_HEALTH_LABEL, type CockpitHealthRollup } from "../lib/cockpitHealthRollup";
import type { CockpitNextActionItem } from "../lib/cockpitNextActions";
import type { WorkTraceSearchItem } from "../lib/workTraceSearch";
import { WorkReceiptLedgerCard } from "./operator-cockpit/WorkReceiptLedgerCard";
import { RunningWorkCard, type RunningWorkItem } from "./RunningWorkCard";
import { loadHermesPool } from "../lib/hermesPoolStore";
import { buildCodexDetail, type CodexDetail } from "../lib/personaCodexDetail";
import { personaBundleMap } from "../lib/personaBundleSource";
import { personaSprites } from "../lib/personaAvatarSource";
import { PersonaCodexModal } from "./PersonaCodexModal";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import type { CenterMode, NavItemId } from "../types";
import type { AutonomyRunSummary } from "../lib/autonomyRunHistory";
import { runHistoryStatusLabel, runHistoryStatusVariant } from "../lib/autonomyRunHistory";
import type { HermesPoolSummary } from "../lib/hermesSlotPool";
import { buildPersonaCard } from "../lib/personaCard";
import { PERSONA_CODEX } from "../lib/personaCodex";
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
  { id: "run", label: "실행", description: "페르소나 1명(자율) 또는 N명(병렬)에게 미션을 맡겨 폐루프로 완주", icon: "autonomy", target: { nav: "run" } },
  { id: "debate", label: "토론 무대", description: "에이전트 합의 라운드 → 의장 종합 → 코딩 패킷", icon: "debate", target: { nav: "none", mode: "debate" } },
  { id: "swarm", label: "스웜 보드", description: "tmux pane 실황과 게이트 큐를 한 화면에서", icon: "swarm", target: { nav: "none", mode: "tmux" } },
  { id: "cockpit", label: "콕핏", description: "운영자 시점의 시스템 전황판", icon: "cockpit", target: { nav: "none", mode: "cockpit" } },
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
  /** 오늘 파티에 든 이유 (오늘 활성 / 최근 작전 / 오늘의 추천) */
  reason?: string;
};

export function DashboardView({
  personas,
  personaAvatars = {},
  runtime,
  hermesPool,
  healthRollup,
  onActivateNextAction,
  history,
  onNavigate,
  onSummonPersona,
  workTraceItems = [],
  runningWork = [],
  onStopWork,
  stoppingWorkIds = [],
}: {
  personas: DashboardPersona[];
  /** avatar url per persona slug — codex cards pick art up automatically */
  personaAvatars?: Record<string, string | undefined>;
  runtime: RuntimeSnapshot;
  hermesPool: HermesPoolSummary;
  /**
   * 콕핏 L1과 공유하는 건강 롤업 — "다음 할 일 1개"를 구동. 완전 자동 운영 전환 후
   * 홈에서는 승인류 액션은 노출하지 않고, 승인이 아닌 유효한 다음 액션이 있을 때만 뜬다.
   */
  healthRollup?: CockpitHealthRollup;
  /** "다음 할 일" CTA 클릭 — targetSurface별 라우팅 */
  onActivateNextAction?: (action: CockpitNextActionItem) => void;
  history?: AutonomyRunSummary[];
  onNavigate: (target: { nav?: NavItemId; mode?: CenterMode }) => void;
  /** 도감 상세에서 "소환" — 대상 탭으로 이동하며 페르소나를 프리필 */
  onSummonPersona?: (personaName: string, target: "autonomy" | "parallel") => void;
  /** "해온 업무" 요약에 쓰는 작업 추적 인덱스 (append-only 공개 영수증) */
  workTraceItems?: WorkTraceSearchItem[];
  /** 지금 진행 중인 작업 (RMAS 실행 등) */
  runningWork?: RunningWorkItem[];
  /** "현재 작업" 항목 중지 요청 */
  onStopWork?: (id: string) => void;
  /** 중지 요청이 진행 중인 항목 id */
  stoppingWorkIds?: string[];
}) {
  const onlineNodes = runtime.runtimeNodes.filter((node) => node.status === "online").length;
  const recentRuns = (history ?? []).slice(0, 4);
  const [codexDetail, setCodexDetail] = useState<CodexDetail | null>(null);
  // 도감 18장은 기본 가로 캐러셀(한 줄, 스와이프) — 관심 있을 때만 전체 그리드로 펼친다.
  const [codexExpanded, setCodexExpanded] = useState(false);
  // 파티/도감 카드 클릭 → 같은 상세 모달(소환·대화 동선 포함)을 연다.
  const openPersonaDetail = (personaName: string) => {
    const entry = PERSONA_CODEX.find((candidate) => candidate.personaName === personaName);
    if (!entry) return;
    setCodexDetail(buildCodexDetail(entry, { bundleMap: personaBundleMap, slots: loadHermesPool().slots }));
  };

  // 완전 자동 운영 전환 후 홈은 승인 attention을 노출하지 않는다.
  // 승인류(approvals/control_queue) 다음 액션은 숨기고, 승인이 아닌 유효한
  // 다음 액션이 있을 때만 "다음 할 일" 카드를 띄운다.
  const topAction = healthRollup?.topAction;
  const homeAction =
    topAction && topAction.targetSurface !== "approvals" && topAction.targetSurface !== "control_queue"
      ? topAction
      : undefined;

  return (
    <div className="dashboard">
      <div className="dashboard__top">
      {healthRollup && homeAction ? (
        <section
          className={`dashboard__next dashboard__next--${healthRollup.level}`}
          aria-label="다음 할 일"
        >
          <div className="dashboard__next-head">
            <span className="dashboard__next-dot" aria-hidden />
            <span className="dashboard__next-status">{COCKPIT_HEALTH_LABEL[healthRollup.level]}</span>
          </div>
          <p className="dashboard__next-headline">{homeAction.label}</p>
          <button
            className="dashboard__next-cta"
            onClick={() => onActivateNextAction?.(homeAction)}
            type="button"
          >
            <span>{homeAction.ctaLabel}</span>
            <ArrowRight size={16} aria-hidden />
          </button>
        </section>
      ) : null}

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
          {/* 완전 자동 운영 — 승인 attention 펄스는 제거(PR #1089 후속). */}
        </div>
      </header>

      {/* 홈의 핵심: 지금 무엇이 돌고 있고(중지), 무엇을 해왔는가(요약). */}
      <RunningWorkCard items={runningWork} onStop={onStopWork} stoppingIds={stoppingWorkIds} />

      <section className="dashboard__section" aria-label="해온 업무">
        <h2 className="dashboard__section-title">해온 업무</h2>
        <WorkReceiptLedgerCard compact items={workTraceItems} />
      </section>
      </div>

      <section className="dashboard__section" aria-label="작전 바로가기">
        <h2 className="dashboard__section-title">작전 개시</h2>
        <div className="dashboard__tiles">
          {QUICK_ACTIONS.map((action) => {
            const Icon = ACTION_ICONS[action.icon];
            return (
              <button
                className={`dashboard__tile dashboard__tile--${action.icon}`}
                key={action.id}
                onClick={() => onNavigate(action.target)}
                type="button"
              >
                <span className="dashboard__tile-chip" aria-hidden>
                  <Icon size={18} />
                </span>
                <span className="dashboard__tile-label">{action.label}</span>
                <span className="dashboard__tile-desc">{action.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="dashboard__section" aria-label="페르소나 쇼케이스">
        <h2 className="dashboard__section-title">소환진 — 오늘의 파티</h2>
        <div className="dashboard__party">
          {personas.map((persona) => (
            <figure className="dashboard__party-member" key={persona.personaName}>
              <button
                className="dashboard__party-card"
                onClick={() => openPersonaDetail(persona.personaName)}
                title={`${persona.displayName} 상세 보기`}
                type="button"
              >
                {persona.reason ? <span className="dashboard__party-reason">{persona.reason}</span> : null}
                <PersonaCard
                  card={buildPersonaCard({
                    personaName: persona.personaName,
                    displayName: persona.displayName,
                    role: persona.role as never,
                    avatarUrl: persona.avatarUrl,
                  })}
                />
              </button>
              <figcaption className="dashboard__party-tagline">{persona.tagline}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="dashboard__section" aria-label="캐릭터 도감">
        <div className="dashboard__section-head">
          <h2 className="dashboard__section-title">캐릭터 도감 — 전원 {PERSONA_CODEX.length}인</h2>
          <button
            aria-expanded={codexExpanded}
            className="dashboard__section-toggle"
            onClick={() => setCodexExpanded((open) => !open)}
            type="button"
          >
            {codexExpanded ? "접기" : "전체 보기"}
          </button>
        </div>
        <div className={`dashboard__codex ${codexExpanded ? "is-expanded" : "is-carousel"}`}>
          {PERSONA_CODEX.map((entry) => (
            <button
              className="dashboard__codex-card"
              key={entry.personaName}
              onClick={() =>
                setCodexDetail(
                  buildCodexDetail(entry, { bundleMap: personaBundleMap, slots: loadHermesPool().slots }),
                )
              }
              title={`${entry.displayName} 상세 보기`}
              type="button"
            >
              <PersonaCard
                compact
                card={buildPersonaCard({
                  personaName: entry.personaName,
                  displayName: entry.displayName,
                  role: entry.role as never,
                  avatarUrl: personaAvatars[entry.personaName],
                })}
              />
              <span className="dashboard__codex-caption">{entry.caption}</span>
            </button>
          ))}
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

      {codexDetail ? (
        <PersonaCodexModal
          detail={codexDetail}
          avatarUrl={personaAvatars[codexDetail.entry.personaName]}
          expressions={personaSprites[codexDetail.entry.personaName]}
          onClose={() => setCodexDetail(null)}
          onSummonAutonomy={(personaName) => {
            setCodexDetail(null);
            onSummonPersona?.(personaName, "autonomy");
          }}
          onSummonParallel={(personaName) => {
            setCodexDetail(null);
            onSummonPersona?.(personaName, "parallel");
          }}
          onOpenSwarm={() => {
            setCodexDetail(null);
            onNavigate({ mode: "tmux" });
          }}
        />
      ) : null}
    </div>
  );
}
