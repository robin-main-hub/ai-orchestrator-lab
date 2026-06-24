import { useEffect, useMemo, useState } from "react";
import { CircleCheck, Hourglass, KeyRound, LoaderCircle, ShieldAlert } from "lucide-react";
import type { EventEnvelope } from "@ai-orchestrator/protocol";
import type { WorkbenchAgent } from "../types";
import type { MakimaDelegationAssignmentView, MakimaDelegationCard } from "../lib/makimaDelegation";
import { TimelineScrubber } from "./TimelineScrubber";
import { PERSONA_CODEX } from "../lib/personaCodex";
import { buildPersonaCard, type PersonaRarity } from "../lib/personaCard";
import { resolvePersonaPortraitUrl } from "../lib/personaPortrait";
import {
  deriveTheaterRows,
  stageStateAt,
  summarizeTheater,
  THEATER_STAGES,
  type TheaterRow,
  type TheaterStageState,
} from "../lib/workTheater";
import { cn } from "@/lib/utils";

/**
 * 작전극장(Summon Theater) — v0의 Cyber-Neon 쇼케이스 디자인을 우리 실데이터에
 * 배선한 풀스크린 화면. 좌측 소환 카드(실제 위임 행 → 없으면 코덱스 파티),
 * 중앙 소환 리액터(주인공 초상화 + 회전 마법진), 우측 作戦ログ 6단계 파이프라인,
 * 하단 타자기 커맨드라인. 데이터 로직은 lib/workTheater.ts(테스트됨) 재사용.
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

const RARITY_META: Record<PersonaRarity, { badge: string; ring: string; glow: string }> = {
  SSR: { badge: "border-amber-300/50 bg-amber-400/15 text-amber-200", ring: "ring-violet-300/40", glow: "shadow-[0_0_28px_rgba(167,139,250,0.35)]" },
  SR: { badge: "border-violet-300/40 bg-violet-400/15 text-violet-200", ring: "ring-pink-300/30", glow: "shadow-[0_0_22px_rgba(244,114,182,0.25)]" },
  R: { badge: "border-teal-300/40 bg-teal-400/10 text-teal-200", ring: "ring-teal-300/30", glow: "shadow-[0_0_18px_rgba(45,212,191,0.22)]" },
  N: { badge: "border-white/20 bg-white/5 text-zinc-300", ring: "ring-white/15", glow: "" },
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
  accent: "violet" | "pink" | "teal";
  active: boolean;
  /** 지금 이 에이전트가 있는 단계 (분류/판단/실행/대기/승인/완료) */
  stageKo: string;
  /** 단계 상태 톤 */
  stageState: "blocked" | "active" | "waiting" | "done" | "idle";
  /** 무슨 일을 하는지 — 위임 카드 제목 */
  task?: string;
};

function stageLabelFor(stageIndex: number): string {
  return THEATER_STAGES[Math.max(0, Math.min(stageIndex, THEATER_STAGES.length - 1))]!.ko;
}

function codexParty(count: number): SummonEntry[] {
  const accents: SummonEntry["accent"][] = ["violet", "pink", "teal"];
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
      accent: accents[index % accents.length]!,
      active: index === 0,
      stageKo: "대기",
      stageState: "idle" as const,
    };
  });
}

function rowsToEntries(rows: TheaterRow[], agents: ReadonlyArray<WorkbenchAgent>): SummonEntry[] {
  const accents: SummonEntry["accent"][] = ["violet", "pink", "teal"];
  return rows.slice(0, 6).map((row, index) => {
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
      accent: accents[index % accents.length]!,
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
    return THEATER_STAGES.map((_, index) => (index === 0 ? "active" : "pending"));
  }
  return THEATER_STAGES.map((_, stageIndex) => {
    const states = rows.map((row) => stageStateAt(stageIndex, row.stageIndex, row.blocked));
    if (states.includes("blocked")) return "blocked";
    if (states.includes("active")) return "active";
    if (states.every((state) => state === "done")) return "done";
    return "pending";
  });
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
  const stageStates = useMemo(() => aggregateStageStates(rows), [rows]);
  const summary = summarizeTheater(rows);
  const hero = entries.find((entry) => entry.active) ?? entries[0];

  // 타자기 커맨드라인
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

  return (
    <div className="summon-theater relative flex h-full min-h-0 flex-col overflow-y-auto bg-[#0a0a0b] p-5 text-zinc-100">
      <div className="pointer-events-none absolute -left-32 -top-32 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-teal-400/10 blur-3xl" />

      <header className="flex shrink-0 items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-300/30 bg-violet-500/15 text-violet-200 shadow-[0_0_18px_rgba(167,139,250,0.3)]">
          ✦
        </div>
        <div className="min-w-0">
          <span className="border-b-2 border-violet-400/70 pb-0.5 font-mono text-[15px] font-semibold tracking-wide">
            작전극장
          </span>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            지금 누가 어느 단계(분류→판단→실행→대기→승인→완료)에서 무슨 일을 하는지 한 화면으로. 카드를 누르면 그 에이전트와 바로 대화.
          </p>
        </div>
        <span className="flex-1" />
        <span className="hidden font-mono text-[11px] text-zinc-600 sm:inline">cyber-neon // ver 0.∞</span>
      </header>

      <div className="mt-5 grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)_minmax(240px,300px)]">
        <section aria-label="소환 카드" className="flex min-w-0 flex-col gap-3">
          {entries.slice(0, 4).map((entry) => (
            <SummonCard entry={entry} key={entry.key} onOpen={onOpenAgent} />
          ))}
        </section>

        <section aria-label="소환 리액터" className="flex min-w-0 flex-col items-center justify-center py-6">
          <h2 className="text-3xl font-bold tracking-[0.3em] text-zinc-100">召喚</h2>
          <p className="mt-1 font-mono text-[11px] tracking-[0.4em] text-zinc-500">
            summon · {hero?.key ?? "—"}
          </p>
          <div className="relative mt-6 aspect-square w-full max-w-[340px]">
            <div className="summon-spin absolute inset-0 rounded-full border border-violet-300/25" />
            <div className="summon-spin-rev absolute inset-[10%] rounded-full border border-dashed border-teal-300/25" />
            <div className="absolute inset-x-0 top-0 flex justify-center">
              <span className="h-2.5 w-2.5 rotate-45 bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.8)]" />
            </div>
            <div className="absolute inset-y-0 right-0 flex items-center">
              <span className="h-2.5 w-2.5 rotate-45 bg-pink-400 shadow-[0_0_10px_rgba(244,114,182,0.8)]" />
            </div>
            <div className="absolute inset-y-0 left-0 flex items-center">
              <span className="h-2.5 w-2.5 rotate-45 bg-teal-300 shadow-[0_0_10px_rgba(45,212,191,0.8)]" />
            </div>
            <button
              className="summon-breathe absolute inset-[18%] overflow-hidden rounded-full border border-violet-300/30 bg-zinc-900 shadow-[0_0_60px_rgba(167,139,250,0.25)] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 disabled:cursor-default"
              disabled={!hero?.agentId || !onOpenAgent}
              onClick={() => hero?.agentId && onOpenAgent?.(hero.agentId)}
              title={hero?.agentId ? `${hero.koName}와 대화 열기` : undefined}
              type="button"
            >
              {hero?.portraitUrl ? (
                <img alt={hero.koName} className="h-full w-full object-cover" src={hero.portraitUrl} />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-4xl">✦</div>
              )}
            </button>
          </div>
          {hero ? (
            <div className="mt-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px]">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
              <span className="font-semibold">{hero.jpName}</span>
              <span className="text-zinc-500">{hero.koName}</span>
            </div>
          ) : null}
          {live ? (
            <p className="mt-3 font-mono text-[10.5px] text-zinc-500">
              출격 {summary.deployed} · 승인대기 {summary.awaitingApproval} · 완료 {summary.done}
              {summary.blocked > 0 ? ` · 막힘 ${summary.blocked}` : ""}
            </p>
          ) : (
            <p className="mt-3 font-mono text-[10.5px] text-zinc-600">대기 중 — 지휘자에게 요청을 보내면 무대가 가동됩니다</p>
          )}
        </section>

        <section aria-label="작전 로그" className="flex min-w-0 flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[15px] font-semibold">作戦ログ</h3>
            <span className="font-mono text-[10px] text-zinc-600">LOOP</span>
          </div>
          {THEATER_STAGES.map((stage, index) => (
            <OpLogPill key={stage.key} stage={stage} state={stageStates[index]!} summary={summary} />
          ))}
        </section>
      </div>

      <div className="mt-5 shrink-0 space-y-2.5">
        <TimelineScrubber events={events} />
        <footer className="flex items-center overflow-hidden whitespace-nowrap rounded-xl border border-white/10 bg-black/60 px-4 py-3 font-mono text-[13px]">
          <span className="shrink-0 text-pink-400">&gt;&nbsp;</span>
          <span className="min-w-0 truncate text-zinc-200">{command.slice(2, typed + 2)}</span>
          <span className="summon-breathe ml-0.5 inline-block h-4 w-2 shrink-0 translate-y-0.5 bg-violet-400" aria-hidden />
        </footer>
      </div>
    </div>
  );
}

const STAGE_TONE: Record<SummonEntry["stageState"], string> = {
  blocked: "border-rose-300/50 bg-rose-400/10 text-rose-200",
  active: "border-pink-300/50 bg-pink-400/10 text-pink-200",
  waiting: "border-amber-300/50 bg-amber-400/10 text-amber-200",
  done: "border-teal-300/40 bg-teal-400/[0.08] text-teal-200",
  idle: "border-white/10 bg-white/[0.04] text-zinc-400",
};
const STAGE_STATE_LABEL: Record<SummonEntry["stageState"], string> = {
  blocked: "막힘",
  active: "진행",
  waiting: "승인 대기",
  done: "완료",
  idle: "대기",
};

function SummonCard({ entry, onOpen }: { entry: SummonEntry; onOpen?: (agentId: string) => void }) {
  const meta = RARITY_META[entry.rarity];
  const clickable = Boolean(entry.agentId && onOpen);
  return (
    <article
      className={cn(
        "flex gap-3 rounded-2xl border bg-zinc-900/70 p-3 backdrop-blur transition-colors",
        entry.active ? "border-violet-300/40" : "border-white/10",
        entry.active && meta.glow,
        clickable && "cursor-pointer hover:border-violet-300/50 hover:bg-zinc-900",
      )}
      aria-label={clickable ? `${entry.koName}와 대화 열기 — ${entry.stageKo} 단계` : undefined}
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
          className={cn("h-24 w-[72px] shrink-0 rounded-xl object-cover ring-1", meta.ring)}
          loading="lazy"
          src={entry.portraitUrl}
        />
      ) : (
        <div className="flex h-24 w-[72px] shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-xl text-violet-200">
          {entry.koName.slice(0, 1)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-bold leading-tight">{entry.jpName}</p>
            <p className="truncate text-[11px] text-zinc-500">{entry.koName}</p>
          </div>
          <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold", meta.badge)}>
            {entry.rarity}
            {entry.rarity === "SSR" ? "★" : ""}
          </span>
        </div>
        <p className="mt-0.5 truncate font-mono text-[11px] text-violet-300">{entry.roleLabel}</p>
        {/* 지금 어느 단계에서 무슨 일을 하는지 — 작전극장의 핵심 */}
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold", STAGE_TONE[entry.stageState])}>
            {entry.stageKo} · {STAGE_STATE_LABEL[entry.stageState]}
          </span>
          {entry.task ? <span className="truncate text-[10.5px] text-zinc-500">{entry.task}</span> : null}
        </div>
        <StatBar color="bg-violet-400" label="HP 기억" value={entry.hp} />
        <StatBar color="bg-teal-300" label="MP 신뢰" value={entry.mp} />
      </div>
    </article>
  );
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className="w-14 shrink-0 font-mono text-[9px] text-zinc-500">{label}</span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

function OpLogPill({
  stage,
  state,
  summary,
}: {
  stage: (typeof THEATER_STAGES)[number];
  state: TheaterStageState;
  summary: ReturnType<typeof summarizeTheater>;
}) {
  const isApprove = stage.key === "approve";
  const needsAuth = isApprove && (state === "active" || summary.awaitingApproval > 0);
  const tone = needsAuth
    ? "border-amber-300/50 bg-amber-400/10 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.18)]"
    : state === "blocked"
      ? "border-rose-300/50 bg-rose-400/10 text-rose-200"
      : state === "active"
        ? "border-pink-300/50 bg-pink-400/10 text-pink-200 shadow-[0_0_16px_rgba(244,114,182,0.18)]"
        : state === "done"
          ? "border-teal-300/30 bg-teal-400/[0.06] text-teal-200"
          : "border-white/10 bg-white/[0.03] text-zinc-500";
  const Icon = needsAuth
    ? KeyRound
    : state === "blocked"
      ? ShieldAlert
      : state === "active"
        ? LoaderCircle
        : state === "done"
          ? CircleCheck
          : Hourglass;
  const sub =
    stage.key === "done" && summary.done > 0
      ? `${summary.done} verified`
      : needsAuth
        ? "auth req !"
        : THEATER_STAGE_EN[stage.key];
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border px-3.5 py-2.5", tone)}>
      <Icon className={cn("h-4 w-4 shrink-0", state === "active" && !needsAuth && "summon-spin-icon")} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold leading-tight">
          {stage.jp}
          {needsAuth ? " !" : ""}
        </p>
        <p className="font-mono text-[10.5px] opacity-70">{sub}</p>
      </div>
      {state === "active" && !needsAuth ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pink-300" /> : null}
      {needsAuth ? <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> : null}
      {state === "done" && stage.key === "done" ? <span className="font-mono text-[10px] opacity-60">done</span> : null}
    </div>
  );
}

const THEATER_STAGE_EN: Record<(typeof THEATER_STAGES)[number]["key"], string> = {
  classify: "classify",
  decide: "decide",
  dispatch: "dispatch",
  capture: "capture",
  approve: "auth req",
  done: "verified",
};
