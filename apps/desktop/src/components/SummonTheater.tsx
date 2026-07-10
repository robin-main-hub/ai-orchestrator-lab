import { useCallback, useEffect, useMemo, useState } from "react";
import { Rewind, Sparkles } from "lucide-react";
import type { EventEnvelope } from "@ai-orchestrator/protocol";
import type { WorkbenchAgent } from "../types";
import type { MakimaDelegationAssignmentView, MakimaDelegationCard } from "../lib/makimaDelegation";
import { TimelineScrubber } from "./TimelineScrubber";
import { buildTimelineFrames, formatElapsed } from "../lib/eventTimeline";
import { PERSONA_CODEX } from "../lib/personaCodex";
import { buildPersonaCard, type PersonaRarity } from "../lib/personaCard";
import { resolvePersonaPortraitUrl } from "../lib/personaPortrait";
import {
  deriveTheaterRows,
  stageStateAt,
  summarizeTheater,
  THEATER_STAGES,
  type TheaterRow,
  type TheaterStage,
  type TheaterStageState,
} from "../lib/workTheater";
import { cn } from "@/lib/utils";

/**
 * 작전극장(Summon Theater) — 페르소나 소환 연출을 실데이터에 결박한 풀블리드 화면.
 * 헤더: 타이틀 + 6단계 作戦ログ 트랙(分類→完了, 상태점·인원 배지) + 집계 스트립.
 * 좌(roster): 소환 카드(실제 위임 행 → 없으면 코덱스 파티, 최대 6장).
 * 중앙(stage): 召喚 리액터(주인공 초상 + 회전 마법진) + 타자기 커맨드 티커.
 * 하단(film): 되감기 타임라인. 데이터 로직은 lib/workTheater.ts(테스트됨) 재사용.
 * v2 Wave 1(THR-1): .theater-v2 골격 재편 + 색 토큰 정리(연출 유지).
 */

const JP_NAME: Partial<Record<string, string>> = {
  kurumi: "狂三",
  yuno: "由乃",
  orchestrator: "マキマ",
  architect: "忍",
  verifier: "真姫",
  reviewer: "かぐや",
  skeptic: "アスカ",
  yohane: "善子",
  memory_curator: "レイ",
  builder: "唯",
  executor: "レム",
  researcher: "猫猫",
  negotiator: "花火",
  risk_officer: "C.C.",
  mediator: "ロビン",
  watchdog: "フリーレン",
  domain_expert: "ヘルタ",
  external: "ミサト",
};

/** RARITY_META → U4 accent 사다리(단일 액센트 톤 맵, per-entry 무지개 금지) */
const RARITY_CLASS: Record<PersonaRarity, string> = {
  SSR: "theater-v2__card--ssr",
  SR: "theater-v2__card--sr",
  R: "theater-v2__card--r",
  N: "theater-v2__card--n",
};

type SummonEntry = {
  key: string;
  /** 실제 에이전트 id — 있으면 카드 클릭으로 그 에이전트 대화를 연다(데모 파티는 없음) */
  agentId?: string;
  jpName: string;
  koName: string;
  roleLabel: string;
  portraitUrl?: string;
  rarity: PersonaRarity;
  hp: number;
  mp: number;
  active: boolean;
  /** 지금 이 에이전트가 있는 단계 (분류/판단/실행/대기/승인/완료) */
  stageKo: string;
  /** 단계 상태 톤 */
  stageState: "blocked" | "active" | "waiting" | "done" | "idle";
  /** 무슨 일을 하는지 — 위임 카드 제목 */
  task?: string;
};

/** roster 정렬 순위: blocked > waiting > active > idle > done */
const STAGE_STATE_ORDER: Record<SummonEntry["stageState"], number> = {
  blocked: 0,
  waiting: 1,
  active: 2,
  idle: 3,
  done: 4,
};

function stageLabelFor(stageIndex: number): string {
  return THEATER_STAGES[Math.max(0, Math.min(stageIndex, THEATER_STAGES.length - 1))]!.ko;
}

function codexParty(count: number): SummonEntry[] {
  return PERSONA_CODEX.slice(0, count).map((entry, index) => {
    const card = buildPersonaCard({
      personaName: entry.personaName,
      displayName: entry.displayName,
      role: entry.role as never,
      avatarUrl: resolvePersonaPortraitUrl(entry.personaName, entry.role),
    });
    return {
      key: entry.personaName,
      jpName: JP_NAME[entry.personaName] ?? entry.displayName,
      koName: entry.displayName,
      roleLabel: entry.role,
      portraitUrl: card.avatarUrl,
      rarity: card.rarity,
      hp: card.hp,
      mp: card.mp,
      active: index === 0,
      stageKo: "대기",
      stageState: "idle" as const,
    };
  });
}

function rowsToEntries(rows: TheaterRow[], agents: ReadonlyArray<WorkbenchAgent>): SummonEntry[] {
  return rows.slice(0, 6).map((row) => {
    const agent = agents.find((candidate) => candidate.id === row.agentId);
    const personaKey = agent?.personaName ?? agent?.role ?? row.agentId;
    const card = buildPersonaCard({
      personaName: personaKey,
      displayName: row.name,
      role: (agent?.role ?? "builder") as never,
      avatarUrl: row.portraitUrl,
    });
    const done = row.stageIndex >= THEATER_STAGES.length - 1;
    const atApproval = THEATER_STAGES[row.stageIndex]?.key === "approve";
    const stageState: SummonEntry["stageState"] = row.blocked
      ? "blocked"
      : done
        ? "done"
        : atApproval
          ? "waiting"
          : row.assigned
            ? "active"
            : "idle";
    return {
      key: row.agentId,
      agentId: row.agentId,
      jpName: JP_NAME[personaKey] ?? row.name,
      koName: row.name,
      roleLabel: row.roleLabel,
      portraitUrl: row.portraitUrl,
      rarity: card.rarity,
      hp: card.hp,
      mp: card.mp,
      active: row.assigned && !row.blocked && row.stageIndex < THEATER_STAGES.length - 1,
      stageKo: stageLabelFor(row.stageIndex),
      stageState,
      task: row.title || row.summary || undefined,
    };
  });
}

/** 파이프라인 집계 — 행들이 있으면 실데이터, 없으면 대기 데모 */
function aggregateStageStates(rows: TheaterRow[]): TheaterStageState[] {
  if (rows.length === 0) {
    // 빈 상태: 전 단계 idle (§2.7 "가짜 '분류 active' 폐지" — 헤더 트랙 정직성)
    return THEATER_STAGES.map(() => "pending");
  }
  return THEATER_STAGES.map((_, stageIndex) => {
    const states = rows.map((row) => stageStateAt(stageIndex, row.stageIndex, row.blocked));
    if (states.includes("blocked")) return "blocked";
    if (states.includes("active")) return "active";
    if (states.every((state) => state === "done")) return "done";
    return "pending";
  });
}

/** 각 단계에 지금 몇 명이 있는지 — 헤더 트랙 인원 배지용(rows 파생, workTheater 불변) */
function stageHeadcount(rows: TheaterRow[]): number[] {
  const counts = THEATER_STAGES.map(() => 0);
  for (const row of rows) {
    const index = Math.max(0, Math.min(row.stageIndex, THEATER_STAGES.length - 1));
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts;
}

/** §3 status-dot 톤 — active=accent+halo / approve 대기=warning / done=accent / blocked=destructive / pending=muted */
function stageDotClass(state: TheaterStageState, stageKey: TheaterStage["key"]): string {
  if (state === "blocked") return "theater-v2__dot--blocked";
  if (state === "done") return "theater-v2__dot--done";
  if (state === "active") return stageKey === "approve" ? "theater-v2__dot--await" : "theater-v2__dot--active";
  return "theater-v2__dot--pending";
}

export function SummonTheater({
  cards,
  assignmentsByAgentId,
  agents,
  events = [],
  onOpenAgent,
}: {
  cards: ReadonlyArray<MakimaDelegationCard>;
  assignmentsByAgentId?: Record<string, MakimaDelegationAssignmentView>;
  agents: ReadonlyArray<WorkbenchAgent>;
  /** 세션 이벤트 로그 — 하단 타임라인 되감기 스크러버용 */
  events?: ReadonlyArray<EventEnvelope>;
  /** 배정된 에이전트 카드/주인공 클릭 → 그 에이전트 대화 열기 */
  onOpenAgent?: (agentId: string) => void;
}) {
  const rows = useMemo(
    () =>
      deriveTheaterRows({
        cards,
        assignmentsByAgentId,
        agents,
        resolvePortrait: resolvePersonaPortraitUrl,
      }),
    [cards, assignmentsByAgentId, agents],
  );
  const live = rows.length > 0;
  const entries = useMemo(() => (live ? rowsToEntries(rows, agents) : codexParty(3)), [live, rows, agents]);
  // roster 정렬(blocked>waiting>active>idle>done) — sort는 안정적(V8/Node≥11)이라 동순위 순서 유지
  const rosterEntries = useMemo(
    () => [...entries].sort((a, b) => STAGE_STATE_ORDER[a.stageState] - STAGE_STATE_ORDER[b.stageState]).slice(0, 6),
    [entries],
  );
  const stageStates = useMemo(() => aggregateStageStates(rows), [rows]);
  const stageCounts = useMemo(() => stageHeadcount(rows), [rows]);
  const summary = summarizeTheater(rows);
  const hero = entries.find((entry) => entry.active) ?? entries[0];

  // 타자기 커맨드라인 (연출 유지 — THR-4에서 타이머 폐기→내용 변경 시 fade-in 1회로 교체 예정)
  const command = `> summon ${hero?.key ?? "kurumi"} --role ${hero?.roleLabel ?? "qa"} --mode auto_safe`;
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    setTyped(0);
    const timer = window.setInterval(() => {
      setTyped((current) => {
        if (current >= command.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 38);
    return () => window.clearInterval(timer);
  }, [command]);

  // ── THR-3: 되감기(VOD) 스크러버 배선 ──
  // NOTE: 프레임은 스크러버 내부에서도 events로 다시 만든다(순수·결정적 → 동일 결과).
  // 배너 라벨용으로만 여기서 한 번 더 파생(계약/onScrub 불변 유지, buildTimelineFrames는 O(n log n)로 가벼움).
  const timelineFrames = useMemo(() => buildTimelineFrames(events), [events]);
  const [asOf, setAsOf] = useState<{ position: number; isLive: boolean }>({ position: -1, isLive: true });
  const [goLiveSignal, setGoLiveSignal] = useState(0);
  // useCallback + 동일값 bail: onScrub 무한루프 방지(Finding A)
  const handleScrub = useCallback(
    (position: number, isLive: boolean) =>
      setAsOf((prev) => (prev.position === position && prev.isLive === isLive ? prev : { position, isLive })),
    [],
  );
  const rewound = !asOf.isLive && asOf.position >= 0 && asOf.position < timelineFrames.length;
  const rewoundFrame = rewound ? timelineFrames[asOf.position] : undefined;

  return (
    <div className="theater-v2">
      {/* ── 헤더: 타이틀 / 6단계 트랙 / 집계 ── */}
      <header className="theater-v2__header">
        <div className="theater-v2__title">
          <div className="theater-v2__title-icon">
            <Sparkles aria-hidden className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <span className="theater-v2__title-name font-mono text-[15px] font-semibold tracking-wide">작전극장</span>
            <p className="theater-v2__title-desc text-[11px]">
              지금 누가 어느 단계(분류→판단→실행→대기→승인→완료)에서 무슨 일을 하는지 한 화면으로. 카드를 누르면 그 에이전트와 바로 대화.
            </p>
          </div>
        </div>

        <div aria-label="6단계 파이프라인" className="theater-v2__track">
          {THEATER_STAGES.map((stage, index) => (
            <div className="theater-v2__step" key={stage.key}>
              <span aria-hidden className={cn("theater-v2__dot", stageDotClass(stageStates[index]!, stage.key))} />
              <span className="theater-v2__step-jp text-[11px] font-semibold">{stage.jp}</span>
              {stageCounts[index]! > 0 ? (
                <span className="theater-v2__step-count aol-mono text-[11px]">{stageCounts[index]}</span>
              ) : null}
            </div>
          ))}
        </div>

        <div className="theater-v2__aggregate">
          {live ? (
            <>
              <span className="theater-v2__agg-item">
                <span className="theater-v2__muted">출격</span>
                <b className="aol-mono">{summary.deployed}</b>
              </span>
              <span className="theater-v2__agg-item">
                <span className="theater-v2__muted">승인대기</span>
                <b className="aol-mono">{summary.awaitingApproval}</b>
              </span>
              <span className="theater-v2__agg-item">
                <span className="theater-v2__muted">완료</span>
                <b className="aol-mono">{summary.done}</b>
              </span>
              {summary.blocked > 0 ? (
                <span className="theater-v2__agg-item theater-v2__agg-item--blocked">
                  <span>막힘</span>
                  <b className="aol-mono">{summary.blocked}</b>
                </span>
              ) : null}
            </>
          ) : (
            <span className="theater-v2__empty text-[11px]">대기 중 — 지휘자에게 요청을 보내면 무대가 가동됩니다</span>
          )}
        </div>

        {rewound && rewoundFrame ? (
          <div className="theater-v2__rewind-banner" role="status">
            <Rewind aria-hidden className="h-3.5 w-3.5" />
            <span>
              <b className="aol-mono">+{formatElapsed(rewoundFrame.elapsedMs)}</b> 시점 ·{" "}
              <span className="aol-mono">
                {asOf.position + 1}/{timelineFrames.length}
              </span>
            </span>
            <button
              className="theater-v2__rewind-banner-golive"
              onClick={() => setGoLiveSignal((value) => value + 1)}
              type="button"
            >
              LIVE로
            </button>
          </div>
        ) : null}
      </header>

      {/* ── roster(좌): 소환 카드 최대 6장 ── */}
      <section aria-label="소환 카드" className={cn("theater-v2__roster", rewound && "theater-v2__roster--rewound")}>
        {rewound ? (
          <div className="theater-v2__roster-head">
            <span className="theater-v2__roster-badge">현재 상태</span>
          </div>
        ) : null}
        {rosterEntries.map((entry) => (
          <SummonCard entry={entry} key={entry.key} onOpen={onOpenAgent} />
        ))}
      </section>

      {/* ── stage(중앙): 召喚 리액터 + 커맨드 티커 ── */}
      <section aria-label="소환 리액터" className="theater-v2__stage">
        <div className="flex flex-1 flex-col items-center justify-center py-6">
          <h2 className="text-3xl font-bold tracking-[0.3em]">召喚</h2>
          <p className="theater-v2__muted mt-1 font-mono text-[11px] tracking-[0.4em]">summon · {hero?.key ?? "—"}</p>
          <div className="theater-v2__reactor mt-6">
            <div aria-hidden className="theater-v2__ring-outer summon-spin" />
            <div aria-hidden className="theater-v2__ring-inner summon-spin-rev" />
            <div aria-hidden className="absolute inset-x-0 top-0 flex justify-center">
              <span className="theater-v2__orbit" />
            </div>
            <div aria-hidden className="absolute inset-y-0 right-0 flex items-center">
              <span className="theater-v2__orbit" />
            </div>
            <div aria-hidden className="absolute inset-y-0 left-0 flex items-center">
              <span className="theater-v2__orbit" />
            </div>
            <button
              className="theater-v2__portrait summon-breathe"
              disabled={!hero?.agentId || !onOpenAgent}
              onClick={() => hero?.agentId && onOpenAgent?.(hero.agentId)}
              title={hero?.agentId ? `${hero.koName}와 대화 열기` : undefined}
              type="button"
            >
              {hero?.portraitUrl ? (
                <img alt={hero.koName} className="h-full w-full object-cover" src={hero.portraitUrl} />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Sparkles aria-hidden className="theater-v2__muted h-10 w-10" />
                </div>
              )}
            </button>
          </div>
          {hero ? (
            <div className="theater-v2__namebadge mt-5 flex items-center gap-2 rounded-full px-3 py-1 text-[12px]">
              <span className="theater-v2__namebadge-dot h-1.5 w-1.5 rounded-full" />
              <span className="font-semibold">{hero.jpName}</span>
              <span className="theater-v2__muted">{hero.koName}</span>
            </div>
          ) : null}
        </div>

        <footer className="theater-v2__ticker mt-3 flex items-center overflow-hidden whitespace-nowrap rounded-xl px-4 py-3 font-mono text-[13px]">
          <span className="theater-v2__ticker-prompt shrink-0">&gt;&nbsp;</span>
          <span className="theater-v2__ticker-text min-w-0 truncate">{command.slice(2, typed + 2)}</span>
          <span aria-hidden className="theater-v2__ticker-caret summon-breathe ml-0.5 inline-block h-4 w-2 shrink-0 translate-y-0.5" />
        </footer>
      </section>

      {/* ── film(하단 풀폭): 되감기 스크러버 (THR-3 소유) ── */}
      <div className="theater-v2__film">
        {/* THR-4: hero 피드가 asOf.position으로 framesUpTo 절단 소비 */}
        <TimelineScrubber events={events} goLiveSignal={goLiveSignal} onScrub={handleScrub} />
      </div>
    </div>
  );
}

const STAGE_STATE_LABEL: Record<SummonEntry["stageState"], string> = {
  blocked: "막힘",
  active: "진행",
  waiting: "승인 대기",
  done: "완료",
  idle: "대기",
};

function SummonCard({ entry, onOpen }: { entry: SummonEntry; onOpen?: (agentId: string) => void }) {
  const clickable = Boolean(entry.agentId && onOpen);
  return (
    <article
      aria-label={clickable ? `${entry.koName}와 대화 열기 — ${entry.stageKo} 단계` : undefined}
      className={cn(
        "theater-v2__card",
        RARITY_CLASS[entry.rarity],
        entry.active && "theater-v2__card--active",
        clickable && "theater-v2__card--clickable",
      )}
      onClick={clickable ? () => onOpen?.(entry.agentId!) : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen?.(entry.agentId!);
              }
            }
          : undefined
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? `${entry.koName}와 대화 열기` : undefined}
    >
      {entry.portraitUrl ? (
        <img
          alt={entry.koName}
          className="theater-v2__thumb h-24 w-[72px] shrink-0 rounded-xl object-cover"
          loading="lazy"
          src={entry.portraitUrl}
        />
      ) : (
        <div className="theater-v2__thumb theater-v2__thumb--fallback flex h-24 w-[72px] shrink-0 items-center justify-center rounded-xl text-xl">
          {entry.koName.slice(0, 1)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-bold leading-tight">{entry.jpName}</p>
            <p className="theater-v2__muted truncate text-[11px]">{entry.koName}</p>
          </div>
          <span className="theater-v2__rarity shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold">
            {entry.rarity}
            {entry.rarity === "SSR" ? "★" : ""}
          </span>
        </div>
        <p className="theater-v2__role mt-0.5 truncate font-mono text-[11px]">{entry.roleLabel}</p>
        {/* 지금 어느 단계에서 무슨 일을 하는지 — 작전극장의 핵심 */}
        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            className={cn(
              "theater-v2__stage-chip",
              `theater-v2__stage-chip--${entry.stageState}`,
              "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
            )}
          >
            {entry.stageKo} · {STAGE_STATE_LABEL[entry.stageState]}
          </span>
          {entry.task ? <span className="theater-v2__muted truncate text-[11px]">{entry.task}</span> : null}
        </div>
        <StatBar kind="hp" label="HP 기억" value={entry.hp} />
        <StatBar kind="mp" label="MP 신뢰" value={entry.mp} />
      </div>
    </article>
  );
}

function StatBar({ label, value, kind }: { label: string; value: number; kind: "hp" | "mp" }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className="theater-v2__muted w-14 shrink-0 font-mono text-[11px]">{label}</span>
      <div className="theater-v2__statbar-track h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full", kind === "hp" ? "theater-v2__statbar-fill--hp" : "theater-v2__statbar-fill--mp")}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
