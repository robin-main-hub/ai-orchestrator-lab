import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Circle,
  Code,
  MessageSquare,
  Play,
  Radio,
  Rewind,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { EventEnvelope } from "@ai-orchestrator/protocol";
import type { WorkbenchAgent } from "../types";
import type { MakimaDelegationAssignmentView, MakimaDelegationCard } from "../lib/makimaDelegation";
import { TimelineScrubber } from "./TimelineScrubber";
import {
  buildTimelineFrames,
  cutInTone,
  formatElapsed,
  isCutInEventType,
  recentFeedFrames,
  type CutInTone,
  type TimelineCategory,
  type TimelineFrame,
} from "../lib/eventTimeline";
import { PERSONA_CODEX } from "../lib/personaCodex";
import { buildPersonaCard, type PersonaRarity } from "../lib/personaCard";
import { computePersonaVitals, readPersonaRunHistory, type PersonaRunHistoryEntry } from "../lib/personaVitals";
import { useCountUp } from "../lib/useCountUp";
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
 * 헤더: 타이틀 + 6단계 作戦ログ 트랙(分類→完了, 상태점·인원 배지) + 집계 스트립(카운트업).
 * 좌(roster): 소환 카드(실제 위임 행 → 없으면 예비 코덱스 파티, 최대 6장).
 * 중앙(stage): 召喚 리액터(주인공 초상 + 회전 마법진) + 실황 자막 + 作戦ログ 실황 피드 + 커맨드라인.
 *   무대 상단 컷인 배너(중요 이벤트) · 무대 하단 종결 브리핑 카드(완료/막힘).
 * 하단(film): 되감기 타임라인. 데이터 로직은 lib/workTheater.ts·eventTimeline.ts(테스트됨) 재사용.
 * v2 Wave 4(THR-4): 실황 시맨틱·페르소나 완성 — 타자기 폐기, U3 vitals 실측 바인딩.
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

/** 실황 피드 카테고리 아이콘 — 신원 미해석 프레임의 정직한 폴백(색 아닌 아이콘으로 구분, §1.1) */
const FEED_ICON: Record<TimelineCategory, LucideIcon> = {
  session: Radio,
  message: MessageSquare,
  delegation: Send,
  run: Play,
  coding: Code,
  permission: ShieldCheck,
  tmux: Terminal,
  memory: Brain,
  system: Circle,
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
  /** HP(기억)은 이 서피스에 신호 부재 → 항상 tier 기본치(기준치 툴팁) */
  hpIsDefault: boolean;
  /** MP(신뢰) 실측(표본≥3) 여부 — false면 실이력 완료율, true면 tier 기본치(기준치 툴팁) */
  mpIsDefault: boolean;
  active: boolean;
  /** 지금 이 에이전트가 있는 단계 (분류/판단/실행/대기/승인/완료) */
  stageKo: string;
  /** 단계 상태 톤 */
  stageState: "blocked" | "active" | "waiting" | "done" | "idle";
  /** 무슨 일을 하는지 — 위임 카드 제목 */
  task?: string;
  /** 임무 요약 — 위임 카드 summary(데모 파티는 없음) */
  summary?: string;
};

/** 실황 피드/컷인 아바타용 정직 신원(payload.ownerAgentId → 로스터 매칭 성공 시에만) */
type FeedIdentity = { jpName: string; koName: string; portraitUrl?: string };

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

function codexParty(count: number, history: PersonaRunHistoryEntry[]): SummonEntry[] {
  return PERSONA_CODEX.slice(0, count).map((entry, index) => {
    // U3: MP는 실이력 완료율로 실측(표본<3이면 기본치), HP는 신호 부재로 tier 기본
    const vitals = computePersonaVitals({ personaName: entry.personaName, history });
    const card = buildPersonaCard({
      personaName: entry.personaName,
      displayName: entry.displayName,
      role: entry.role as never,
      trust: vitals.trust,
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
      hpIsDefault: true,
      mpIsDefault: vitals.mpIsDefault,
      active: index === 0,
      stageKo: "대기",
      stageState: "idle" as const,
    };
  });
}

function rowsToEntries(
  rows: TheaterRow[],
  agents: ReadonlyArray<WorkbenchAgent>,
  history: PersonaRunHistoryEntry[],
): SummonEntry[] {
  return rows.slice(0, 6).map((row) => {
    const agent = agents.find((candidate) => candidate.id === row.agentId);
    const personaKey = agent?.personaName ?? agent?.role ?? row.agentId;
    // U3: MP 실측 바인딩(personaRunHistory 완료율) — 표본<3이면 tier 기본치로 폴백
    const vitals = computePersonaVitals({ personaName: personaKey, history });
    const card = buildPersonaCard({
      personaName: personaKey,
      displayName: row.name,
      role: (agent?.role ?? "builder") as never,
      trust: vitals.trust,
      // hp override 생략 — 이 서피스에 기억 품질 신호 부재(§U3, tier 기본 + 기준치 툴팁)
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
      hpIsDefault: true,
      mpIsDefault: vitals.mpIsDefault,
      active: row.assigned && !row.blocked && row.stageIndex < THEATER_STAGES.length - 1,
      stageKo: stageLabelFor(row.stageIndex),
      stageState,
      task: row.title || row.summary || undefined,
      summary: row.summary || undefined,
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
  request = "",
  onRequestMission,
}: {
  cards: ReadonlyArray<MakimaDelegationCard>;
  assignmentsByAgentId?: Record<string, MakimaDelegationAssignmentView>;
  agents: ReadonlyArray<WorkbenchAgent>;
  /** 세션 이벤트 로그 — 하단 타임라인 되감기 스크러버 + 실황 피드·컷인용 */
  events?: ReadonlyArray<EventEnvelope>;
  /** 배정된 에이전트 카드/주인공 클릭 → 그 에이전트 대화 열기 */
  onOpenAgent?: (agentId: string) => void;
  /** 지휘자 최신 요청 원문 — "이번 작전" 패널 1줄 발췌 */
  request?: string;
  /** "지휘자에게 요청 보내기" CTA 배선(후속 슬라이스에서 App.tsx 연결) */
  onRequestMission?: () => void;
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
  // U3: 페르소나 실행 이력(localStorage) 1회 로드 — MP 실측 바인딩 원천
  const runHistory = useMemo(() => readPersonaRunHistory(), []);
  const entries = useMemo(
    () => (live ? rowsToEntries(rows, agents, runHistory) : codexParty(3, runHistory)),
    [live, rows, agents, runHistory],
  );
  // roster 정렬(blocked>waiting>active>idle>done) — sort는 안정적(V8/Node≥11)이라 동순위 순서 유지
  const rosterEntries = useMemo(
    () => [...entries].sort((a, b) => STAGE_STATE_ORDER[a.stageState] - STAGE_STATE_ORDER[b.stageState]).slice(0, 6),
    [entries],
  );
  const stageStates = useMemo(() => aggregateStageStates(rows), [rows]);
  const stageCounts = useMemo(() => stageHeadcount(rows), [rows]);
  const summary = summarizeTheater(rows);
  // 집계 스트립 카운트업(F1 useCountUp — reduced-motion 시 즉시 스냅)
  const deployedCount = useCountUp(summary.deployed);
  const awaitingCount = useCountUp(summary.awaitingApproval);
  const doneCount = useCountUp(summary.done);
  const blockedCount = useCountUp(summary.blocked);
  const [heroKey, setHeroKey] = useState<string | null>(null);
  // hero = 선택 카드 우선 → 없거나 사라졌으면 첫 active → 그다음 첫 entry (폴백 체인)
  const hero =
    entries.find((entry) => entry.key === heroKey) ?? entries.find((entry) => entry.active) ?? entries[0];

  // ── 타임라인 프레임(순수·결정적) + 되감기(VOD) 스크러버 배선(THR-3 이월) ──
  const timelineFrames = useMemo(() => buildTimelineFrames(events), [events]);
  const [asOf, setAsOf] = useState<{ position: number; isLive: boolean }>({ position: -1, isLive: true });
  const [goLiveSignal, setGoLiveSignal] = useState(0);
  const handleScrub = useCallback(
    (position: number, isLive: boolean) =>
      setAsOf((prev) => (prev.position === position && prev.isLive === isLive ? prev : { position, isLive })),
    [],
  );
  const rewound = !asOf.isLive && asOf.position >= 0 && asOf.position < timelineFrames.length;
  const rewoundFrame = rewound ? timelineFrames[asOf.position] : undefined;

  // ── 신원 해석: makima.delegation.* payload.ownerAgentId → 로스터 매칭(정직 경로) ──
  const ownerByEventId = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of events) {
      const owner = (event.payload as { ownerAgentId?: unknown } | null | undefined)?.ownerAgentId;
      if (typeof owner === "string" && owner) map.set(event.id, owner);
    }
    return map;
  }, [events]);
  const entryByAgentId = useMemo(() => {
    const map = new Map<string, SummonEntry>();
    for (const entry of entries) if (entry.agentId) map.set(entry.agentId, entry);
    return map;
  }, [entries]);
  const feedIdentity = useCallback(
    (frame: TimelineFrame): FeedIdentity | null => {
      const owner = ownerByEventId.get(frame.id);
      if (!owner) return null; // 신원 근거 없음 → 카테고리 아이콘 폴백(가짜 배정 금지)
      const entry = entryByAgentId.get(owner);
      if (!entry) return null;
      return { jpName: entry.jpName, koName: entry.koName, portraitUrl: entry.portraitUrl };
    },
    [ownerByEventId, entryByAgentId],
  );

  // ── hero 실황 피드: 라이브면 최근 8, 되감기면 그 시점까지 절단(THR-3 film 주석 이행) ──
  const feedFrames = useMemo(() => recentFeedFrames(timelineFrames, asOf, 8), [timelineFrames, asOf]);
  // hero 현재 행동 자막: hero 소유 최신 프레임(실 이벤트) → 없으면 임무 제목
  const heroFrame = useMemo(() => {
    if (!hero?.agentId) return undefined;
    for (let i = timelineFrames.length - 1; i >= 0; i -= 1) {
      if (ownerByEventId.get(timelineFrames[i]!.id) === hero.agentId) return timelineFrames[i];
    }
    return undefined;
  }, [hero?.agentId, timelineFrames, ownerByEventId]);
  const heroSubtitle = heroFrame ? `${heroFrame.label} · +${formatElapsed(heroFrame.elapsedMs)}` : hero?.task;

  // ── 커맨드라인(타자기 폐기): stage·task 실데이터 바인딩, 내용 변경 시 fade-in 1회(key) ──
  const command = hero
    ? `> summon ${hero.key} --stage ${hero.stageKo}${hero.task ? ` --task "${hero.task.slice(0, 40)}"` : ""}`
    : "> summon --idle";

  // ── 컷인 배너: 새 프레임이 중요 이벤트면 무대 상단 5s 노출(되감기 중 억제) ──
  type CutIn = { id: string; label: string; elapsed: string; tone: CutInTone; identity: FeedIdentity | null };
  const [cutIn, setCutIn] = useState<CutIn | null>(null);
  const cutInProcessedRef = useRef<string | null>(null);
  const isLiveRef = useRef(asOf.isLive);
  isLiveRef.current = asOf.isLive;
  const lastFrame = timelineFrames.length > 0 ? timelineFrames[timelineFrames.length - 1] : undefined;
  const lastFrameId = lastFrame?.id;
  useEffect(() => {
    if (!lastFrame) return;
    const isFirstObservation = cutInProcessedRef.current === null;
    if (cutInProcessedRef.current === lastFrame.id) return;
    cutInProcessedRef.current = lastFrame.id;
    if (isFirstObservation) return; // 마운트 시 기존 이력으로 컷인 발화 금지
    if (!isLiveRef.current) return; // 되감기 중엔 새 프레임 컷인 억제
    if (!isCutInEventType(lastFrame.type)) return;
    setCutIn({
      id: lastFrame.id,
      label: lastFrame.label,
      elapsed: formatElapsed(lastFrame.elapsedMs),
      tone: cutInTone(lastFrame.type),
      identity: feedIdentity(lastFrame),
    });
    const timer = window.setTimeout(() => setCutIn(null), 5000);
    return () => window.clearTimeout(timer);
    // lastFrameId 변화(=새 프레임 도착)만 트리거; isLive는 ref로 읽어 스크럽 재실행 회피
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastFrameId]);

  // ── 종결 브리핑: done/blocked 수 증가 시 브리핑 카드 노출(8s + 수동 닫기) ──
  type Briefing = { kind: "done" | "blocked"; title: string; koName: string; portraitUrl?: string };
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const doneCountRef = useRef<number | null>(null);
  const blockedCountRef = useRef<number | null>(null);
  useEffect(() => {
    const last = THEATER_STAGES.length - 1;
    const doneRows = rows.filter((row) => row.stageIndex >= last);
    const blockedRows = rows.filter((row) => row.blocked);
    const prevDone = doneCountRef.current;
    const prevBlocked = blockedCountRef.current;
    doneCountRef.current = doneRows.length;
    blockedCountRef.current = blockedRows.length;
    if (prevDone === null || prevBlocked === null) return; // 최초 렌더 기준선
    let next: Briefing | null = null;
    if (doneRows.length > prevDone) {
      const row = doneRows[doneRows.length - 1]!;
      next = { kind: "done", title: row.title || row.summary || "임무", koName: row.name, portraitUrl: row.portraitUrl };
    } else if (blockedRows.length > prevBlocked) {
      const row = blockedRows[blockedRows.length - 1]!;
      next = { kind: "blocked", title: row.title || row.summary || "임무", koName: row.name, portraitUrl: row.portraitUrl };
    }
    if (!next) return;
    setBriefing(next);
    const timer = window.setTimeout(() => setBriefing(null), 8000);
    return () => window.clearTimeout(timer);
  }, [rows]);

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
                <b className="aol-mono">{deployedCount}</b>
              </span>
              <span className="theater-v2__agg-item">
                <span className="theater-v2__muted">승인대기</span>
                <b className="aol-mono">{awaitingCount}</b>
              </span>
              <span className="theater-v2__agg-item">
                <span className="theater-v2__muted">완료</span>
                <b className="aol-mono">{doneCount}</b>
              </span>
              {summary.blocked > 0 ? (
                <span className="theater-v2__agg-item theater-v2__agg-item--blocked">
                  <span>막힘</span>
                  <b className="aol-mono">{blockedCount}</b>
                </span>
              ) : null}
            </>
          ) : (
            <span className="theater-v2__empty text-[11px]">대기 중 · 지휘자에게 요청을 보내면 무대가 가동됩니다</span>
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
        ) : !live ? (
          // U21: 데모 파티를 라이브처럼 보이게 하지 않기 — muted 예비 라벨
          <div className="theater-v2__roster-head">
            <span className="theater-v2__roster-reserve">예비 소환수</span>
          </div>
        ) : null}
        {rosterEntries.map((entry) => (
          <SummonCard
            entry={entry}
            key={entry.key}
            onOpen={onOpenAgent}
            onSelect={(key) => setHeroKey(key)}
            selected={hero?.key === entry.key}
          />
        ))}
      </section>

      {/* ── stage(중앙): 컷인 + 召喚 리액터 + 실황 피드 + 커맨드라인 ── */}
      <section aria-label="소환 리액터" className="theater-v2__stage">
        {cutIn ? (
          <div
            className={cn("theater-v2__cutin", `theater-v2__cutin--${cutIn.tone}`, "theater-v2-cutin-in")}
            role="status"
          >
            {cutIn.identity?.portraitUrl ? (
              <img alt={cutIn.identity.koName} className="theater-v2__cutin-avatar" src={cutIn.identity.portraitUrl} />
            ) : (
              <span aria-hidden className="theater-v2__cutin-icon">
                <Zap className="h-4 w-4" />
              </span>
            )}
            <span className="theater-v2__cutin-text min-w-0 truncate">
              {cutIn.identity ? (
                <b className="theater-v2__cutin-jp" lang="ja">
                  {cutIn.identity.jpName} ·{" "}
                </b>
              ) : null}
              {cutIn.label}
            </span>
            <span className="theater-v2__cutin-time aol-mono shrink-0">+{cutIn.elapsed}</span>
          </div>
        ) : null}

        <div className="flex flex-1 flex-col items-center justify-center py-6">
          <h2 className="text-3xl font-bold tracking-[0.3em]">召喚</h2>
          <p className="theater-v2__muted mt-1 font-mono text-[11px] tracking-[0.4em]">summon · {hero?.key ?? "idle"}</p>
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
          {/* 실황 자막 — hero 소유 최신 이벤트(실데이터) 또는 임무 제목, 변경 시 fade-in */}
          {heroSubtitle ? (
            <p className="theater-v2__subtitle theater-v2__ticker-fade mt-2 text-[11px]" key={heroSubtitle}>
              {heroSubtitle}
            </p>
          ) : null}
        </div>

        {/* ── "이번 작전" 패널: 임무 제목·요약·지휘자 요청 발췌 (§2.7) ── */}
        <div aria-label="이번 작전" className="theater-v2__mission">
          {hero?.task ? (
            <>
              <p className="theater-v2__mission-title">{hero.task}</p>
              {hero.summary ? <p className="theater-v2__mission-summary">{hero.summary}</p> : null}
              {request ? (
                <p className="theater-v2__mission-request">
                  <span className="theater-v2__muted">지휘자 요청</span>
                  <span className="theater-v2__mission-request-text">{request}</span>
                </p>
              ) : null}
            </>
          ) : (
            <div className="theater-v2__mission-empty">
              <span aria-hidden className="theater-v2__mission-orbit" />
              <p className="theater-v2__mission-empty-title">작전 대기 중</p>
              <p className="theater-v2__muted text-[11px]">지휘자가 요청을 보내면 이 자리에 임무 브리핑이 열립니다.</p>
              {/* CTA 배선은 후속 슬라이스에서 onRequestMission으로 연결(App.tsx 직렬 큐 예산 소진) */}
              {onRequestMission ? (
                <button className="theater-v2__mission-cta" onClick={onRequestMission} type="button">
                  지휘자에게 요청 보내기
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* ── 作戦ログ 실황 피드(§2.7): 최근 프레임 + delegation/run 아바타 20px ── */}
        <div aria-label="작전 로그" className="theater-v2__feed">
          <div className="theater-v2__feed-head">
            <span className="theater-v2__feed-head-jp" lang="ja">
              作戦ログ
            </span>
            <span className="theater-v2__muted text-[11px]">실황 피드</span>
          </div>
          {feedFrames.length > 0 ? (
            <ul className="theater-v2__feed-list">
              {feedFrames.map((frame) => {
                const identity = feedIdentity(frame);
                const Icon = FEED_ICON[frame.category] ?? Circle;
                return (
                  <li className="theater-v2__feed-row" key={frame.id}>
                    {identity?.portraitUrl ? (
                      <img alt={identity.koName} className="theater-v2__feed-avatar" src={identity.portraitUrl} />
                    ) : (
                      <span aria-hidden className="theater-v2__feed-icon">
                        <Icon className="h-3 w-3" />
                      </span>
                    )}
                    <span className="theater-v2__feed-label min-w-0 truncate">
                      {identity ? (
                        <b className="theater-v2__feed-jp" lang="ja">
                          {identity.jpName} ·{" "}
                        </b>
                      ) : null}
                      {frame.label}
                    </span>
                    <span className="theater-v2__feed-time aol-mono shrink-0">+{formatElapsed(frame.elapsedMs)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="theater-v2__muted theater-v2__feed-empty text-[11px]">
              아직 기록된 작전 로그가 없습니다.
            </p>
          )}
        </div>

        {briefing ? (
          <div
            className={cn(
              "theater-v2__briefing",
              briefing.kind === "blocked" && "theater-v2__briefing--blocked",
              "theater-v2-cutin-in",
            )}
            role="status"
          >
            <div className="theater-v2__briefing-banner">
              <span className="theater-v2__briefing-jp" lang="ja">
                {briefing.kind === "done" ? "作戦完了" : "作戦阻止"}
              </span>
              <span className="theater-v2__briefing-headline min-w-0 truncate">
                {briefing.kind === "done" ? "작전 완료" : "작전 막힘"} · {briefing.title}
              </span>
              <button
                aria-label="브리핑 닫기"
                className="theater-v2__briefing-close"
                onClick={() => setBriefing(null)}
                type="button"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* "브리핑 생성됨" 카드 — 수행 캐릭터 + 임무 제목(실데이터). 클릭 액션 없음:
                홈 "브리핑 로그"로의 이동은 App 상태 접촉이라 이 슬라이스 범위 밖. */}
            <div className="theater-v2__briefing-card">
              {briefing.portraitUrl ? (
                <img alt={briefing.koName} className="theater-v2__briefing-avatar" src={briefing.portraitUrl} />
              ) : (
                <span className="theater-v2__briefing-avatar theater-v2__briefing-avatar--fallback">
                  {briefing.koName.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0">
                <p className="theater-v2__briefing-title truncate">{briefing.title}</p>
                <p className="theater-v2__muted text-[11px]">브리핑 로그에 기록됨 · {briefing.koName}</p>
              </div>
            </div>
          </div>
        ) : null}

        <footer className="theater-v2__ticker mt-3 flex items-center overflow-hidden whitespace-nowrap rounded-xl px-4 py-3 font-mono text-[13px]">
          <span className="theater-v2__ticker-prompt shrink-0">&gt;&nbsp;</span>
          <span className="theater-v2__ticker-text theater-v2__ticker-fade min-w-0 truncate" key={command}>
            {command.slice(2)}
          </span>
          <span aria-hidden className="theater-v2__ticker-caret summon-breathe ml-0.5 inline-block h-4 w-2 shrink-0 translate-y-0.5" />
        </footer>
      </section>

      {/* ── film(하단 풀폭): 되감기 스크러버 (THR-3 소유) ── */}
      <div className="theater-v2__film">
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

function SummonCard({
  entry,
  selected,
  onSelect,
  onOpen,
}: {
  entry: SummonEntry;
  selected?: boolean;
  onSelect?: (key: string) => void;
  onOpen?: (agentId: string) => void;
}) {
  const canTalk = Boolean(entry.agentId && onOpen);
  return (
    <article
      className={cn(
        "theater-v2__card",
        RARITY_CLASS[entry.rarity],
        entry.active && "theater-v2__card--active",
        selected && "theater-v2__card--selected",
      )}
    >
      <button
        aria-label={`${entry.koName} 주인공으로 보기`}
        aria-pressed={selected}
        className="theater-v2__card-body"
        onClick={() => onSelect?.(entry.key)}
        type="button"
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
          <StatBar isDefault={entry.hpIsDefault} kind="hp" label="HP 기억" value={entry.hp} />
          <StatBar isDefault={entry.mpIsDefault} kind="mp" label="MP 신뢰" value={entry.mp} />
        </div>
      </button>
      {canTalk ? (
        <button
          aria-label={`${entry.koName}와 대화 열기`}
          className="theater-v2__card-talk"
          onClick={() => onOpen?.(entry.agentId!)}
          title={`${entry.koName}와 대화 열기`}
          type="button"
        >
          <MessageSquare aria-hidden className="h-4 w-4" />
        </button>
      ) : null}
    </article>
  );
}

function StatBar({
  label,
  value,
  kind,
  isDefault,
}: {
  label: string;
  value: number;
  kind: "hp" | "mp";
  /** true면 tier 기본치 — 출처를 "기준치" 툴팁으로 명시(U3) */
  isDefault?: boolean;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-2" title={isDefault ? "기준치" : undefined}>
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
