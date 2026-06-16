import { useEffect, useRef, useState } from "react";
import { Inbox } from "lucide-react";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Badge } from "../ui/badge";
import { SourceBadge } from "./StatusBadge";
import { EvidenceCard, type EvidenceItem } from "./EvidenceCard";
import { LearningLoopCard, type LearningLoopItem } from "./LearningLoopCard";
import { MemoryCandidateCard, type MemoryCandidateItem } from "./MemoryCandidateCard";
import {
  RuntimeManifestPreviewCard,
  type ManifestEntry,
} from "./RuntimeManifestPreviewCard";
import { classifyEvent, EVENT_CATEGORIES, type EventCategory } from "../../lib/eventClassification";
import { projectWorkItemsLite } from "../../lib/workItemLite";
import { readJsonState, writeJsonState } from "../../lib/persistentJsonState";

/**
 * LINE F / H / N — Assistant Inbox / command center.
 *
 * A dense, dark command-center shell. It composes the four card surfaces
 * (evidence / learning loop / memory candidates / runtime manifest preview)
 * into labelled sections, with view controls (mode switch, search, category /
 * focus filters) on top.
 *
 * INTERACTION PHILOSOPHY (Batch 10): "no side-effect action controls" — NOT
 * "zero interaction". View-only controls are allowed (search input, radios,
 * mode/focus switches, keyboard focus/clear); anything with a side effect is
 * forbidden (approve / send / write / run / apply / dispatch / server call /
 * activation). It still fires no callback on mount and ships zero <button>
 * (search = input, filters = radios) — it reads and narrows, it never executes.
 *
 * LINE H adds an explicit per-section DATA SOURCE label so a viewer can
 * never confuse "live" (observed real app state) with "예시(fixture)"
 * (illustrative example) or an honest empty state. Honesty over polish:
 *   - "live"    → real, observed app state.
 *   - "empty"   → no live data yet, honest empty hint (never faked).
 *   - "example" → clearly-labeled 예시(fixture); never presented as live.
 *
 * LINE N tightens the command-center density: a single shared SourceBadge
 * (live/empty/example) and StatusBadge (PASS/WARNING/BLOCKED) language across
 * all cards, compact section headers with counts, and scannable spacing.
 */

/** Per-section data provenance — drives the source badge + empty handling. */
export type InboxSectionSource = "live" | "empty" | "example";

export type AssistantInboxSources = {
  evidence?: InboxSectionSource;
  learning?: InboxSectionSource;
  memory?: InboxSectionSource;
  manifest?: InboxSectionSource;
};

/**
 * Batch 5 — Command Center view mode (the "theater seat" the inbox is showing).
 *
 * The preview seat lives INSIDE the command center, never as a separate toy
 * page. LIVE data and PREVIEW (fixture) data are kept apart at the PROJECTION
 * plane (see AssistantInboxContainer): this enum only selects which honest
 * projection is shown — it is UI state, never a data action.
 *
 * NOTE on naming: the app already has a `theater` nav surface (SummonTheater,
 * the delegation display). To avoid wiring collisions this concept is named
 * `InboxViewMode` / `commandCenterMode`, NOT "TheaterMode".
 */
export type InboxViewMode = "live" | "preview" | "replay" | "sandbox";

/** The four seats. SANDBOX stays a disabled placeholder (action-risk → deferred). */
export const INBOX_VIEW_MODES: ReadonlyArray<{
  value: InboxViewMode;
  label: string;
  enabled: boolean;
}> = [
  { value: "live", label: "LIVE", enabled: true },
  { value: "preview", label: "PREVIEW", enabled: true },
  { value: "replay", label: "REPLAY", enabled: true },
  { value: "sandbox", label: "SANDBOX", enabled: false },
];

export type AssistantInboxProps = {
  evidence?: ReadonlyArray<EvidenceItem>;
  learningLoops?: ReadonlyArray<LearningLoopItem>;
  memoryCandidates?: ReadonlyArray<MemoryCandidateItem>;
  manifestEntries?: ReadonlyArray<ManifestEntry>;
  /** Per-section data provenance. Defaults to "example" per section (legacy fixture behavior). */
  sources?: AssistantInboxSources;
  /** Which seat is shown. Defaults to "live". UI state only — never a data action. */
  mode?: InboxViewMode;
  /** Notified when the viewer picks a seat. Only ever sets view state upstream. */
  onModeChange?: (mode: InboxViewMode) => void;
  /**
   * Optional, already-formatted "generated/updated" label, passed in from real
   * state. Shown only when provided — never fabricated (no Date.now in the pure
   * projection). Absent → the strip simply omits the timestamp chip.
   */
  generatedAt?: string;
  /** LINE A/C — real event-log size; shown as "events N" when provided (LIVE). */
  eventCount?: number;
  /** LINE A/C — real project-record count; shown as "records N" when provided. */
  recordCount?: number;
  /** LINE A/C — honest label for where the live data came from (e.g. "eventLog"). */
  lastUpdateSource?: string;
  /** Batch 8 LINE B — real event-log entries for the Today/Recent lanes (read-only). */
  recentEvents?: ReadonlyArray<TimedEventInput>;
  /** Batch 8 LINE B — injected now (ms) for deterministic time bucketing. */
  nowMs?: number;
  /**
   * Batch 11 LINE B — remember the active view (focus/category/query) across
   * mounts in localStorage. Off by default (isolated renders stay deterministic);
   * the real app turns it on. Local UI preference only — no server/data write.
   */
  persistFilters?: boolean;
};

/**
 * LINE B — read-only work-queue lane. Generic OS items only (no domain). Lanes
 * are a derived VIEW over the same items already on screen — never a new data
 * source, never a fake-live row. Empty lanes are honest.
 */
/** A single lane row — a generic label with an optional semantic category badge. */
export type WorkLaneItem = { label: string; category?: EventCategory };

export type WorkLane = {
  id: string;
  title: string;
  count: number;
  items: ReadonlyArray<WorkLaneItem>;
  emptyHint: string;
};

/** Batch 8 LINE B — an event-log entry placed into a time bucket. (source: Batch 9 D) */
export type TimedEventInput = { id: string; type: string; createdAt: string; source?: string };

const DAY_MS = 86_400_000;

/**
 * Bucket real event-log entries into today / recent using an INJECTED now (ms) —
 * pure, deterministic, never calls Date.now. "today" = on/after the start of
 * now's UTC day; "recent" = within 7 days before that. Item labels are the
 * generic event type (no domain). Honest-empty buckets when nothing qualifies.
 */
export function bucketEventsByTime(
  events: ReadonlyArray<TimedEventInput> = [],
  nowMs?: number,
): { today: string[]; recent: string[] } {
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) return { today: [], recent: [] };
  const startOfDay = nowMs - (((nowMs % DAY_MS) + DAY_MS) % DAY_MS);
  const recentFloor = startOfDay - 7 * DAY_MS;
  const today: string[] = [];
  const recent: string[] = [];
  for (const e of events) {
    const at = Date.parse(e.createdAt);
    if (Number.isNaN(at)) continue;
    if (at >= startOfDay) today.push(e.type);
    else if (at >= recentFloor) recent.push(e.type);
  }
  return { today, recent };
}

/** Bucket the on-screen items (+ optional timed events) into priority lanes. Pure. */
export function buildWorkLanes(
  {
    evidence = [],
    learningLoops = [],
    memoryCandidates = [],
    manifestEntries = [],
  }: Pick<
    AssistantInboxProps,
    "evidence" | "learningLoops" | "memoryCandidates" | "manifestEntries"
  >,
  timed?: { events?: ReadonlyArray<TimedEventInput>; nowMs?: number },
): WorkLane[] {
  const cap = (xs: ReadonlyArray<WorkLaneItem>) => xs.slice(0, 3);
  const plain = (xs: ReadonlyArray<string>): WorkLaneItem[] => xs.map((label) => ({ label }));
  // LINE B — today/recent rows carry a semantic category badge from the classifier.
  const typed = (xs: ReadonlyArray<string>): WorkLaneItem[] =>
    xs.map((label) => ({ label, category: classifyEvent(label) }));
  const blockedEvidence = evidence.filter((e) => e.verdict === "blocked");
  const blockedManifest = manifestEntries.filter((m) => m.loadable === false);
  const runner = evidence.filter((e) => e.id.startsWith("runner-gate-"));
  const { today, recent } = bucketEventsByTime(timed?.events, timed?.nowMs);
  return [
    {
      id: "today",
      title: "Today",
      count: today.length,
      items: cap(typed(today)),
      emptyHint: "오늘 이벤트 없음",
    },
    {
      id: "recent",
      title: "Recent",
      count: recent.length,
      items: cap(typed(recent)),
      emptyHint: "최근 7일 이벤트 없음",
    },
    {
      id: "waiting",
      title: "Waiting",
      count: memoryCandidates.length,
      items: cap(plain(memoryCandidates.map((m) => m.title))),
      emptyHint: "대기 중 후보 없음",
    },
    {
      id: "blocked",
      title: "Blocked",
      count: blockedEvidence.length + blockedManifest.length,
      items: cap(plain([...blockedEvidence.map((e) => e.title), ...blockedManifest.map((m) => m.name)])),
      emptyHint: "차단된 항목 없음",
    },
    {
      id: "learning",
      title: "Learning",
      count: learningLoops.length,
      items: cap(plain(learningLoops.map((l) => l.title))),
      emptyHint: "learning loop 없음",
    },
    {
      id: "runner",
      title: "Runner",
      count: runner.length,
      items: cap(plain(runner.map((e) => e.title))),
      emptyHint: "runner 신호 없음",
    },
  ];
}

function Section({
  id,
  title,
  count,
  emptyHint,
  emptyDetail,
  source,
  children,
}: {
  id: string;
  title: string;
  count: number;
  emptyHint: string;
  /** LINE V — one honest line on what will populate this section later. */
  emptyDetail?: string;
  source: InboxSectionSource;
  children: React.ReactNode;
}) {
  return (
    <section
      className="space-y-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2"
      data-testid={`assistant-inbox-section-${id}`}
      data-count={count}
      data-source={source}
    >
      <div className="flex items-center gap-2 border-b border-white/5 pb-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        <Badge variant="outline" data-testid={`assistant-inbox-section-count-${id}`}>
          {count}
        </Badge>
        <span className="ml-auto">
          <SourceBadge id={id} source={source} />
        </span>
      </div>
      {count === 0 ? (
        // LINE V — intentional empty: a compact dashed ghost row (clearly NOT a
        // card, no fake/fixture data) that explains why it's empty + what fills
        // it later, so a sparse LIVE surface reads as "waiting", not "broken".
        <div
          className="rounded-md border border-dashed border-white/10 bg-white/[0.012] px-2.5 py-2"
          data-testid={`assistant-inbox-section-empty-${id}`}
          data-empty="true"
        >
          <p className="text-[11px] font-medium text-muted-foreground/80">{emptyHint}</p>
          {emptyDetail ? (
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/55">{emptyDetail}</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1.5">{children}</div>
      )}
    </section>
  );
}

/**
 * The view-mode switch — [ LIVE | PREVIEW | REPLAY | SANDBOX ]. Rendered with
 * radio inputs (NOT buttons) so the inbox keeps its zero-button read-only
 * invariant: it carries no data action, only a view-state change. REPLAY and
 * SANDBOX are visible-but-disabled placeholders this batch.
 */
function ModeSwitch({
  mode,
  onModeChange,
}: {
  mode: InboxViewMode;
  onModeChange?: (mode: InboxViewMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Command Center view mode"
      data-testid="inbox-mode-switch"
      data-view-mode={mode}
      className="flex flex-wrap items-center gap-1.5 px-4 pb-1"
    >
      {INBOX_VIEW_MODES.map((m) => {
        const active = m.value === mode;
        return (
          <label
            key={m.value}
            data-testid={`inbox-mode-label-${m.value}`}
            data-active={active ? "true" : "false"}
            className={[
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
              active
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                : "border-white/10 text-muted-foreground",
              m.enabled ? "cursor-pointer hover:border-white/20" : "cursor-not-allowed opacity-50",
            ].join(" ")}
          >
            <input
              type="radio"
              name="inbox-view-mode"
              className="sr-only"
              data-testid={`inbox-mode-option-${m.value}`}
              data-active={active ? "true" : "false"}
              value={m.value}
              checked={active}
              disabled={!m.enabled}
              onChange={() => {
                if (m.enabled) onModeChange?.(m.value);
              }}
            />
            {m.label}
            {m.enabled ? null : (
              <span className="ml-1 text-[9px] normal-case opacity-70">준비 중</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

/**
 * Persistent PREVIEW watermark. Shown only while the preview seat is active so
 * a viewer can never mistake fixture data for live work.
 */
function PreviewBanner() {
  return (
    <div
      role="note"
      data-testid="assistant-inbox-preview-banner"
      className="mx-4 mb-2 rounded-md border border-l-[3px] border-amber-400/30 border-l-amber-400/80 bg-amber-400/10 px-3 py-1.5 text-[11px] text-amber-200"
    >
      <span className="mr-1 rounded bg-amber-400/20 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider">
        Preview
      </span>
      <span className="font-semibold">PREVIEW MODE</span> — 예시(fixture) 데이터입니다 · 실제
      업무/실제 이벤트가 아닙니다 · 모든 액션은 비활성화되어 있습니다
    </div>
  );
}

/** A compact command-center stat pill. Presentational, no action. */
function StatChip({ children, testid }: { children: React.ReactNode; testid?: string }) {
  return (
    <span
      data-testid={testid}
      className="inline-flex items-center rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
    >
      {children}
    </span>
  );
}

/**
 * LINE U — command-center status strip. Honest counts derived ONLY from the
 * props already on screen (mode, section provenance, runner gate); fabricates
 * nothing and makes no call. Gives even a sparse LIVE surface an "ops desk"
 * read instead of dead space.
 */
function StatusStrip({
  mode,
  total,
  liveSections,
  emptySections,
  blocked,
  warnings,
  gateLabel,
  gateKind,
  eventCount,
  recordCount,
  lastUpdateSource,
  generatedAt,
}: {
  mode: InboxViewMode;
  total: number;
  liveSections: number;
  emptySections: number;
  blocked: number;
  warnings: number;
  gateLabel: string | null;
  gateKind: string | null;
  eventCount?: number;
  recordCount?: number;
  lastUpdateSource?: string;
  generatedAt?: string;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 px-4 pb-2"
      data-testid="assistant-inbox-status-strip"
      data-mode={mode}
      data-total={total}
      data-live-sections={liveSections}
      data-empty-sections={emptySections}
      data-blocked={blocked}
      data-warnings={warnings}
      data-gate={gateKind ?? "none"}
    >
      <StatChip>{mode.toUpperCase()}</StatChip>
      <StatChip>{total} items</StatChip>
      <StatChip>{liveSections}/4 live</StatChip>
      <StatChip>{emptySections}/4 empty</StatChip>
      <StatChip testid="assistant-inbox-stat-blocked">{blocked} blocked</StatChip>
      <StatChip testid="assistant-inbox-stat-warnings">{warnings} warn</StatChip>
      {gateLabel ? <StatChip>gate · {gateLabel}</StatChip> : null}
      {typeof eventCount === "number" ? (
        <StatChip testid="assistant-inbox-stat-events">{eventCount} events</StatChip>
      ) : null}
      {typeof recordCount === "number" ? (
        <StatChip testid="assistant-inbox-stat-records">{recordCount} records</StatChip>
      ) : null}
      {lastUpdateSource ? (
        <StatChip testid="assistant-inbox-update-source">src · {lastUpdateSource}</StatChip>
      ) : null}
      {generatedAt ? (
        <StatChip testid="assistant-inbox-generated-at">updated {generatedAt}</StatChip>
      ) : null}
    </div>
  );
}

/**
 * LINE U/V — polished LIVE empty hero. Shown only when LIVE has no live data
 * beyond the runner gate, so the empty state reads as intentional ("waiting"),
 * never broken. Honest: states that only the gate is observed.
 */
function LiveEmptyHero() {
  return (
    <div
      className="mx-4 mb-2 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.04] px-3 py-2.5"
      data-testid="assistant-inbox-live-empty-hero"
    >
      <p className="text-[12px] font-semibold text-cyan-200/90">작전 대기 중 · No live data yet</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/75">
        runner gate만 관측됨. learning loop · memory candidate · runtime manifest는 실제 이벤트가
        들어오면 여기 채워집니다.
      </p>
    </div>
  );
}

/**
 * LINE E — preview scenario legend. Names the scenario matrix the fixture deck
 * demonstrates so PREVIEW reads as an intentional design deck, not random demo
 * data. Shown only in PREVIEW; purely presentational (still clearly example).
 */
const PREVIEW_SCENARIOS = [
  "PASS",
  "WARNING",
  "BLOCKED",
  "not observed",
  "eval failed",
  "quarantined",
  "verified",
  "rejected",
] as const;

function PreviewScenarioLegend() {
  return (
    <div
      className="mx-4 mb-2 flex flex-wrap items-center gap-1 text-[10px] text-amber-200/70"
      data-testid="assistant-inbox-preview-scenarios"
    >
      <span className="font-semibold uppercase tracking-wider text-amber-200/90">시나리오 덱</span>
      {PREVIEW_SCENARIOS.map((s) => (
        <span key={s} className="rounded bg-amber-400/10 px-1 py-0.5">
          {s}
        </span>
      ))}
    </div>
  );
}

/** LINE B — the priority lane rail. Read-only, no buttons; honest empty lanes. */
function WorkLaneRail({
  lanes,
  query = "",
  category = "all",
}: {
  lanes: ReadonlyArray<WorkLane>;
  query?: string;
  category?: "all" | EventCategory;
}) {
  const q = query.trim().toLowerCase();
  return (
    <div
      className="mb-3 grid grid-cols-2 gap-1.5 px-4 sm:grid-cols-3 lg:grid-cols-5"
      data-testid="work-lane-rail"
      role="list"
      aria-label="Work queue lanes"
    >
      {lanes.map((lane) => {
        // LINE B — category refines only the event-derived lanes (today/recent),
        // whose items carry a classified category; the typed lanes are untouched.
        const eventLane = lane.id === "today" || lane.id === "recent";
        const catFiltered =
          category !== "all" && eventLane
            ? lane.items.filter((i) => i.category === category)
            : lane.items;
        // LINE A — search filters the visible lane rows (label match).
        const items = q ? catFiltered.filter((i) => i.label.toLowerCase().includes(q)) : catFiltered;
        const filtering = q.length > 0 || (category !== "all" && eventLane);
        const count = filtering ? items.length : lane.count;
        return (
        <div
          key={lane.id}
          role="listitem"
          data-testid={`work-lane-${lane.id}`}
          data-count={count}
          className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1.5"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lane.title}
            </span>
            <span className="ml-auto rounded bg-white/[0.08] px-1 text-[10px] tabular-nums text-zinc-300">
              {count}
            </span>
          </div>
          {count === 0 ? (
            <p
              className="mt-1 text-[10px] leading-snug text-muted-foreground/50"
              data-testid={`work-lane-empty-${lane.id}`}
            >
              {q ? "검색 결과 없음" : filtering ? "필터 결과 없음" : lane.emptyHint}
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {items.map((item, i) => (
                <li
                  key={i}
                  data-testid={`work-lane-item-${lane.id}-${i}`}
                  className="flex items-center gap-1 text-[10px] text-zinc-400"
                >
                  <span className="truncate">{item.label}</span>
                  {item.category ? (
                    <span
                      className="ml-auto shrink-0 rounded bg-white/[0.06] px-1 text-[9px] uppercase tracking-wide text-muted-foreground"
                      data-testid={`work-lane-category-${lane.id}-${i}`}
                      data-category={item.category}
                    >
                      {item.category}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        );
      })}
    </div>
  );
}

/**
 * LINE C — recent eventLog entries for the REPLAY deck, newest first, capped.
 * Pure read-only projection: never mutates, never calls Date.now / a server.
 */
export function projectReplayEvents(
  events: ReadonlyArray<TimedEventInput> = [],
  limit = 20,
): TimedEventInput[] {
  return [...events]
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
    .slice(0, limit);
}

/**
 * LINE C — REPLAY deck. A read-only playback of recent event-log entries (type +
 * timestamp). No action buttons, no server call, no write/append/activation. If
 * the event log is empty, an honest empty replay state.
 */
/** LINE C — read-only REPLAY filters (all + generic categories). View state only. */
const REPLAY_FILTERS: ReadonlyArray<"all" | EventCategory> = [
  "all",
  "failure",
  "learning",
  "runner",
  "memory",
  "approval",
  "system",
];

function ReplayDeck({
  events,
  query = "",
}: {
  events: ReadonlyArray<TimedEventInput>;
  query?: string;
}) {
  // LINE C — local UI filter only. Never mutates the events, never calls a server.
  const [filter, setFilter] = useState<"all" | EventCategory>("all");
  // LINE D — rows are read-only WorkItem-lite (category/source/observed). LINE C
  // filter is view-only over the projection; never mutates the underlying events.
  const items = projectWorkItemsLite(events);
  const byCategory = filter === "all" ? items : items.filter((w) => w.category === filter);
  // Batch 10 LINE A — search narrows the (already category-filtered) rows. View-only.
  const q = query.trim().toLowerCase();
  const matched = q
    ? byCategory.filter((w) =>
        `${w.title} ${w.category} ${w.source}`.toLowerCase().includes(q),
      )
    : byCategory;
  const recent = matched.slice(0, 20);
  return (
    <div className="px-4 pb-1" data-testid="replay-deck" data-count={recent.length} data-filter={filter}>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-200/80">
        REPLAY · 과거 eventLog (read-only)
      </p>
      <div
        role="radiogroup"
        aria-label="Replay category filter"
        data-testid="replay-filter"
        className="mb-1.5 flex flex-wrap gap-1"
      >
        {REPLAY_FILTERS.map((f) => {
          const active = f === filter;
          return (
            <label
              key={f}
              data-testid={`replay-filter-label-${f}`}
              data-active={active ? "true" : "false"}
              className={[
                "inline-flex cursor-pointer items-center rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide transition-colors",
                active
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                  : "border-white/10 text-muted-foreground hover:border-white/20",
              ].join(" ")}
            >
              <input
                type="radio"
                name="replay-filter"
                className="sr-only"
                data-testid={`replay-filter-${f}`}
                data-active={active ? "true" : "false"}
                checked={active}
                onChange={() => setFilter(f)}
              />
              {f}
            </label>
          );
        })}
      </div>
      {recent.length === 0 ? (
        <div
          className="rounded-md border border-dashed border-white/10 bg-white/[0.012] px-2.5 py-2"
          data-testid="replay-deck-empty"
        >
          <p className="text-[11px] text-muted-foreground/70">재생할 이벤트 없음</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground/50">
            {filter === "all"
              ? "실제 이벤트가 쌓이면 최근 항목부터 여기서 재생됩니다 · 읽기 전용"
              : `'${filter}' 범주의 최근 이벤트 없음 · 필터를 바꿔보세요 (읽기 전용)`}
          </p>
        </div>
      ) : (
        <ol className="space-y-0.5">
          {recent.map((w, i) => (
            <li
              key={w.id}
              data-testid={`replay-deck-item-${i}`}
              className="flex items-center gap-2 rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1"
            >
              <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-300">{w.title}</span>
              <span
                className="shrink-0 rounded bg-white/[0.06] px-1 text-[9px] uppercase tracking-wide text-muted-foreground"
                data-testid={`replay-deck-category-${i}`}
                data-category={w.category}
              >
                {w.category}
              </span>
              <span
                className="shrink-0 text-[9px] text-muted-foreground/45"
                data-testid={`replay-deck-source-${i}`}
              >
                {w.source}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                {w.createdAt}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Batch 10 LINE C — view-only focus presets (region visibility; no actions). */
export type InboxFocus = "all" | "today" | "blocked" | "warnings" | "replay";
const INBOX_FOCUSES: ReadonlyArray<InboxFocus> = ["all", "today", "blocked", "warnings", "replay"];
const CATEGORY_OPTIONS: ReadonlyArray<"all" | EventCategory> = ["all", ...EVENT_CATEGORIES];

/**
 * Batch 11 LINE A — built-in Saved Views. Each is a view-only filter combo
 * (focus + category + query). Picking one applies the combo; it is pure view
 * state — never a saved action, never a write to data/server.
 */
export type ViewPreset = {
  id: string;
  label: string;
  focus: InboxFocus;
  category: "all" | EventCategory;
  query: string;
};
export const VIEW_PRESETS: ReadonlyArray<ViewPreset> = [
  { id: "my-desk", label: "My Desk", focus: "all", category: "all", query: "" },
  { id: "today", label: "Today", focus: "today", category: "all", query: "" },
  { id: "blocked", label: "Blocked", focus: "blocked", category: "all", query: "" },
  { id: "failures", label: "Failures", focus: "all", category: "failure", query: "" },
  { id: "runner", label: "Runner", focus: "all", category: "runner", query: "" },
  { id: "learning", label: "Learning", focus: "all", category: "learning", query: "" },
  { id: "replay", label: "Replay", focus: "replay", category: "all", query: "" },
];

/** The preset whose combo matches the current view, if any (for highlight). */
export function activeViewPreset(
  focus: InboxFocus,
  category: "all" | EventCategory,
  query: string,
): ViewPreset | undefined {
  const q = query.trim();
  return VIEW_PRESETS.find(
    (p) => p.focus === focus && p.category === category && p.query === q && p.id !== "replay",
  );
}

/** Batch 11 LINE B — persisted active filter combo (local UI pref; no data write). */
const INBOX_FILTERS_KEY = "ai-orchestrator.inbox-view-filters.v1";
type StoredFilters = { focus: InboxFocus; category: "all" | EventCategory; query: string };
function readStoredFilters(): StoredFilters | null {
  return readJsonState<StoredFilters | null>(INBOX_FILTERS_KEY, null, (v) => {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const { focus, category, query } = o;
    const focusOk =
      typeof focus === "string" && INBOX_FOCUSES.includes(focus as InboxFocus) && focus !== "replay";
    const catOk =
      typeof category === "string" && CATEGORY_OPTIONS.includes(category as "all" | EventCategory);
    if (!focusOk || !catOk || typeof query !== "string") return null;
    return { focus: focus as InboxFocus, category: category as "all" | EventCategory, query };
  });
}

/**
 * LINE B/C — read-only filter bar. A focus strip narrows which region is shown
 * (today/blocked lanes, warnings cards) and "replay" jumps to the REPLAY seat; a
 * category strip refines the event-derived Today/Recent lanes. Radios only — view
 * state, never a side-effect action control (no approve/run/send/write).
 */
function InboxFilterBar({
  focus,
  onFocus,
  category,
  onCategory,
  query = "",
  onPreset,
}: {
  focus: InboxFocus;
  onFocus: (f: InboxFocus) => void;
  category: "all" | EventCategory;
  onCategory: (c: "all" | EventCategory) => void;
  query?: string;
  onPreset: (p: ViewPreset) => void;
}) {
  const chip = (active: boolean) =>
    [
      "inline-flex cursor-pointer items-center rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide transition-colors",
      active
        ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
        : "border-white/10 text-muted-foreground hover:border-white/20",
    ].join(" ");
  const activePreset = activeViewPreset(focus, category, query);
  return (
    <div className="space-y-1 px-4 pb-2">
      <div
        role="radiogroup"
        aria-label="Saved views"
        data-testid="inbox-views"
        data-active-view={activePreset?.id ?? ""}
        className="flex flex-wrap gap-1"
      >
        {VIEW_PRESETS.map((p) => {
          const active = activePreset?.id === p.id;
          return (
            <label key={p.id} data-active={active ? "true" : "false"} className={chip(active)}>
              <input
                type="radio"
                name="inbox-view-preset"
                className="sr-only"
                data-testid={`inbox-view-${p.id}`}
                data-active={active ? "true" : "false"}
                checked={active}
                onChange={() => onPreset(p)}
              />
              {p.label}
            </label>
          );
        })}
      </div>
      <div
        role="radiogroup"
        aria-label="Focus view"
        data-testid="inbox-focus"
        data-focus={focus}
        className="flex flex-wrap gap-1"
      >
        {INBOX_FOCUSES.map((f) => {
          const active = f === focus;
          return (
            <label key={f} data-active={active ? "true" : "false"} className={chip(active)}>
              <input
                type="radio"
                name="inbox-focus"
                className="sr-only"
                data-testid={`inbox-focus-${f}`}
                data-active={active ? "true" : "false"}
                checked={active}
                onChange={() => onFocus(f)}
              />
              {f}
            </label>
          );
        })}
      </div>
      <div
        role="radiogroup"
        aria-label="Category filter"
        data-testid="inbox-category"
        data-category={category}
        className="flex flex-wrap gap-1"
      >
        {CATEGORY_OPTIONS.map((c) => {
          const active = c === category;
          return (
            <label key={c} data-active={active ? "true" : "false"} className={chip(active)}>
              <input
                type="radio"
                name="inbox-category"
                className="sr-only"
                data-testid={`inbox-category-${c}`}
                data-active={active ? "true" : "false"}
                checked={active}
                onChange={() => onCategory(c)}
              />
              {c}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function AssistantInbox({
  evidence = [],
  learningLoops = [],
  memoryCandidates = [],
  manifestEntries = [],
  sources,
  mode = "live",
  onModeChange,
  generatedAt,
  eventCount,
  recordCount,
  lastUpdateSource,
  recentEvents,
  nowMs,
  persistFilters = false,
}: AssistantInboxProps) {
  const total =
    evidence.length + learningLoops.length + memoryCandidates.length + manifestEntries.length;
  // Default to "example" so a section without an explicit source is never
  // mistaken for live (legacy fixture-only callers keep their honest label).
  const evidenceSource = sources?.evidence ?? "example";
  const learningSource = sources?.learning ?? "example";
  const memorySource = sources?.memory ?? "example";
  const manifestSource = sources?.manifest ?? "example";
  const liveCount = [evidenceSource, learningSource, memorySource, manifestSource].filter(
    (s) => s === "live",
  ).length;
  const hasExample =
    evidenceSource === "example" ||
    learningSource === "example" ||
    memorySource === "example" ||
    manifestSource === "example";
  const emptyCount = [evidenceSource, learningSource, memorySource, manifestSource].filter(
    (s) => s === "empty",
  ).length;
  // Runner gate is the always-present derived fact; surface its honest state.
  const gateItem = evidence.find((e) => e.id.startsWith("runner-gate-"));
  const gateKind = gateItem ? gateItem.verdict : null;
  const gateLabel = gateItem ? (gateItem.verdict === "pass" ? "active" : "disabled") : null;
  // LINE A — severity rollups from the rendered evidence (works in LIVE+PREVIEW).
  const blockedCount = evidence.filter((e) => e.verdict === "blocked").length;
  const warningCount = evidence.filter((e) => e.verdict === "warning").length;
  const workLanes = buildWorkLanes(
    { evidence, learningLoops, memoryCandidates, manifestEntries },
    { events: recentEvents, nowMs },
  );
  // LIVE-sparse = LIVE with nothing live beyond the gate. Drives the polished
  // "No live data yet" hero so the first impression reads intentional.
  const liveSparse =
    mode === "live" &&
    learningLoops.length === 0 &&
    memoryCandidates.length === 0 &&
    manifestEntries.length === 0;
  // Batch 10 A/D + Batch 11 B — view-only search/focus/category. With
  // persistFilters on, the active view is restored from (and saved to) a local
  // UI preference; "/" focuses search, Esc clears it. Nothing writes data/server.
  const [storedFilters] = useState(() => (persistFilters ? readStoredFilters() : null));
  const [query, setQuery] = useState(storedFilters?.query ?? "");
  const searchRef = useRef<HTMLInputElement>(null);
  const [focus, setFocus] = useState<InboxFocus>(storedFilters?.focus ?? "all");
  const [category, setCategory] = useState<"all" | EventCategory>(storedFilters?.category ?? "all");
  const onFocusPick = (f: InboxFocus) => {
    if (f === "replay") onModeChange?.("replay");
    else setFocus(f);
  };
  // Batch 11 LINE A — apply a saved view (view-only filter combo).
  const onPreset = (p: ViewPreset) => {
    setQuery(p.query);
    setCategory(p.category);
    onFocusPick(p.focus);
  };
  const visibleLanes =
    focus === "today"
      ? workLanes.filter((l) => l.id === "today" || l.id === "recent")
      : focus === "blocked"
        ? workLanes.filter((l) => l.id === "blocked")
        : workLanes;
  const showCards = focus === "all" || focus === "warnings";
  const onInboxKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "/" && document.activeElement !== searchRef.current) {
      e.preventDefault();
      searchRef.current?.focus();
    } else if (e.key === "Escape" && query) {
      setQuery("");
    }
  };
  // Batch 11 LINE B — persist the active view as a local UI preference only.
  useEffect(() => {
    if (persistFilters) writeJsonState(INBOX_FILTERS_KEY, { focus, category, query });
  }, [persistFilters, focus, category, query]);
  return (
    <Card
      className="border-white/10 bg-black/40 py-3"
      data-testid="assistant-inbox"
      data-total={total}
      data-live-sections={liveCount}
      data-has-example={hasExample ? "true" : "false"}
      data-view-mode={mode}
      data-query={query}
      onKeyDown={onInboxKeyDown}
    >
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-center gap-2">
          <Inbox className="h-4 w-4 text-cyan-300/80" />
          <span className="text-sm font-semibold">Assistant Inbox</span>
          <Badge variant="secondary" data-testid="assistant-inbox-total">
            {total}
          </Badge>
          <Badge
            variant="outline"
            data-testid="assistant-inbox-live-count"
            data-live-sections={liveCount}
          >
            {liveCount}/4 live
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            read-only · 자동 실행/승인 없음
          </span>
          {hasExample ? (
            <span
              className="text-[11px] text-amber-300/80"
              data-testid="assistant-inbox-example-notice"
            >
              일부 섹션은 예시(fixture) — live 아님
            </span>
          ) : null}
        </div>
      </CardHeader>
      <ModeSwitch mode={mode} onModeChange={onModeChange} />
      <StatusStrip
        mode={mode}
        total={total}
        liveSections={liveCount}
        emptySections={emptyCount}
        blocked={blockedCount}
        warnings={warningCount}
        gateLabel={gateLabel}
        gateKind={gateKind}
        eventCount={eventCount}
        recordCount={recordCount}
        lastUpdateSource={lastUpdateSource}
        generatedAt={generatedAt}
      />
      <div className="px-4 pb-2">
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="검색 — 큐 / REPLAY 행 필터 ( / 포커스 · Esc 지움 · read-only )"
          aria-label="Assistant Inbox 검색"
          data-testid="inbox-search"
          className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-200 placeholder:text-muted-foreground/40 focus:border-cyan-400/40 focus:outline-none"
        />
      </div>
      {mode !== "replay" ? (
        <InboxFilterBar
          focus={focus}
          onFocus={onFocusPick}
          category={category}
          onCategory={setCategory}
          query={query}
          onPreset={onPreset}
        />
      ) : null}
      {mode === "replay" ? (
        <ReplayDeck events={recentEvents ?? []} query={query} />
      ) : (
        <>
          {mode === "preview" ? <PreviewBanner /> : null}
          {mode === "preview" ? <PreviewScenarioLegend /> : null}
          {liveSparse ? <LiveEmptyHero /> : null}
          {focus !== "warnings" ? (
            <WorkLaneRail lanes={visibleLanes} query={query} category={category} />
          ) : null}
          {showCards ? (
          <CardContent className="grid grid-cols-1 gap-2.5 px-4 lg:grid-cols-2 lg:gap-2.5 xl:gap-3">
        <Section
          id="evidence"
          title="Evidence"
          count={evidence.length}
          emptyHint="아직 관측된 evidence 없음"
          emptyDetail="OS core엔 도메인 evidence가 없음 · runner gate·검증 결과가 관측되면 표시"
          source={evidenceSource}
        >
          {evidence.map((item) => (
            <EvidenceCard key={item.id} item={item} />
          ))}
        </Section>

        <Section
          id="learning"
          title="Learning Loops"
          count={learningLoops.length}
          emptyHint="아직 관측된 learning loop 없음"
          emptyDetail="learning loop 이벤트가 들어오면 가설→검증→증류 단계로 표시"
          source={learningSource}
        >
          {learningLoops.map((item) => (
            <LearningLoopCard key={item.id} item={item} />
          ))}
        </Section>

        <Section
          id="memory"
          title="Memory Candidates"
          count={memoryCandidates.length}
          emptyHint="아직 memory candidate 없음"
          emptyDetail="project record가 생기면 memory candidate(suggested·observed:false)로 표시"
          source={memorySource}
        >
          {memoryCandidates.map((item) => (
            <MemoryCandidateCard key={item.id} item={item} />
          ))}
        </Section>

        <Section
          id="manifest"
          title="Runtime Manifest Preview"
          count={manifestEntries.length}
          emptyHint="아직 manifest 항목 없음"
          emptyDetail="skill 후보가 활성화 평가(eval)되면 loadable/blocked로 표시"
          source={manifestSource}
        >
          <RuntimeManifestPreviewCard entries={manifestEntries} />
        </Section>
          </CardContent>
          ) : null}
        </>
      )}
    </Card>
  );
}
