import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Inbox, Check, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
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
import { buildReplayTimeline, type ReplayTimelineItem } from "../../lib/replayTimeline";
import {
  EXAMPLE_SANDBOX_PROPOSALS,
  type SandboxOutcome,
  type SandboxProposal,
} from "../../lib/sandboxProposal";
import { EXAMPLE_SOURCE_PACK, projectSourcePack } from "../../lib/plugins/exampleSourcePack";
import type { Freshness, EvidenceDraft } from "../../lib/evidenceDraft";
import {
  TONE,
  CHIP_BASE,
  EMPTY_STATE,
  SECTION_CARD,
  SECTION_HEADER,
} from "../../lib/inboxStyleTokens";
import { INBOX_VOCAB } from "../../lib/inboxVocabulary";
import {
  summarizeRunnerTheater,
  type RunnerTheaterRow,
  type RunnerLane,
  type HeartbeatLiveness,
} from "../../lib/runnerTheater";
import type { LearningMemoryConsole } from "../../lib/learningMemoryConsole";
import {
  WORK_ITEM_LANES,
  type WorkItemCandidate,
  type WorkItemCandidateKind,
  type WorkItemCandidateLane,
  type WorkItemRisk,
} from "../../lib/workItemCandidate";
import {
  buildWorkItemCandidateBoardProjection,
  buildWorkItemCandidateOperations,
  type WorkItemCandidateBoardKindFilter,
  type WorkItemCandidateBoardLaneFilter,
  type WorkItemCandidateBoardRefFilter,
  type WorkItemCandidateBoardScopeFilter,
  type WorkItemCandidateBoardSortMode,
  type WorkItemCandidateBoardRiskFilter,
  type WorkItemCandidateOperationRow,
} from "../../lib/workItemCandidateOperations";
import {
  buildWorkItemCandidateOperatorReview,
  type WorkItemCandidateOperatorReview,
  type WorkItemCandidateOperatorReviewFilter,
} from "../../lib/workItemCandidateOperatorReview";
import {
  linkCandidatesToRunnerSignals,
  type WorkItemCandidateRunnerSignalLinks,
} from "../../lib/workItemCandidateRunnerSignals";
import {
  linkCandidatesToPatchSignals,
  type WorkItemCandidatePatchSignalKind,
  type WorkItemCandidatePatchSignalLinks,
} from "../../lib/workItemCandidatePatchSignals";
import {
  linkCandidatesToLearningMemorySignals,
  type WorkItemCandidateLearningMemorySignalKind,
  type WorkItemCandidateLearningMemorySignalLinks,
} from "../../lib/workItemCandidateLearningMemorySignals";
import { buildWorkItemCandidateSignalSummaryFromOperation } from "../../lib/workItemCandidateSignals";
import {
  linkWorkItemCandidatesToEvidenceDraft,
  type WorkItemEvidenceDraftLinks,
} from "../../lib/workItemEvidenceLinks";
import {
  type WorkItemCandidateReadiness,
  type WorkItemCandidateConfidenceBand,
  type WorkItemCandidateReadinessState,
} from "../../lib/workItemCandidateReadiness";
import {
  projectPluginWorkItems,
  type WorkItemLiteProviderResult,
} from "../../lib/plugins/pluginWorkItemSource";
import type { PluginEvidenceCandidate } from "../../lib/plugins/pluginEvidenceSource";
import type { PluginSourceHealth } from "../../lib/plugins/pluginManifest";
import { SOURCE_SCENARIO_KEYS, type SourceScenarioKey } from "../../lib/plugins/examplePluginSource";
import { SourceDetailDrawer, type SourceDetailItem } from "./SourceDetailDrawer";
import { WorkItemCandidateDetailDrawer } from "./WorkItemCandidateDetailDrawer";
import { WorkItemCandidateSignalChips } from "./WorkItemCandidateSignalChips";
import {
  buildPatchCompareBoard,
  summarizePatchCandidates,
  type PatchCandidate,
  type PatchLaneKey,
  type PatchSafetyStatus,
} from "../../lib/plugins/patchCandidateSource";
import { readJsonState, writeJsonState } from "../../lib/persistentJsonState";
import {
  readUserViews,
  writeUserViews,
  upsertUserView,
  removeUserView,
  slugifyViewName,
  sanitizeSavedViewName,
  type UserSavedView,
} from "../../lib/userSavedViews";

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
  { value: "sandbox", label: "SANDBOX", enabled: true },
];

/**
 * Batch 11 LINE C — a one-shot view command from the Command Palette. App bumps
 * `nonce` per dispatch; the container/inbox apply it (mode / focus / category /
 * clear) via effect. View-only — it only sets view state, never an action.
 */
/** A full local view snapshot — applied atomically (e.g. a saved view). */
export type InboxViewSnapshot = {
  mode: InboxViewMode;
  focus: InboxFocus;
  category: "all" | EventCategory;
  search: string;
};

export type InboxCommand = {
  kind: "mode" | "focus" | "category" | "clear" | "applyView" | "focusSection";
  value?: string;
  /** Present for kind "applyView" — the whole view to apply at once. */
  view?: InboxViewSnapshot;
  nonce: number;
};

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
  /** Batch 11 LINE C — one-shot view command from the Command Palette (view-only). */
  command?: InboxCommand;
  /** Batch 14 LINE D/E — generic plugin source results (read-only display). */
  pluginSources?: ReadonlyArray<WorkItemLiteProviderResult>;
  /** Batch 14 LINE D — generic plugin evidence candidates (read-only). */
  pluginEvidence?: ReadonlyArray<PluginEvidenceCandidate>;
  /** Batch 15 LINE C — PREVIEW-only Source Dock demo scenario (view state only). */
  sourceScenario?: SourceScenarioKey;
  /** Batch 15 LINE C — PREVIEW-only scenario change handler (local UI state). */
  onSourceScenarioChange?: (key: SourceScenarioKey) => void;
  /** Batch 17 LINE A — generic read-only patch candidates (Patch Candidate lane). */
  patchCandidates?: ReadonlyArray<PatchCandidate>;
  /**
   * Engine E2 — read-only runner theater rows (real mission/runner state).
   * Present (even empty) → the Runner Theater card renders (honest-empty when
   * none). Absent → no card (REPLAY/SANDBOX). Display-only; never dispatches.
   */
  runnerTheater?: ReadonlyArray<RunnerTheaterRow>;
  /**
   * Engine E3 — read-only Learning & Memory console roll-up. Present → the card
   * renders (honest-empty when no data). Absent → no card. Display-only; never
   * auto-trusts / loads / writes memory.
   */
  learningMemory?: LearningMemoryConsole;
  /**
   * Engine E4A — a PROJECTED evidence draft (footnoted). Present → the Evidence
   * Draft card renders (PREVIEW=example / LIVE=real input, projected upstream).
   * Absent → no card. Display-only; no external send / write / approve.
   */
  evidenceDraft?: EvidenceDraft;
  /**
   * Engine E5 — read-only WorkItem CANDIDATES (the central axis over all signals).
   * Present (even empty) → the card renders (honest-empty when none). Absent →
   * no card. Candidate-only, display-only — never committed work, no create action.
   */
  workItemCandidates?: ReadonlyArray<WorkItemCandidate>;
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
  // Batch 13 LINE B/C — draw real event-log activity into the semantic lanes by
  // classified category, so lanes reflect actual OS state (not just card items).
  const events = timed?.events ?? [];
  const eventTypesIn = (cat: EventCategory) =>
    events.filter((e) => classifyEvent(e.type) === cat).map((e) => e.type);
  const failureEvents = eventTypesIn("failure");
  const runnerEvents = eventTypesIn("runner");
  const learningEvents = eventTypesIn("learning");
  const approvalEvents = eventTypesIn("approval");
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
      count: memoryCandidates.length + approvalEvents.length,
      items: cap([...plain(memoryCandidates.map((m) => m.title)), ...typed(approvalEvents)]),
      emptyHint: "대기 중 후보 없음",
    },
    {
      id: "blocked",
      title: "Blocked",
      count: blockedEvidence.length + blockedManifest.length + failureEvents.length,
      items: cap([
        ...plain([...blockedEvidence.map((e) => e.title), ...blockedManifest.map((m) => m.name)]),
        ...typed(failureEvents),
      ]),
      emptyHint: "차단된 항목 없음",
    },
    {
      id: "learning",
      title: "Learning",
      count: learningLoops.length + learningEvents.length,
      items: cap([...plain(learningLoops.map((l) => l.title)), ...typed(learningEvents)]),
      emptyHint: "learning loop 없음",
    },
    {
      id: "runner",
      title: "Runner",
      count: runner.length + runnerEvents.length,
      items: cap([...plain(runner.map((e) => e.title)), ...typed(runnerEvents)]),
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
      className={SECTION_CARD}
      data-testid={`assistant-inbox-section-${id}`}
      data-count={count}
      data-source={source}
    >
      <div className="flex items-center gap-2 border-b border-white/5 pb-1.5">
        <h3 className={SECTION_HEADER}>{title}</h3>
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
          className={EMPTY_STATE}
          data-testid={`assistant-inbox-section-empty-${id}`}
          data-empty="true"
        >
          <p className="text-[12px] font-medium text-muted-foreground/80">{emptyHint}</p>
          {emptyDetail ? (
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground/55">{emptyDetail}</p>
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
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wider transition-colors",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
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
              <span className="ml-1 text-[12px] normal-case opacity-70">준비 중</span>
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
      className="mx-4 mb-2 rounded-md border border-l-[3px] border-amber-400/30 border-l-amber-400/80 bg-amber-400/10 px-3 py-1.5 text-[12px] text-amber-200"
    >
      <span className="mr-1 rounded bg-amber-400/20 px-1 py-0.5 text-[12px] font-bold uppercase tracking-wider">
        Preview
      </span>
      <span className="font-semibold">PREVIEW MODE</span> · 예시(fixture) 데이터입니다 · 실제
      업무/실제 이벤트가 아닙니다 · 모든 액션은 비활성화되어 있습니다
    </div>
  );
}

/** Batch 16 LINE B — short hints for the Command Deck buttons (tooltip text). */
const DECK_HINTS: Record<string, string> = {
  "my-desk": "전체 보기 · 필터 해제",
  today: "오늘 레인",
  blocked: "막힌 항목",
  failures: "실패 카테고리",
  runner: "러너 카테고리",
  learning: "러닝 카테고리",
  replay: "리플레이 좌석",
  "source-dock": "외부 소스 갑판으로 이동 · 화면 이동만",
  "patch-candidates": "패치 후보로 이동 · 화면 이동만 · 적용 없음",
  "work-item-candidates": "작업 후보 보기 · 확정 없음",
  "candidate-review": "Candidate Review로 이동 · 화면 이동만 · 확정 없음",
  "operator-console": "오퍼레이터 콘솔로 이동 · 화면 이동만",
  "evidence-draft": "Evidence Draft로 이동 · 화면 이동만 · PREVIEW 전용",
  clear: "검색/필터 초기화",
};

/**
 * Batch 16 LINE B — Command Deck: a visible deck of LOCAL VIEW controls for fast
 * operation. These ARE real <button>s (data-action-scope="local-view") — the
 * upgraded invariant allows local view controls; the enemy is a side-effect OS
 * action. Each button is a thin wrapper over the existing onPreset / jump / clear
 * handlers — it changes view/seat state only, never sends/writes/runs anything.
 */
function CommandDeck({
  activeViewId,
  onPreset,
  onSourceDock,
  onPatchCandidates,
  onWorkItemCandidates,
  onCandidateReview,
  onClear,
}: {
  activeViewId?: string;
  onPreset: (p: ViewPreset) => void;
  onSourceDock: () => void;
  onPatchCandidates: () => void;
  onWorkItemCandidates: () => void;
  onCandidateReview: () => void;
  onClear: () => void;
}) {
  const base =
    "rounded border px-1.5 py-0.5 text-[12px] font-medium tracking-wide transition-colors";
  const tone = (active: boolean) =>
    active
      ? "border-primary/40 bg-primary/10 text-primary"
      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-zinc-200";
  return (
    <div data-testid="command-deck" className="flex flex-wrap items-center gap-1 px-4 pb-2">
      <span className="mr-0.5 text-[12px] font-semibold uppercase tracking-wider text-primary/60">
        deck
      </span>
      {VIEW_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          data-testid={`command-deck-${p.id}`}
          data-action-scope="local-view"
          data-active={p.id === activeViewId}
          title={DECK_HINTS[p.id]}
          onClick={() => onPreset(p)}
          className={`${base} ${tone(p.id === activeViewId)}`}
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        data-testid="command-deck-source-dock"
        data-action-scope="local-view"
        title={DECK_HINTS["source-dock"]}
        onClick={onSourceDock}
        className={`${base} ${tone(false)}`}
      >
        Source Dock
      </button>
      <button
        type="button"
        data-testid="command-deck-patch-candidates"
        data-action-scope="local-view"
        title={DECK_HINTS["patch-candidates"]}
        onClick={onPatchCandidates}
        className={`${base} ${tone(false)}`}
      >
        Patch Candidates
      </button>
      <button
        type="button"
        data-testid="command-deck-work-item-candidates"
        data-action-scope="local-view"
        title={DECK_HINTS["work-item-candidates"]}
        onClick={onWorkItemCandidates}
        className={`${base} ${tone(false)}`}
      >
        WorkItem Candidates
      </button>
      <button
        type="button"
        data-testid="command-deck-candidate-review"
        data-action-scope="local-view"
        title={DECK_HINTS["candidate-review"]}
        onClick={onCandidateReview}
        className={`${base} ${tone(false)}`}
      >
        Candidate Review
      </button>
      <button
        type="button"
        data-testid="command-deck-clear"
        data-action-scope="local-view"
        title={DECK_HINTS.clear}
        onClick={onClear}
        className={`${base} ${tone(false)}`}
      >
        Clear Filters
      </button>
    </div>
  );
}

/**
 * Batch 16 LINE C — Source Dock quick controls: local-view buttons that narrow
 * what the dock LISTS (jump / alerts-only / sources-only / evidence-only / all).
 * Pure view state — never mutates the underlying source/evidence data, never
 * syncs/refreshes/runs anything.
 */
function SourceDockQuickControls({
  view,
  onChange,
  onJump,
}: {
  view: SourceDockView;
  onChange: (v: SourceDockView) => void;
  onJump: () => void;
}) {
  const base = "rounded border px-1.5 py-0.5 text-[12px] tracking-wide transition-colors";
  const tone = (active: boolean) =>
    active
      ? "border-primary/40 bg-primary/10 text-primary"
      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-zinc-200";
  return (
    <div data-testid="source-dock-controls" className="mx-4 mb-1 flex flex-wrap items-center gap-1">
      <span className="mr-0.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        dock
      </span>
      <button
        type="button"
        data-testid="dock-ctl-jump"
        data-action-scope="local-view"
        title="Source Dock로 이동 · 화면 이동만"
        onClick={onJump}
        className={`${base} ${tone(false)}`}
      >
        Jump
      </button>
      <button
        type="button"
        data-testid="dock-ctl-alerts"
        data-action-scope="local-view"
        data-active={view.alerts}
        title="stale·error 소스만"
        onClick={() => onChange({ ...view, alerts: !view.alerts })}
        className={`${base} ${tone(view.alerts)}`}
      >
        Alerts
      </button>
      <button
        type="button"
        data-testid="dock-ctl-sources"
        data-action-scope="local-view"
        data-active={view.show === "sources"}
        title="소스만 보기"
        onClick={() => onChange({ ...view, show: view.show === "sources" ? "all" : "sources" })}
        className={`${base} ${tone(view.show === "sources")}`}
      >
        Sources
      </button>
      <button
        type="button"
        data-testid="dock-ctl-evidence"
        data-action-scope="local-view"
        data-active={view.show === "evidence"}
        title="evidence만 보기"
        onClick={() => onChange({ ...view, show: view.show === "evidence" ? "all" : "evidence" })}
        className={`${base} ${tone(view.show === "evidence")}`}
      >
        Evidence
      </button>
      <button
        type="button"
        data-testid="dock-ctl-all"
        data-action-scope="local-view"
        title="필터 해제"
        onClick={() => onChange({ alerts: false, show: "all" })}
        className={`${base} ${tone(false)}`}
      >
        All
      </button>
    </div>
  );
}

/** A compact command-center stat pill. Presentational, no action. */
function StatChip({ children, testid }: { children: React.ReactNode; testid?: string }) {
  return (
    <span data-testid={testid} className={`${CHIP_BASE} ${TONE.neutral}`}>
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
  activeViewLabel,
  filterSummary,
  srcHealth,
  replayCount,
  patchCount,
  cardRef,
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
  /** Batch 16 LINE A — active saved-view/preset label (or "custom"). */
  activeViewLabel?: string;
  /** Batch 16 LINE A — compact search/filter state summary. */
  filterSummary?: string;
  /** Batch 16 LINE A — source health counts (only when ≥1 source present). */
  srcHealth?: { connected: number; stale: number; error: number };
  /** Batch 16 LINE A — replay item count (read-only eventLog size). */
  replayCount?: number;
  /** Batch 19 — patch candidate count at-a-glance (read-only). */
  patchCount?: number;
  /** Batch 25 LINE J — scroll/focus target for the "Operator Console" palette jump. */
  cardRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      className="flex flex-wrap items-center gap-1.5 px-4 pb-2 outline-none"
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
      {activeViewLabel ? (
        <StatChip testid="assistant-inbox-stat-view">view · {activeViewLabel}</StatChip>
      ) : null}
      {filterSummary ? (
        <StatChip testid="assistant-inbox-stat-filter">filter · {filterSummary}</StatChip>
      ) : null}
      <StatChip>{total} items</StatChip>
      <StatChip>{liveSections}/4 live</StatChip>
      <StatChip>{emptySections}/4 empty</StatChip>
      <StatChip testid="assistant-inbox-stat-blocked">{blocked} blocked</StatChip>
      <StatChip testid="assistant-inbox-stat-warnings">{warnings} warn</StatChip>
      {gateLabel ? <StatChip>gate · {gateLabel}</StatChip> : null}
      {srcHealth ? (
        <>
          <StatChip testid="assistant-inbox-stat-src-connected">
            src <Check className="inline h-3 w-3 align-text-bottom" />
            {srcHealth.connected}
          </StatChip>
          <StatChip testid="assistant-inbox-stat-src-stale">~{srcHealth.stale}</StatChip>
          <StatChip testid="assistant-inbox-stat-src-error">!{srcHealth.error}</StatChip>
        </>
      ) : null}
      {typeof replayCount === "number" ? (
        <StatChip testid="assistant-inbox-stat-replay">{replayCount} replay</StatChip>
      ) : null}
      {typeof patchCount === "number" && patchCount > 0 ? (
        <StatChip testid="assistant-inbox-stat-patch">{patchCount} patch</StatChip>
      ) : null}
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
      className="mx-4 mb-2 rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2.5"
      data-testid="assistant-inbox-live-empty-hero"
    >
      <p className="text-[12px] font-semibold text-primary/90">작전 대기 중 · No live data yet</p>
      <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground/75">
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
      className="mx-4 mb-2 flex flex-wrap items-center gap-1 text-[12px] text-amber-200/70"
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
            <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              {lane.title}
            </span>
            <span className="ml-auto rounded bg-white/[0.08] px-1 text-[12px] tabular-nums text-zinc-300">
              {count}
            </span>
          </div>
          {count === 0 ? (
            <p
              className="mt-1 text-[12px] leading-snug text-muted-foreground/50"
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
                  className="flex items-center gap-1 text-[12px] text-zinc-400"
                >
                  <span className="truncate">{item.label}</span>
                  {item.category ? (
                    <span
                      className="ml-auto shrink-0 rounded bg-white/[0.06] px-1 text-[12px] uppercase tracking-wide text-muted-foreground"
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

/**
 * Batch 23 LINE G — Generic Source Pack demo (PREVIEW-only). Shows how a bundled
 * source pack feeds the OS: its declarative manifest (name/version/kind +
 * capability chips), its projected WorkItemLite rows, and an evidence candidate —
 * all read-only, no execution / remote loading. Generic only; never live.
 */
function SourcePackCard() {
  const pack = projectSourcePack(EXAMPLE_SOURCE_PACK);
  return (
    <div
      data-testid="source-pack-card"
      className="mx-4 mb-2 rounded-lg border border-primary/20 bg-primary/[0.03] p-2.5"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5" data-testid="source-pack-manifest">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-primary/80">
          Source Pack
        </span>
        <span className="text-[12px] font-medium text-zinc-300">{pack.manifest.name}</span>
        <span className="rounded bg-white/[0.06] px-1 text-[12px] tabular-nums text-muted-foreground/70">
          v{pack.manifest.version}
        </span>
        <span
          className="rounded bg-white/[0.06] px-1 text-[12px] uppercase text-muted-foreground/70"
          data-testid="source-pack-kind"
          data-kind={pack.manifest.sourceKind}
        >
          {pack.manifest.sourceKind}
        </span>
        <span className="ml-auto text-[12px] uppercase tracking-wider text-muted-foreground/45">
          declarative · read-only
        </span>
      </div>
      <div className="mb-1.5 flex flex-wrap gap-1">
        {pack.capabilities.map((cap) => (
          <span
            key={cap}
            data-testid={`source-pack-cap-${cap}`}
            className="rounded border border-primary/25 bg-primary/[0.06] px-1 text-[12px] uppercase tracking-wide text-primary/80"
          >
            {cap}
          </span>
        ))}
      </div>
      <ul className="space-y-0.5">
        {pack.rows.map((r, i) => (
          <li
            key={r.id}
            data-testid={`source-pack-row-${i}`}
            className="flex items-center gap-1.5 text-[12px] text-zinc-400"
          >
            <span className="shrink-0 rounded bg-white/[0.06] px-1 text-[12px] uppercase text-muted-foreground/70">
              plugin
            </span>
            <span className="min-w-0 flex-1 truncate">{r.title}</span>
            <span
              className="shrink-0 rounded bg-white/[0.06] px-1 text-[12px] uppercase text-muted-foreground"
              data-category={r.category}
            >
              {r.category}
            </span>
            <span className="shrink-0 text-[12px] text-muted-foreground/45">{r.sourceRef}</span>
          </li>
        ))}
      </ul>
      {pack.evidence.length > 0 ? (
        <ul className="mt-1 space-y-0.5" data-testid="source-pack-evidence">
          {pack.evidence.map((e, i) => (
            <li
              key={e.id}
              data-testid={`source-pack-evidence-${i}`}
              className="flex items-center gap-1.5 text-[12px] text-zinc-400"
            >
              <span className="shrink-0 rounded bg-amber-400/10 px-1 text-[12px] uppercase text-amber-200/70">
                evidence
              </span>
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
              <span className="shrink-0 text-[12px] text-muted-foreground/60" data-trust={e.trust}>
                trust:{e.trust}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Batch 24 LINE H — freshness verdict → chip tone (read-only, display-only). */
const FRESHNESS_TONE: Record<Freshness, string> = {
  fresh: TONE.good,
  aging: TONE.warn,
  stale: TONE.bad,
  unknown: TONE.muted,
};

/**
 * Batch 24 LINE H / Engine E4A — Evidence Draft / Footnote Surface.
 *
 * A generic "trustworthy assistant" draft: claims with superscript footnote
 * markers, a numbered footnotes table where each ref carries a freshness chip
 * (fresh / aging / stale / unknown), and a "missing info / ask" slot for any
 * unbacked claim. Display-only — no buttons, no external send, no approve
 * bureaucracy.
 *
 * E4A: renders a PROJECTED draft passed in as a prop (the container projects
 * PREVIEW=example / LIVE=real input via the pure projectEvidenceDraft). The card
 * no longer computes its own projection, so it can show a real LIVE draft.
 */
function EvidenceDraftCard({
  draft,
  cardRef,
  workItemLinks,
}: {
  draft: EvidenceDraft;
  cardRef?: React.Ref<HTMLDivElement>;
  workItemLinks?: WorkItemEvidenceDraftLinks;
}) {
  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      data-testid="evidence-draft-card"
      className="mx-4 mb-2 rounded-lg border border-primary/20 bg-primary/[0.03] p-2.5 outline-none"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-primary/80">
          Evidence Draft
        </span>
        <span className="text-[12px] font-medium text-zinc-300" data-testid="evidence-draft-title">
          {draft.title}
        </span>
        {draft.staleCount > 0 ? (
          <span
            data-testid="evidence-draft-stale-count"
            data-stale-count={draft.staleCount}
            className={`rounded px-1 text-[12px] uppercase tracking-wide ${TONE.bad}`}
          >
            {draft.staleCount} stale
          </span>
        ) : null}
        {workItemLinks && workItemLinks.relatedCandidateCount > 0 ? (
          <span
            data-testid="evidence-draft-related-candidate-count"
            data-count={workItemLinks.relatedCandidateCount}
            className={`rounded px-1 text-[12px] uppercase tracking-wide ${TONE.info}`}
          >
            {workItemLinks.relatedCandidateCount} related candidates
          </span>
        ) : null}
        <span className="ml-auto text-[12px] uppercase tracking-wider text-muted-foreground/45">
          footnoted · read-only
        </span>
      </div>

      {/* draft body: claims with footnote markers */}
      <ul className="space-y-0.5" data-testid="evidence-draft-claims">
        {draft.claims.map((c) => (
          <li
            key={c.id}
            data-testid={`evidence-draft-claim-${c.id}`}
            data-supported={c.supported ? "true" : "false"}
            className="flex items-start gap-1.5 text-[12px] text-zinc-300"
          >
            <span className="min-w-0 flex-1">{c.text}</span>
            {c.footnotes.length > 0 ? (
              <sup className="shrink-0 text-[12px] tabular-nums text-primary/80">
                {c.footnotes.map((n) => `[${n}]`).join("")}
              </sup>
            ) : (
              <span className="shrink-0 rounded bg-white/[0.06] px-1 text-[12px] uppercase tracking-wide text-muted-foreground/60">
                needs source
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* numbered footnotes with freshness chips */}
      <ol className="mt-1.5 space-y-0.5 border-t border-white/5 pt-1.5" data-testid="evidence-draft-footnotes">
        {draft.footnotes.map((f) => {
          const related = workItemLinks?.byFootnoteRef[f.refId];
          return (
            <li
              key={f.n}
              data-testid={`evidence-draft-footnote-${f.n}`}
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground"
            >
              <span className="shrink-0 tabular-nums text-primary/70">[{f.n}]</span>
              <code className="shrink-0 rounded bg-background/70 px-1">{f.refId}</code>
              <span className="min-w-0 flex-1 truncate">
                {f.label}
                {f.locator ? <span className="opacity-70"> · {f.locator}</span> : null}
              </span>
              {related && related.candidateIds.length > 0 ? (
                <span
                  data-testid={`evidence-draft-footnote-related-${f.n}`}
                  data-count={related.candidateIds.length}
                  className={`shrink-0 rounded px-1 text-[12px] uppercase tracking-wide ${TONE.info}`}
                >
                  {related.candidateIds.length} candidate
                  {related.candidateIds.length === 1 ? "" : "s"}
                </span>
              ) : null}
              <span
                data-testid={`evidence-draft-freshness-${f.n}`}
                data-freshness={f.freshness}
                className={`shrink-0 rounded px-1 text-[12px] uppercase tracking-wide ${FRESHNESS_TONE[f.freshness]}`}
              >
                {f.freshness}
                {f.ageHours != null ? <span className="ml-0.5 opacity-70 tabular-nums">{f.ageHours}h</span> : null}
              </span>
            </li>
          );
        })}
      </ol>

      {/* missing info / ask slot — unbacked claims, no side-effect control */}
      {draft.missing.length > 0 ? (
        <div
          data-testid="evidence-draft-missing"
          data-missing-count={draft.missing.length}
          className="mt-1.5 rounded border border-dashed border-amber-400/25 bg-amber-400/[0.04] p-1.5"
        >
          <div className="mb-0.5 text-[12px] uppercase tracking-wider text-amber-200/70">
            missing info · ask
          </div>
          <ul className="space-y-0.5">
            {draft.missing.map((m) => (
              <li
                key={m.claimId}
                data-testid={`evidence-draft-ask-${m.claimId}`}
                className="text-[12px] text-amber-100/70"
              >
                <span className="text-zinc-300">{m.text}</span>
                <span className="opacity-70"> · {m.ask}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Engine E2 — runner lane → tone + label (read-only, display-only). */
const RUNNER_LANE_TONE: Record<RunnerLane, string> = {
  active: TONE.good,
  attention: TONE.warn,
  idle: TONE.neutral,
  done: TONE.info,
};
const RUNNER_LANE_LABEL: Record<RunnerLane, string> = {
  active: "active",
  attention: "attention",
  idle: "idle",
  done: "done",
};
const RUNNER_LIVENESS_TONE: Record<HeartbeatLiveness, string> = {
  live: TONE.good,
  idle: TONE.warn,
  stale: TONE.bad,
  unknown: TONE.muted,
};
const RUNNER_LANE_ORDER: ReadonlyArray<RunnerLane> = ["active", "attention", "idle", "done"];

/**
 * Engine E2 — Runner Theater: a read-only operations theater over REAL runner /
 * mission state. Shows which runners are active / need attention / idle / done,
 * each with a heartbeat liveness chip, latest output, event + artifact counts.
 * Display-only — no dispatch, no start, no execute, no write. Honest empty when
 * no runner sessions are observed.
 */
function RunnerTheaterCard({
  rows,
  candidateLinks,
}: {
  rows: ReadonlyArray<RunnerTheaterRow>;
  candidateLinks?: WorkItemCandidateRunnerSignalLinks;
}) {
  const summary = summarizeRunnerTheater(rows);
  return (
    <div
      data-testid="runner-theater-card"
      data-total={summary.total}
      className="mx-4 mb-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.02] p-2.5"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-emerald-200/80">
          Runner Theater
        </span>
        <span data-testid="runner-theater-active" className={`${CHIP_BASE} ${TONE.good}`}>
          {summary.active} active
        </span>
        {summary.attention > 0 ? (
          <span data-testid="runner-theater-attention" className={`${CHIP_BASE} ${TONE.warn}`}>
            {summary.attention} attention
          </span>
        ) : null}
        {summary.stalledActive > 0 ? (
          <span
            data-testid="runner-theater-stalled"
            data-stalled={summary.stalledActive}
            className={`${CHIP_BASE} ${TONE.bad}`}
          >
            {summary.stalledActive} stalled
          </span>
        ) : null}
        <span className="ml-auto text-[12px] uppercase tracking-wider text-muted-foreground/45">
          observed · read-only
        </span>
      </div>

      {rows.length === 0 ? (
        <div
          className={EMPTY_STATE}
          data-testid="runner-theater-empty"
          data-empty="true"
        >
          <p className="text-[12px] font-medium text-muted-foreground/80">관측된 runner 세션 없음</p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground/55">
            runner/미션이 시작되면 여기 표시 · 표시 전용 · 관측만
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {RUNNER_LANE_ORDER.filter((lane) => rows.some((r) => r.lane === lane)).map((lane) => (
            <div key={lane} data-testid={`runner-theater-lane-${lane}`}>
              <div className="mb-0.5 flex items-center gap-1">
                <span
                  className={`rounded px-1 text-[12px] uppercase tracking-wide ${RUNNER_LANE_TONE[lane]}`}
                >
                  {RUNNER_LANE_LABEL[lane]}
                </span>
              </div>
              <ul className="space-y-0.5">
                {rows
                  .filter((r) => r.lane === lane)
                  .map((r) => {
                    const linkedCandidateCount =
                      candidateLinks?.byRunnerId[r.id]?.candidateIds.length ?? 0;
                    return (
                      <li
                        key={r.id}
                        data-testid={`runner-theater-row-${r.id}`}
                        data-lane={r.lane}
                        data-liveness={r.liveness}
                        className="flex items-center gap-1.5 text-[12px] text-zinc-300"
                      >
                        <span className="shrink-0 rounded bg-white/[0.06] px-1 text-[12px] uppercase text-muted-foreground/70">
                          {r.role}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{r.title}</span>
                        {linkedCandidateCount > 0 ? (
                          <span
                            data-testid={`runner-candidate-count-${r.id}`}
                            className={`${CHIP_BASE} ${TONE.info}`}
                          >
                            {linkedCandidateCount} candidate
                          </span>
                        ) : null}
                        {r.eventCount > 0 ? (
                          <span className="shrink-0 text-[12px] text-muted-foreground/55 tabular-nums">
                            {r.eventCount}ev
                          </span>
                        ) : null}
                        {r.artifactCount > 0 ? (
                          <span className="shrink-0 text-[12px] text-muted-foreground/55 tabular-nums">
                            {r.artifactCount}art
                          </span>
                        ) : null}
                        <span
                          data-testid={`runner-theater-liveness-${r.id}`}
                          data-liveness={r.liveness}
                          className={`shrink-0 rounded px-1 text-[12px] uppercase tracking-wide ${RUNNER_LIVENESS_TONE[r.liveness]}`}
                        >
                          {r.liveness}
                          {r.ageMinutes != null ? (
                            <span className="ml-0.5 opacity-70 tabular-nums">{r.ageMinutes}m</span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Engine E3 — Learning & Memory Console: a read-only roll-up of what the OS
 * learned (loop stages), distilled (memory candidates, honestly suggested / not
 * written), and whether memory is healthy (eval pass/warn/fail + forbidden /
 * stale / contradicted hits). Display-only — no auto-trust, no load, no write.
 * Honest empty when there is no learning/memory/eval data.
 */
function LearningMemoryConsoleCard({
  console: c,
  candidateLinks,
}: {
  console: LearningMemoryConsole;
  candidateLinks?: WorkItemCandidateLearningMemorySignalLinks;
}) {
  const linkedCandidateCount = candidateLinks?.console.candidateIds.length ?? 0;
  return (
    <div
      data-testid="learning-memory-console"
      data-has-data={c.hasData ? "true" : "false"}
      className="mx-4 mb-2 rounded-lg border border-primary/15 bg-primary/[0.02] p-2.5"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-primary/80">
          Learning &amp; Memory
        </span>
        {linkedCandidateCount > 0 ? (
          <span
            data-testid="lm-workitem-count"
            data-count={linkedCandidateCount}
            className={`${CHIP_BASE} ${TONE.info}`}
          >
            {linkedCandidateCount} {linkedCandidateCount === 1 ? "candidate" : "candidates"}
          </span>
        ) : null}
        {c.flags.map((f, i) => (
          <span
            key={i}
            data-testid={`lm-flag-${i}`}
            className={`${CHIP_BASE} ${TONE.warn}`}
          >
            {f}
          </span>
        ))}
        <span className="ml-auto text-[12px] uppercase tracking-wider text-muted-foreground/45">
          observed · read-only
        </span>
      </div>

      {!c.hasData ? (
        <div className={EMPTY_STATE} data-testid="learning-memory-empty" data-empty="true">
          <p className="text-[12px] font-medium text-muted-foreground/80">관측된 learning/memory 없음</p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground/55">
            learning loop·memory 후보가 관측되면 표시 · 표시 전용 · 자동 신뢰/기록 안 함
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1" data-testid="lm-learning-row">
            <span className="w-16 shrink-0 text-[12px] uppercase tracking-wider text-muted-foreground/55">
              learning
            </span>
            <span data-testid="lm-learning-total" className={`${CHIP_BASE} ${TONE.neutral}`}>
              {c.learning.total} loops
            </span>
            {c.learning.settled > 0 ? (
              <span data-testid="lm-learning-settled" className={`${CHIP_BASE} ${TONE.good}`}>
                {c.learning.settled} settled
              </span>
            ) : null}
            {c.learning.active > 0 ? (
              <span data-testid="lm-learning-active" className={`${CHIP_BASE} ${TONE.info}`}>
                {c.learning.active} active
              </span>
            ) : null}
            {c.learning.rejected > 0 ? (
              <span data-testid="lm-learning-rejected" className={`${CHIP_BASE} ${TONE.bad}`}>
                {c.learning.rejected} rejected
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1" data-testid="lm-memory-row">
            <span className="w-16 shrink-0 text-[12px] uppercase tracking-wider text-muted-foreground/55">
              memory
            </span>
            <span data-testid="lm-memory-total" className={`${CHIP_BASE} ${TONE.neutral}`}>
              {c.memory.total} candidates
            </span>
            <span data-testid="lm-memory-suggested" className={`${CHIP_BASE} ${TONE.muted}`}>
              {c.memory.suggested} suggested
            </span>
            <span className="text-[12px] text-muted-foreground/45">
              {c.memory.observed} written (observed)
            </span>
          </div>

          {c.evalHealth.reports > 0 ? (
            <div className="flex flex-wrap items-center gap-1" data-testid="lm-eval-row">
              <span className="w-16 shrink-0 text-[12px] uppercase tracking-wider text-muted-foreground/55">
                eval
              </span>
              {c.evalHealth.pass > 0 ? (
                <span data-testid="lm-eval-pass" className={`${CHIP_BASE} ${TONE.good}`}>
                  {c.evalHealth.pass} pass
                </span>
              ) : null}
              {c.evalHealth.warning > 0 ? (
                <span data-testid="lm-eval-warning" className={`${CHIP_BASE} ${TONE.warn}`}>
                  {c.evalHealth.warning} warn
                </span>
              ) : null}
              {c.evalHealth.fail > 0 ? (
                <span data-testid="lm-eval-fail" className={`${CHIP_BASE} ${TONE.bad}`}>
                  {c.evalHealth.fail} fail
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Engine E5 — lane / risk tone (read-only, display-only). */
const WIC_LANE_TONE: Record<WorkItemCandidateLane, string> = {
  now: TONE.bad,
  soon: TONE.warn,
  watch: TONE.neutral,
};
const WIC_LANE_LABEL: Record<WorkItemCandidateLane, string> = {
  now: "now",
  soon: "soon",
  watch: "watch",
};
const WIC_RISK_TONE: Record<string, string> = {
  high: TONE.bad,
  medium: TONE.warn,
  low: TONE.muted,
};
const WIC_KINDS: ReadonlyArray<WorkItemCandidateKind> = [
  "patch",
  "runner",
  "evidence",
  "memory",
  "source",
];
const WIC_RISKS: ReadonlyArray<WorkItemRisk> = ["high", "medium", "low"];
const WIC_READINESS_TONE: Record<WorkItemCandidateReadinessState, string> = {
  ready: TONE.good,
  "needs-evidence": TONE.warn,
  blocked: TONE.bad,
  "needs-review": TONE.info,
  unknown: TONE.muted,
};
const WIC_CONFIDENCE_TONE: Record<WorkItemCandidateConfidenceBand, string> = {
  high: TONE.good,
  medium: TONE.info,
  low: TONE.warn,
  unknown: TONE.muted,
};
type WicGroupMode = "lane" | "readiness" | "risk";
type WicSignalFilter = "all" | "any" | "runner" | "patch" | "memory";

const WIC_READINESS_ORDER: ReadonlyArray<WorkItemCandidateReadinessState> = [
  "blocked",
  "needs-evidence",
  "needs-review",
  "ready",
  "unknown",
];

function WorkItemCandidateReadinessChip({
  row,
  readiness,
}: {
  row: WorkItemCandidate;
  readiness: WorkItemCandidateReadiness;
}) {
  return (
    <span
      data-testid={`wic-readiness-chip-${row.id}`}
      data-readiness={readiness.readiness}
      data-confidence={readiness.confidence}
      className={`shrink-0 rounded px-1 text-[12px] uppercase tracking-wide ${WIC_READINESS_TONE[readiness.readiness]}`}
      title={`confidence · ${readiness.confidence}`}
    >
      {readiness.readiness}
    </span>
  );
}

function reviewFilterFromCommand(
  command?: InboxCommand,
): WorkItemCandidateOperatorReviewFilter | null {
  if (command?.kind !== "focusSection") return null;
  if (command.value === "work-item-candidate-review") return "all";
  if (command.value === "work-item-candidate-review-ready") return "ready";
  if (command.value === "work-item-candidate-review-needs-evidence") return "needs-evidence";
  if (command.value === "work-item-candidate-review-blocked") return "blocked";
  if (command.value === "work-item-candidate-review-missing-refs") return "missing-refs";
  return null;
}

function signalFilterFromCommand(command?: InboxCommand): WicSignalFilter | null {
  if (command?.kind !== "focusSection") return null;
  if (command.value === "work-item-candidate-signals") return "any";
  if (command.value === "work-item-candidate-signals-runner") return "runner";
  if (command.value === "work-item-candidate-signals-patch") return "patch";
  if (command.value === "work-item-candidate-signals-memory") return "memory";
  return null;
}

function WorkItemCandidateOperatorReviewPanel({
  review,
  panelRef,
  onFilter,
}: {
  review: WorkItemCandidateOperatorReview;
  panelRef?: RefObject<HTMLDivElement | null>;
  onFilter: (filter: WorkItemCandidateOperatorReviewFilter) => void;
}) {
  const buttonBase =
    "rounded border px-1.5 py-0.5 text-[12px] font-medium transition-colors";
  const buttonTone = (active: boolean) =>
    active
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-zinc-200";
  const CountChip = ({
    testId,
    count,
    label,
    tone = TONE.muted,
  }: {
    testId: string;
    count: number;
    label: string;
    tone?: string;
  }) => (
    <span data-testid={testId} data-count={count} className={`${CHIP_BASE} ${tone}`}>
      {count} {label}
    </span>
  );
  const FilterButton = ({
    testId,
    filter,
    children,
  }: {
    testId: string;
    filter: WorkItemCandidateOperatorReviewFilter;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      data-testid={testId}
      data-action-scope="local-view"
      data-active={review.activeFilter === filter ? "true" : "false"}
      onClick={() => onFilter(filter)}
      className={`${buttonBase} ${buttonTone(review.activeFilter === filter)}`}
    >
      {children}
    </button>
  );

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      data-testid="wic-operator-review"
      data-total={review.counts.total}
      data-filter={review.activeFilter}
      className="mb-2 space-y-1 rounded-md border border-emerald-400/15 bg-emerald-400/[0.025] p-1.5"
    >
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-0.5 text-[12px] font-semibold uppercase tracking-wider text-emerald-200/70">
          operator review
        </span>
        <CountChip testId="wic-review-count-ready" count={review.counts.ready} label="ready" tone={TONE.good} />
        <CountChip
          testId="wic-review-count-needs-evidence"
          count={review.counts.needsEvidence}
          label="needs evidence"
          tone={TONE.warn}
        />
        <CountChip testId="wic-review-count-blocked" count={review.counts.blocked} label="blocked" tone={TONE.bad} />
        <CountChip
          testId="wic-review-count-missing-refs"
          count={review.counts.missingRefs}
          label="missing refs"
          tone={TONE.warn}
        />
        <CountChip
          testId="wic-review-count-stale-unknown-trace"
          count={review.counts.staleOrUnknownTrace}
          label="trace unknown"
          tone={TONE.muted}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span
          data-testid="wic-review-count-high-confidence"
          data-count={review.counts.confidenceHigh}
          className={`${CHIP_BASE} ${TONE.good}`}
        >
          {review.counts.confidenceHigh} high confidence
        </span>
        <span
          data-testid="wic-review-count-low-confidence"
          data-count={review.counts.confidenceLow}
          className={`${CHIP_BASE} ${TONE.warn}`}
        >
          {review.counts.confidenceLow} low confidence
        </span>
        <span className="ml-auto text-[12px] uppercase tracking-wider text-muted-foreground/45">
          local review only · lifecycle 없음
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <FilterButton testId="wic-review-filter-all" filter="all">
          All
        </FilterButton>
        <FilterButton testId="wic-review-filter-ready" filter="ready">
          Ready
        </FilterButton>
        <FilterButton testId="wic-review-filter-needs-evidence" filter="needs-evidence">
          Needs Evidence
        </FilterButton>
        <FilterButton testId="wic-review-filter-blocked" filter="blocked">
          Blocked
        </FilterButton>
        <FilterButton testId="wic-review-filter-missing-refs" filter="missing-refs">
          Missing Refs
        </FilterButton>
        <FilterButton testId="wic-review-filter-stale-unknown-trace" filter="stale-unknown-trace">
          Trace Unknown
        </FilterButton>
        <FilterButton testId="wic-review-filter-high-confidence" filter="high-confidence">
          High Confidence
        </FilterButton>
        <FilterButton testId="wic-review-filter-low-confidence" filter="low-confidence">
          Low Confidence
        </FilterButton>
      </div>
    </div>
  );
}

function patchSignalTone(signal: WorkItemCandidatePatchSignalKind): string {
  if (signal === "patch-blocked") return TONE.bad;
  if (signal === "patch-warning" || signal === "diff-preview-available") return TONE.warn;
  if (signal === "patch-pass") return TONE.good;
  return TONE.info;
}

function learningMemorySignalTone(signal: WorkItemCandidateLearningMemorySignalKind): string {
  if (
    signal === "memory-warning" ||
    signal === "stale-memory" ||
    signal === "contradicted-memory"
  ) {
    return TONE.warn;
  }
  if (signal === "missing-memory-context") return TONE.muted;
  return TONE.info;
}

/**
 * Engine E5 — WorkItem Candidates: the read-only CENTRAL AXIS over the OS's
 * signals (patch / runner / evidence / memory / source). Each row is a
 * candidate-only object — "the OS sees this as possible work" — NOT committed
 * work. Display-only: no create / launch / commit action; row selection is
 * local-detail only. Grouped by
 * urgency lane (now / soon / watch) with a kind badge + risk chip. Honest empty
 * when no signal looks like work.
 */
function WorkItemCandidatesCard({
  rows,
  onSelect,
  cardRef,
  reviewRef,
  reviewCommand,
  workItemLinks,
  runnerSignalLinks,
  patchSignalLinks,
  learningMemorySignalLinks,
}: {
  rows: ReadonlyArray<WorkItemCandidate>;
  onSelect?: (row: WorkItemCandidate) => void;
  cardRef?: RefObject<HTMLDivElement | null>;
  reviewRef?: RefObject<HTMLDivElement | null>;
  reviewCommand?: InboxCommand;
  workItemLinks?: WorkItemEvidenceDraftLinks;
  runnerSignalLinks?: WorkItemCandidateRunnerSignalLinks;
  patchSignalLinks?: WorkItemCandidatePatchSignalLinks;
  learningMemorySignalLinks?: WorkItemCandidateLearningMemorySignalLinks;
}) {
  const [laneFilter, setLaneFilter] = useState<WorkItemCandidateBoardLaneFilter>("all");
  const [riskFilter, setRiskFilter] = useState<WorkItemCandidateBoardRiskFilter>("all");
  const [kindFilter, setKindFilter] = useState<WorkItemCandidateBoardKindFilter>("all");
  const [sourceRefFilter, setSourceRefFilter] = useState<WorkItemCandidateBoardRefFilter>("all");
  const [evidenceRefFilter, setEvidenceRefFilter] = useState<WorkItemCandidateBoardRefFilter>("all");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<WorkItemCandidateBoardScopeFilter>("all");
  const [groupMode, setGroupMode] = useState<WicGroupMode>("lane");
  const [sortMode, setSortMode] = useState<WorkItemCandidateBoardSortMode>("priority");
  const [signalFilter, setSignalFilter] = useState<WicSignalFilter>(
    () => signalFilterFromCommand(reviewCommand) ?? "all",
  );
  const [reviewFilter, setReviewFilter] = useState<WorkItemCandidateOperatorReviewFilter>(
    () => reviewFilterFromCommand(reviewCommand) ?? "all",
  );
  useEffect(() => {
    const next = signalFilterFromCommand(reviewCommand);
    if (next) setSignalFilter(next);
  }, [reviewCommand]);
  useEffect(() => {
    const next = reviewFilterFromCommand(reviewCommand);
    if (next) setReviewFilter(next);
  }, [reviewCommand]);
  const operations = buildWorkItemCandidateOperations(rows, workItemLinks);
  const operatorReview = buildWorkItemCandidateOperatorReview(operations, reviewFilter);
  const summary = operations.summary;
  const reviewScopedOperations = { ...operations, rows: operatorReview.rows };
  const boardProjection = buildWorkItemCandidateBoardProjection(reviewScopedOperations, {
    lane: laneFilter,
    risk: riskFilter,
    kind: kindFilter,
    sourceRefs: sourceRefFilter,
    evidenceRefs: evidenceRefFilter,
    scope: scopeFilter,
    query: candidateQuery,
    sort: sortMode,
  });
  const laneCounts = boardProjection.counts.byLane;
  const riskCounts = boardProjection.counts.byRisk;
  const kindCounts = boardProjection.counts.byKind;
  const sourceRefCount = boardProjection.counts.sourceRefCount;
  const evidenceRefCount = boardProjection.counts.evidenceRefCount;
  const candidateSignalKinds = (candidateId: string) => ({
    runner: (runnerSignalLinks?.byCandidateId[candidateId]?.signals.length ?? 0) > 0,
    patch: (patchSignalLinks?.byCandidateId[candidateId]?.signals.length ?? 0) > 0,
    memory: (learningMemorySignalLinks?.byCandidateId[candidateId]?.signals.length ?? 0) > 0,
  });
  const matchesSignalFilter = (row: WorkItemCandidateOperationRow) => {
    if (signalFilter === "all") return true;
    const kinds = candidateSignalKinds(row.candidate.id);
    if (signalFilter === "any") return kinds.runner || kinds.patch || kinds.memory;
    return kinds[signalFilter];
  };
  const visibleOperationRows = boardProjection.visibleRows.filter(matchesSignalFilter);
  const attentionOperationRows = boardProjection.attentionRows.filter(matchesSignalFilter);
  const buttonBase =
    "rounded border px-1.5 py-0.5 text-[12px] font-medium transition-colors";
  const buttonTone = (active: boolean) =>
    active
      ? "border-primary/40 bg-primary/10 text-primary"
      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-zinc-200";
  const FilterButton = ({
    testId,
    active,
    onClick,
    children,
  }: {
    testId: string;
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      data-testid={testId}
      data-action-scope="local-view"
      data-active={active ? "true" : "false"}
      onClick={onClick}
      className={`${buttonBase} ${buttonTone(active)}`}
    >
      {children}
    </button>
  );
  const renderOperationRows = (operationRows: ReadonlyArray<WorkItemCandidateOperationRow>) => (
    <ul className="space-y-0.5">
      {operationRows.map((operationRow) => {
        const r = operationRow.candidate;
        const signalSummary = buildWorkItemCandidateSignalSummaryFromOperation(operationRow);
        const runnerSignal = runnerSignalLinks?.byCandidateId[r.id]?.signals[0];
        const patchSignal = patchSignalLinks?.byCandidateId[r.id]?.signals[0];
        const learningMemorySignal = learningMemorySignalLinks?.byCandidateId[r.id]?.signals[0];
        return (
          <li
            key={r.id}
            data-testid={`wic-row-${r.id}`}
            data-kind={r.kind}
            data-lane={r.lane}
            data-risk={r.risk}
            data-status={r.status}
            className={`flex items-center gap-1.5 text-[12px] text-zinc-300 ${
              onSelect ? "cursor-pointer rounded px-1 py-0.5 hover:bg-white/[0.04]" : ""
            }`}
            {...(onSelect ? rowActivation(() => onSelect(r)) : {})}
          >
            <span className="shrink-0 rounded bg-white/[0.06] px-1 text-[12px] uppercase text-muted-foreground/70">
              {r.kind}
            </span>
            <span className="min-w-0 flex-1 truncate" title={r.reason}>
              {r.title}
            </span>
            <WorkItemCandidateSignalChips candidateId={r.id} chips={signalSummary.chips} />
            {runnerSignal ? (
              <span
                data-testid={`wic-runner-signal-chip-${r.id}`}
                data-runner-signal={runnerSignal.signal}
                className={`${CHIP_BASE} ${runnerSignal.signal === "runner-stalled" ? TONE.bad : TONE.info}`}
              >
                {runnerSignal.signal}
              </span>
            ) : null}
            {patchSignal ? (
              <span
                data-testid={`wic-patch-signal-chip-${r.id}`}
                data-patch-signal={patchSignal.signal}
                className={`${CHIP_BASE} ${patchSignalTone(patchSignal.signal)}`}
              >
                {patchSignal.signal}
              </span>
            ) : null}
            {learningMemorySignal ? (
              <span
                data-testid={`wic-learning-memory-signal-chip-${r.id}`}
                data-learning-memory-signal={learningMemorySignal.signal}
                className={`${CHIP_BASE} ${learningMemorySignalTone(learningMemorySignal.signal)}`}
              >
                {learningMemorySignal.signal}
              </span>
            ) : null}
            {operationRow.hasLinkedDraftClaims ? (
              <span className="shrink-0 rounded bg-primary/10 px-1 text-[12px] uppercase text-primary/80">
                draft ref
              </span>
            ) : null}
            {r.evidenceRefs.length > 0 ? (
              <span className="shrink-0 text-[12px] text-muted-foreground/55 tabular-nums">
                {r.evidenceRefs.length}ev
              </span>
            ) : null}
            <WorkItemCandidateReadinessChip row={r} readiness={operationRow.readiness} />
            <span
              className={`shrink-0 rounded px-1 text-[12px] uppercase tracking-wide ${WIC_RISK_TONE[r.risk] ?? TONE.muted}`}
            >
              {r.risk}
            </span>
          </li>
        );
      })}
    </ul>
  );
  const renderLaneGroups = () =>
    WORK_ITEM_LANES.filter((lane) =>
      visibleOperationRows.some((row) => row.candidate.lane === lane),
    ).map((lane) => {
      const groupRows = visibleOperationRows.filter((row) => row.candidate.lane === lane);
      return (
        <div
          key={lane}
          data-testid={`wic-ops-group-${lane}`}
          className="rounded-md border border-white/[0.06] bg-white/[0.015] p-1.5"
        >
          <div data-testid={`wic-lane-${lane}`}>
            <div className="mb-0.5 flex items-center gap-1">
              <span className={`rounded px-1 text-[12px] uppercase tracking-wide ${WIC_LANE_TONE[lane]}`}>
                {WIC_LANE_LABEL[lane]}
              </span>
              <span className="text-[12px] text-muted-foreground/45">
                {groupRows.length} candidates
              </span>
            </div>
            {renderOperationRows(groupRows)}
          </div>
        </div>
      );
    });
  const renderDynamicGroups = () => {
    if (groupMode === "readiness") {
      return WIC_READINESS_ORDER.filter((readiness) =>
        visibleOperationRows.some((row) => row.readiness.readiness === readiness),
      ).map((readiness) => {
        const groupRows = visibleOperationRows.filter((row) => row.readiness.readiness === readiness);
        return (
          <div
            key={readiness}
            data-testid={`wic-ops-dynamic-group-${readiness}`}
            className="rounded-md border border-white/[0.06] bg-white/[0.015] p-1.5"
          >
            <div className="mb-0.5 flex items-center gap-1">
              <span className={`rounded px-1 text-[12px] uppercase tracking-wide ${WIC_READINESS_TONE[readiness]}`}>
                {readiness}
              </span>
              <span className="text-[12px] text-muted-foreground/45">{groupRows.length} candidates</span>
            </div>
            {renderOperationRows(groupRows)}
          </div>
        );
      });
    }
    if (groupMode === "risk") {
      return WIC_RISKS.filter((risk) =>
        visibleOperationRows.some((row) => row.candidate.risk === risk),
      ).map((risk) => {
        const groupRows = visibleOperationRows.filter((row) => row.candidate.risk === risk);
        return (
          <div
            key={risk}
            data-testid={`wic-ops-dynamic-group-risk-${risk}`}
            className="rounded-md border border-white/[0.06] bg-white/[0.015] p-1.5"
          >
            <div className="mb-0.5 flex items-center gap-1">
              <span className={`rounded px-1 text-[12px] uppercase tracking-wide ${WIC_RISK_TONE[risk]}`}>
                {risk}
              </span>
              <span className="text-[12px] text-muted-foreground/45">{groupRows.length} candidates</span>
            </div>
            {renderOperationRows(groupRows)}
          </div>
        );
      });
    }
    return renderLaneGroups();
  };
  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      data-testid="work-item-candidates-card"
      data-total={summary.total}
      data-visible={visibleOperationRows.length}
      data-scope={scopeFilter}
      data-group-mode={groupMode}
      data-sort-mode={sortMode}
      data-review-filter={reviewFilter}
      className="mx-4 mb-2 rounded-lg border border-primary/20 bg-primary/[0.03] p-2.5"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-primary/80">
          Work Item Candidates
        </span>
        {summary.now > 0 ? (
          <span data-testid="wic-now" className={`${CHIP_BASE} ${TONE.bad}`}>
            {summary.now} now
          </span>
        ) : null}
        {summary.soon > 0 ? (
          <span data-testid="wic-soon" className={`${CHIP_BASE} ${TONE.warn}`}>
            {summary.soon} soon
          </span>
        ) : null}
        <span className="ml-auto text-[12px] uppercase tracking-wider text-muted-foreground/45">
          candidate · read-only · not committed
        </span>
      </div>

      <div className="mb-2 space-y-1 rounded-md border border-white/[0.06] bg-white/[0.02] p-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span data-testid="wic-summary-total" data-count={summary.total} className={`${CHIP_BASE} ${TONE.info}`}>
            {summary.total} total
          </span>
          {WORK_ITEM_LANES.map((lane) => (
            <span
              key={lane}
              data-testid={`wic-summary-lane-${lane}`}
              data-count={laneCounts[lane]}
              className={`${CHIP_BASE} ${WIC_LANE_TONE[lane]}`}
            >
              {laneCounts[lane]} {lane}
            </span>
          ))}
          {WIC_RISKS.map((risk) => (
            <span
              key={risk}
              data-testid={`wic-summary-risk-${risk}`}
              data-count={riskCounts[risk]}
              className={`${CHIP_BASE} ${WIC_RISK_TONE[risk]}`}
            >
              {riskCounts[risk]} {risk}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {WIC_KINDS.map((kind) => (
            <span
              key={kind}
              data-testid={`wic-summary-kind-${kind}`}
              data-count={kindCounts[kind]}
              className={`${CHIP_BASE} ${TONE.neutral}`}
            >
              {kindCounts[kind]} {kind}
            </span>
          ))}
          <span data-testid="wic-summary-sourceRefs" data-count={sourceRefCount} className={`${CHIP_BASE} ${TONE.muted}`}>
            {sourceRefCount} source refs
          </span>
          <span
            data-testid="wic-summary-evidenceRefs"
            data-count={evidenceRefCount}
            className={`${CHIP_BASE} ${TONE.muted}`}
          >
            {evidenceRefCount} evidence refs
          </span>
        </div>
      </div>

      <WorkItemCandidateOperatorReviewPanel
        review={operatorReview}
        panelRef={reviewRef}
        onFilter={setReviewFilter}
      />

      <div
        data-testid="wic-operations-summary"
        data-total={summary.total}
        className="mb-2 space-y-1 rounded-md border border-primary/15 bg-primary/[0.03] p-1.5"
      >
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-0.5 text-[12px] font-semibold uppercase tracking-wider text-primary/70">
            operations
          </span>
          {(["ready", "needs-evidence", "blocked", "needs-review", "unknown"] as const).map((readiness) => (
            <span
              key={readiness}
              data-testid={`wic-ops-summary-${readiness}`}
              data-count={summary[readiness]}
              className={`${CHIP_BASE} ${WIC_READINESS_TONE[readiness]}`}
            >
              {summary[readiness]} {readiness}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span
            data-testid="wic-ops-summary-confidence-high"
            data-count={summary.confidenceHigh}
            className={`${CHIP_BASE} ${WIC_CONFIDENCE_TONE.high}`}
          >
            {summary.confidenceHigh} high confidence
          </span>
          <span
            data-testid="wic-ops-summary-confidence-medium"
            data-count={summary.confidenceMedium}
            className={`${CHIP_BASE} ${WIC_CONFIDENCE_TONE.medium}`}
          >
            {summary.confidenceMedium} medium confidence
          </span>
          <span
            data-testid="wic-ops-summary-confidence-low"
            data-count={summary.confidenceLow}
            className={`${CHIP_BASE} ${WIC_CONFIDENCE_TONE.low}`}
          >
            {summary.confidenceLow} low confidence
          </span>
          <span
            data-testid="wic-ops-summary-confidence-unknown"
            data-count={summary.confidenceUnknown}
            className={`${CHIP_BASE} ${WIC_CONFIDENCE_TONE.unknown}`}
          >
            {summary.confidenceUnknown} unknown confidence
          </span>
          <span
            data-testid="wic-ops-summary-linked-draft"
            data-count={summary.withLinkedDraftClaims}
            className={`${CHIP_BASE} ${TONE.info}`}
          >
            {summary.withLinkedDraftClaims} draft links
          </span>
          <span
            data-testid="wic-ops-summary-next-blockers"
            data-count={summary.withNextStepBlockers}
            className={`${CHIP_BASE} ${TONE.warn}`}
          >
            {summary.withNextStepBlockers} preview gaps
          </span>
        </div>
      </div>

      <div
        data-testid="wic-ops-controls"
        data-scope={scopeFilter}
        data-group-mode={groupMode}
        data-sort-mode={sortMode}
        data-signal-filter={signalFilter}
        className="mb-2 space-y-1 rounded-md border border-white/[0.06] bg-black/10 p-1.5"
      >
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-0.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            scope
          </span>
          {([
            ["all", "All"],
            ["attention", "Attention"],
            ["ready", "Ready"],
            ["linked", "Linked refs"],
          ] as const).map(([scope, label]) => (
            <FilterButton
              key={scope}
              testId={`wic-ops-scope-${scope}`}
              active={scopeFilter === scope}
              onClick={() => setScopeFilter(scope)}
            >
              {label}
            </FilterButton>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-0.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            signals
          </span>
          {([
            ["all", "All"],
            ["any", "Any linked"],
            ["runner", "Runner-linked"],
            ["patch", "Patch-linked"],
            ["memory", "Memory-linked"],
          ] as const).map(([filter, label]) => (
            <FilterButton
              key={filter}
              testId={`wic-filter-signal-${filter}`}
              active={signalFilter === filter}
              onClick={() => setSignalFilter(filter)}
            >
              {label}
            </FilterButton>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-0.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            group
          </span>
          {([
            ["lane", "Lane"],
            ["readiness", "Readiness"],
            ["risk", "Risk"],
          ] as const).map(([group, label]) => (
            <FilterButton
              key={group}
              testId={`wic-ops-groupby-${group}`}
              active={groupMode === group}
              onClick={() => setGroupMode(group)}
            >
              {label}
            </FilterButton>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-0.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            sort
          </span>
          {([
            ["priority", "Priority"],
            ["title", "Title"],
            ["createdAt", "Newest"],
          ] as const).map(([sort, label]) => (
            <FilterButton
              key={sort}
              testId={`wic-ops-sort-${sort}`}
              active={sortMode === sort}
              onClick={() => setSortMode(sort)}
            >
              {label}
            </FilterButton>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={EMPTY_STATE} data-testid="work-item-candidates-empty" data-empty="true">
          <p className="text-[12px] font-medium text-muted-foreground/80">작업 후보 신호 없음</p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground/55">
            patch·runner·evidence·memory·source 신호가 관측되면 후보로 표시 · 표시 전용 · 확정 작업 아님
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="space-y-1 rounded-md border border-white/[0.06] bg-black/10 p-1.5">
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                lane
              </span>
              <FilterButton
                testId="wic-filter-lane-all"
                active={laneFilter === "all"}
                onClick={() => setLaneFilter("all")}
              >
                All
              </FilterButton>
              {WORK_ITEM_LANES.map((lane) => (
                <FilterButton
                  key={lane}
                  testId={`wic-filter-lane-${lane}`}
                  active={laneFilter === lane}
                  onClick={() => setLaneFilter(lane)}
                >
                  {lane}
                </FilterButton>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                risk
              </span>
              <FilterButton
                testId="wic-filter-risk-all"
                active={riskFilter === "all"}
                onClick={() => setRiskFilter("all")}
              >
                All
              </FilterButton>
              {WIC_RISKS.map((risk) => (
                <FilterButton
                  key={risk}
                  testId={`wic-filter-risk-${risk}`}
                  active={riskFilter === risk}
                  onClick={() => setRiskFilter(risk)}
                >
                  {risk}
                </FilterButton>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                kind
              </span>
              <FilterButton
                testId="wic-filter-kind-all"
                active={kindFilter === "all"}
                onClick={() => setKindFilter("all")}
              >
                All
              </FilterButton>
              {WIC_KINDS.map((kind) => (
                <FilterButton
                  key={kind}
                  testId={`wic-filter-kind-${kind}`}
                  active={kindFilter === kind}
                  onClick={() => setKindFilter(kind)}
                >
                  {kind}
                </FilterButton>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                refs
              </span>
              <FilterButton
                testId="wic-filter-sourceRefs-all"
                active={sourceRefFilter === "all"}
                onClick={() => setSourceRefFilter("all")}
              >
                Any source refs
              </FilterButton>
              <FilterButton
                testId="wic-filter-sourceRefs"
                active={sourceRefFilter === "present"}
                onClick={() => setSourceRefFilter("present")}
              >
                Has source refs
              </FilterButton>
              <FilterButton
                testId="wic-filter-evidenceRefs-all"
                active={evidenceRefFilter === "all"}
                onClick={() => setEvidenceRefFilter("all")}
              >
                Any evidence refs
              </FilterButton>
              <FilterButton
                testId="wic-filter-evidenceRefs"
                active={evidenceRefFilter === "present"}
                onClick={() => setEvidenceRefFilter("present")}
              >
                Has evidence refs
              </FilterButton>
            </div>
            <input
              type="text"
              value={candidateQuery}
              onChange={(e) => setCandidateQuery(e.target.value)}
              aria-label="WorkItem Candidate search"
              data-testid="wic-search"
              placeholder="Search candidates by title, reason, id, or ref"
              className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[12px] text-zinc-200 placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none"
            />
          </div>
          {visibleOperationRows.length === 0 ? (
            <div
              className={EMPTY_STATE}
              data-testid="work-item-candidates-filter-empty"
              data-empty="true"
            >
              <p className="text-[12px] font-medium text-muted-foreground/80">
                matching candidate 없음
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground/55">
                로컬 보기 조건에 맞는 후보가 없습니다
              </p>
            </div>
          ) : null}
          {renderDynamicGroups()}
          {attentionOperationRows.length > 0 ? (
            <div
              data-testid="wic-ops-group-blocked-needs-evidence"
              className="rounded-md border border-amber-300/15 bg-amber-300/[0.025] p-1.5"
            >
              <div className="mb-0.5 flex items-center gap-1">
                <span className={`rounded px-1 text-[12px] uppercase tracking-wide ${TONE.warn}`}>
                  blocked / needs evidence
                </span>
                <span className="text-[12px] text-muted-foreground/45">
                  {attentionOperationRows.length} candidates
                </span>
              </div>
              <ul className="space-y-0.5">
                {attentionOperationRows.map((operationRow) => {
                  const r = operationRow.candidate;
                  return (
                    <li
                      key={`attention-${r.id}`}
                      data-testid={`wic-ops-attention-row-${r.id}`}
                      data-readiness={operationRow.readiness.readiness}
                      className="flex items-center gap-1.5 rounded bg-white/[0.02] px-1 py-0.5 text-[12px] text-zinc-300"
                    >
                      <span className="min-w-0 flex-1 truncate" title={r.reason}>
                        {r.title}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1 text-[12px] uppercase tracking-wide ${WIC_READINESS_TONE[operationRow.readiness.readiness]}`}
                      >
                        {operationRow.readiness.readiness}
                      </span>
                      <span className="shrink-0 text-[12px] text-muted-foreground/55">
                        {operationRow.hasEvidenceRefs ? `${r.evidenceRefs.length}ev` : "no evidence refs"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Batch 22 LINE F — simulated-outcome tone for sandbox proposals. */
const SANDBOX_OUTCOME_TONE: Record<SandboxOutcome, string> = {
  "simulated-pass": TONE.good,
  "simulated-warning": TONE.warn,
  "simulated-blocked": TONE.bad,
};

/**
 * Batch 22 LINE F — Sandbox Proposal Shell: a read-only "proposal only" surface for
 * the SANDBOX seat. Scenario proposal cards with a dry-run badge, simulated-outcome
 * label, and proposed steps — plus a persistent "proposal only · no execution"
 * watermark. ZERO execution / dispatch / write / runner call. Display-only.
 */
function SandboxProposalDeck({
  proposals = EXAMPLE_SANDBOX_PROPOSALS,
}: {
  proposals?: ReadonlyArray<SandboxProposal>;
}) {
  return (
    <div className="px-4 pb-1" data-testid="sandbox-proposal-deck" data-count={proposals.length}>
      <div
        data-testid="sandbox-watermark"
        className="mb-2 rounded-md border border-l-[3px] border-primary/30 border-l-violet-400/80 bg-primary/10 px-3 py-1.5 text-[12px] text-primary"
      >
        <span className="mr-1 rounded bg-primary/20 px-1 py-0.5 text-[12px] font-bold uppercase tracking-wider">
          Sandbox
        </span>
        <span className="font-semibold">PROPOSAL ONLY</span> · 시뮬레이션 미리보기입니다 · 실행/적용/전송
        없음 · 모든 결과는 가상(simulated)입니다
      </div>
      <ul className="space-y-1.5">
        {proposals.map((p) => (
          <li
            key={p.id}
            data-testid={`sandbox-proposal-${p.id}`}
            data-outcome={p.outcome}
            className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-medium text-zinc-300">{p.title}</span>
              <span
                data-testid={`sandbox-dryrun-${p.id}`}
                className="rounded bg-white/[0.06] px-1 text-[12px] uppercase tracking-wide text-muted-foreground/70"
              >
                dry-run
              </span>
              <span
                data-testid={`sandbox-outcome-${p.id}`}
                data-outcome={p.outcome}
                className={`rounded px-1 text-[12px] uppercase tracking-wide ${SANDBOX_OUTCOME_TONE[p.outcome]}`}
              >
                {p.outcome}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-muted-foreground/70">{p.scenario}</p>
            {p.steps.length > 0 ? (
              <ol className="mt-1 space-y-0.5">
                {p.steps.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-1.5 text-[12px] text-zinc-400"
                  >
                    <span className="shrink-0 tabular-nums text-muted-foreground/45">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{s}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            <p className="mt-1 text-[12px] text-muted-foreground/45">{p.note}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Batch 21 LINE E — REPLAY timeline V2. Read-only, operation-theater feel:
 * time-clustered events, a local scrubber to step clusters, per-cluster category
 * breakdown. View-only — no EventStorage mutation, no server write, no action.
 */
function ReplayTimeline({ items }: { items: ReadonlyArray<ReplayTimelineItem> }) {
  const clusters = buildReplayTimeline(items);
  const [active, setActive] = useState(0);
  if (clusters.length === 0) {
    return (
      <div
        data-testid="replay-timeline-empty"
        className="rounded-md border border-dashed border-white/10 bg-white/[0.012] px-2.5 py-2 text-[12px] text-muted-foreground/70"
      >
        타임라인에 표시할 이벤트 없음 · 읽기 전용
      </div>
    );
  }
  const idx = Math.min(active, clusters.length - 1);
  return (
    <div data-testid="replay-timeline" data-clusters={clusters.length}>
      {clusters.length > 1 ? (
        <div className="mb-1.5 flex items-center gap-2">
          <span
            data-testid="replay-scrubber-pos"
            className="shrink-0 text-[12px] uppercase tracking-wider text-muted-foreground/60 tabular-nums"
          >
            cluster {idx + 1}/{clusters.length}
          </span>
          <input
            type="range"
            data-testid="replay-scrubber"
            data-action-scope="local-view"
            aria-label="replay timeline scrubber"
            min={0}
            max={clusters.length - 1}
            value={idx}
            onChange={(e) => setActive(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer accent-primary"
          />
        </div>
      ) : null}
      <ol className="space-y-1">
        {clusters.map((c, i) => (
          <li
            key={c.id}
            data-testid={`replay-cluster-${i}`}
            data-active={i === idx ? "true" : "false"}
            data-count={c.count}
            className={`rounded border px-2 py-1 ${
              i === idx
                ? "border-primary/40 bg-primary/[0.06]"
                : "border-white/[0.06] bg-white/[0.02]"
            }`}
          >
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="tabular-nums text-muted-foreground/60">
                {c.startAt} – {c.endAt}
              </span>
              <span className="ml-auto rounded bg-white/[0.06] px-1 text-[12px] tabular-nums text-muted-foreground">
                {c.count} events
              </span>
              {Object.entries(c.categories).map(([cat, n]) => (
                <span
                  key={cat}
                  data-category={cat}
                  className="rounded bg-white/[0.06] px-1 text-[12px] uppercase text-muted-foreground/70"
                >
                  {cat} {n}
                </span>
              ))}
            </div>
            {i === idx ? (
              <ul className="mt-1 space-y-0.5" data-testid={`replay-cluster-items-${i}`}>
                {c.items.map((it) => (
                  <li key={it.id} className="flex items-center gap-2 text-[12px] text-zinc-400">
                    <span className="min-w-0 flex-1 truncate">{it.title}</span>
                    <span
                      data-category={it.category}
                      className="shrink-0 rounded bg-white/[0.06] px-1 text-[12px] uppercase text-muted-foreground"
                    >
                      {it.category}
                    </span>
                    <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground/55">
                      {it.createdAt}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ReplayDeck({
  events,
  query = "",
}: {
  events: ReadonlyArray<TimedEventInput>;
  query?: string;
}) {
  // LINE C — local UI filter only. Never mutates the events, never calls a server.
  const [filter, setFilter] = useState<"all" | EventCategory>("all");
  // Batch 21 — local-view list/timeline toggle (default list keeps existing replay UX).
  const [view, setView] = useState<"list" | "timeline">("list");
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
      <div className="mb-1.5 flex items-center gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-primary/80">
          REPLAY · 과거 eventLog (read-only)
        </p>
        <div className="ml-auto flex gap-1" data-testid="replay-view-toggle">
          {(["list", "timeline"] as const).map((v) => (
            <button
              key={v}
              type="button"
              data-testid={`replay-view-${v}`}
              data-action-scope="local-view"
              data-active={view === v}
              onClick={() => setView(v)}
              className={`rounded border px-1.5 py-0.5 text-[12px] uppercase tracking-wide transition-colors ${
                view === v
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-zinc-200"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
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
                "inline-flex cursor-pointer items-center rounded border px-1.5 py-0.5 text-[12px] uppercase tracking-wide transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
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
      {view === "timeline" ? (
        <ReplayTimeline items={matched.slice(0, 50)} />
      ) : recent.length === 0 ? (
        <div
          className="rounded-md border border-dashed border-white/10 bg-white/[0.012] px-2.5 py-2"
          data-testid="replay-deck-empty"
        >
          <p className="text-[12px] text-muted-foreground/70">재생할 이벤트 없음</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground/50">
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
              <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-300">{w.title}</span>
              <span
                className="shrink-0 rounded bg-white/[0.06] px-1 text-[12px] uppercase tracking-wide text-muted-foreground"
                data-testid={`replay-deck-category-${i}`}
                data-category={w.category}
              >
                {w.category}
              </span>
              <span
                className="shrink-0 text-[12px] text-muted-foreground/45"
                data-testid={`replay-deck-source-${i}`}
              >
                {w.source}
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground/60">
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
      "inline-flex cursor-pointer items-center rounded border px-1.5 py-0.5 text-[12px] uppercase tracking-wide transition-colors",
      active
        ? "border-primary/40 bg-primary/10 text-primary"
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

/**
 * Batch 12 LINE C — user Saved View manager. save / apply / delete are LOCAL UI
 * PREFERENCE actions (localStorage only), clearly labeled local — never an OS
 * action (no send/approve/write-memory/append-event/run/dispatch). Buttons here
 * are allowed under the "no side-effect action control" rule.
 */
function SavedViewManager({
  views,
  onSave,
  onApply,
  onDelete,
}: {
  views: ReadonlyArray<UserSavedView>;
  onSave: (name: string) => void;
  onApply: (v: UserSavedView) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const trySave = () => {
    const n = name.trim();
    if (n) {
      onSave(n);
      setName("");
    }
  };
  return (
    <div className="px-4 pb-2" data-testid="saved-view-manager">
      <div className="mb-1 flex items-center gap-1.5">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") trySave();
          }}
          placeholder="현재 뷰 저장 (이름)"
          aria-label="현재 뷰를 로컬에 저장"
          data-testid="saved-view-name"
          className="min-w-0 flex-1 rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[12px] text-zinc-200 placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none"
        />
        <button
          type="button"
          data-testid="saved-view-save"
          data-action-scope="local-preference"
          onClick={trySave}
          className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[12px] text-primary hover:bg-primary/20"
        >
          뷰 저장
        </button>
        <span className="shrink-0 text-[12px] uppercase tracking-wide text-muted-foreground/50">
          로컬 전용 · local
        </span>
      </div>
      {views.length > 0 ? (
        <div role="list" data-testid="saved-view-list" className="flex flex-wrap gap-1">
          {views.map((v) => (
            <span
              key={v.id}
              role="listitem"
              data-testid={`saved-view-${v.id}`}
              className="inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/[0.03] pl-1.5 text-[12px] text-zinc-300"
            >
              <button
                type="button"
                data-testid={`saved-view-apply-${v.id}`}
                data-action-scope="local-preference"
                onClick={() => onApply(v)}
                className="py-0.5 hover:text-primary"
              >
                {v.name}
              </button>
              <button
                type="button"
                data-testid={`saved-view-delete-${v.id}`}
                data-action-scope="local-preference"
                onClick={() => onDelete(v.id)}
                aria-label={`${v.name} 삭제 (로컬)`}
                className="px-1 py-0.5 text-muted-foreground/60 hover:text-rose-300"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p data-testid="saved-view-empty" className="text-[12px] text-muted-foreground/50">
          저장된 뷰 없음 · 현재 필터 조합을 이름 붙여 로컬에 저장
        </p>
      )}
    </div>
  );
}

/**
 * Batch 14 LINE D/E — read-only Plugin Sources surface: per-plugin source health,
 * the plugin-provided WorkItemLite rows, and approved/published plugin evidence
 * candidates. Display only — no buttons, no reconnect/sync, no execution. Generic.
 */
const PLUGIN_HEALTH_LABEL: Record<PluginSourceHealth, string> = {
  connected: "connected",
  disabled: "disabled",
  stale: "stale",
  error: "error",
  unknown: "unknown",
};

/**
 * Batch 15 LINE A — per-health visual tone for the Source Dock health badge.
 * Display-only colour; the `data-health` attribute (read by tests) is unchanged.
 */
const HEALTH_TONE: Record<PluginSourceHealth, string> = {
  connected: TONE.good,
  stale: TONE.warn,
  error: TONE.bad,
  disabled: "border border-white/10 bg-white/[0.04] text-muted-foreground/60",
  unknown: "border border-slate-400/20 bg-slate-400/10 text-slate-300/80",
};

/** Health buckets, in display order, for the at-a-glance strip. */
const HEALTH_ORDER: ReadonlyArray<PluginSourceHealth> = [
  "connected",
  "stale",
  "error",
  "disabled",
  "unknown",
];

type SourceHealthSummary = Record<PluginSourceHealth, number> & {
  totalRows: number;
  evidenceCount: number;
};

/**
 * Batch 15 LINE B — pure health summary for the Source Dock. Counts each health
 * bucket, the active-only projected row total (so disabled sources contribute 0
 * rows, matching the dock body), and the evidence-candidate count. No Date.now /
 * I/O / side effect.
 */
function summarizeSourceHealth(
  sources: ReadonlyArray<WorkItemLiteProviderResult>,
  evidence: ReadonlyArray<PluginEvidenceCandidate>,
): SourceHealthSummary {
  const bucket = (h: PluginSourceHealth) => sources.filter((s) => s.health === h).length;
  return {
    connected: bucket("connected"),
    stale: bucket("stale"),
    error: bucket("error"),
    disabled: bucket("disabled"),
    unknown: bucket("unknown"),
    totalRows: projectPluginWorkItems(sources).length,
    evidenceCount: evidence.length,
  };
}

/** Batch 15 LINE B — compact health-count summary strip (display-only). */
function SourceHealthStrip({ summary }: { summary: SourceHealthSummary }) {
  return (
    <div
      data-testid="source-health-strip"
      className="mb-2 flex flex-wrap items-center gap-1 text-[12px] uppercase tracking-wider"
    >
      {HEALTH_ORDER.map((h) => (
        <span
          key={h}
          data-testid={`source-health-count-${h}`}
          data-health={h}
          data-count={summary[h]}
          className={`rounded px-1 tabular-nums ${HEALTH_TONE[h]}`}
        >
          {h} {summary[h]}
        </span>
      ))}
      <span className="mx-0.5 text-muted-foreground/30">·</span>
      <span
        data-testid="source-health-total-rows"
        data-count={summary.totalRows}
        className="rounded border border-white/10 bg-white/[0.03] px-1 tabular-nums text-muted-foreground"
      >
        rows {summary.totalRows}
      </span>
      <span
        data-testid="source-health-evidence-count"
        data-count={summary.evidenceCount}
        className="rounded border border-amber-400/20 bg-amber-400/[0.06] px-1 tabular-nums text-amber-200/70"
      >
        evidence {summary.evidenceCount}
      </span>
    </div>
  );
}

/**
 * Batch 14 LINE D/E → Batch 15 LINE A/B — the Source Dock (External Source Deck):
 * a read-only surface for generic external sources. Per-source health (toned
 * badge), an at-a-glance health-count strip, the projected WorkItemLite rows, and
 * approved plugin-evidence candidates. Display-only — no buttons, no sync/run/write.
 * Returns null when there is nothing to show (honest empty in LIVE).
 */
/** Make a non-button element behave like one (Enter/Space activate). Batch 16:
 *  tagged local-detail — opening a read-only drawer is a view action, no side effect. */
function rowActivation(run: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    "data-action-scope": "local-detail",
    onClick: run,
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        run();
      }
    },
  };
}

/** Batch 16 LINE C — local view state for the Source Dock quick controls. */
export type SourceDockView = { alerts: boolean; show: "all" | "sources" | "evidence" };
const DEFAULT_DOCK_VIEW: SourceDockView = { alerts: false, show: "all" };

function PluginSourcesCard({
  sources = [],
  evidence = [],
  cardRef,
  onSelect,
  view = DEFAULT_DOCK_VIEW,
}: {
  sources?: ReadonlyArray<WorkItemLiteProviderResult>;
  evidence?: ReadonlyArray<PluginEvidenceCandidate>;
  cardRef?: RefObject<HTMLDivElement | null>;
  onSelect?: (item: SourceDetailItem) => void;
  view?: SourceDockView;
}) {
  if (sources.length === 0 && evidence.length === 0) return null;
  // Health summary always reflects the FULL set (overview); the quick-control
  // filters only narrow what is LISTED below — pure presentation, no mutation.
  const summary = summarizeSourceHealth(sources, evidence);
  const shownSources = view.alerts
    ? sources.filter((s) => s.health === "stale" || s.health === "error")
    : sources;
  const showSourceList = view.show !== "evidence";
  const showEvidenceList = view.show !== "sources" && evidence.length > 0;
  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      className="mx-4 mb-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      data-testid="plugin-sources"
    >
      <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
        Source Dock · External Source Deck · read-only
      </p>
      <SourceHealthStrip summary={summary} />
      {showSourceList ? (
      <div className="space-y-1.5">
        {shownSources.map((s) => {
          const rows = projectPluginWorkItems([s]);
          return (
            <div
              key={s.pluginId}
              data-testid={`plugin-source-${s.pluginId}`}
              data-status={s.status}
              data-health={s.health}
              className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-medium text-zinc-300">{s.pluginId}</span>
                <span
                  className={`rounded px-1 text-[12px] uppercase tracking-wide ${HEALTH_TONE[s.health]}`}
                  data-testid={`plugin-health-${s.pluginId}`}
                  data-health={s.health}
                >
                  {PLUGIN_HEALTH_LABEL[s.health]}
                </span>
                <span
                  className="rounded bg-white/[0.05] px-1 text-[12px] tabular-nums text-muted-foreground/60"
                  data-testid={`plugin-source-rowcount-${s.pluginId}`}
                  data-count={rows.length}
                >
                  {rows.length} rows
                </span>
                {s.generatedAt ? (
                  <span className="ml-auto text-[12px] tabular-nums text-muted-foreground/55">
                    updated {s.generatedAt}
                  </span>
                ) : null}
              </div>
              {rows.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {rows.map((r, i) => (
                    <li
                      key={r.id}
                      data-testid={`plugin-row-${s.pluginId}-${i}`}
                      className={`flex items-center gap-1.5 text-[12px] text-zinc-400 ${
                        onSelect ? "cursor-pointer rounded hover:bg-white/[0.04]" : ""
                      }`}
                      {...(onSelect
                        ? rowActivation(() =>
                            onSelect({
                              kind: "source",
                              pluginId: r.pluginId,
                              sourceRef: r.sourceRef,
                              title: r.title,
                              category: r.category,
                              status: r.status,
                              observed: r.observed,
                              health: s.health,
                              generatedAt: s.generatedAt,
                            }),
                          )
                        : {})}
                    >
                      <span className="shrink-0 rounded bg-white/[0.06] px-1 text-[12px] uppercase text-muted-foreground/70">
                        plugin
                      </span>
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      <span
                        className="shrink-0 rounded bg-white/[0.06] px-1 text-[12px] uppercase text-muted-foreground"
                        data-category={r.category}
                      >
                        {r.category}
                      </span>
                      <span className="shrink-0 text-[12px] text-muted-foreground/55">
                        obs:{r.observed ? "true" : "false"}
                      </span>
                      <span className="shrink-0 text-[12px] text-muted-foreground/45">{r.sourceRef}</span>
                    </li>
                  ))}
                </ul>
              ) : s.status !== "active" ? (
                <p
                  className="mt-1 text-[12px] text-muted-foreground/50"
                  data-testid={`plugin-source-inactive-${s.pluginId}`}
                >
                  비활성 소스 · 행 없음
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      ) : null}
      {showEvidenceList ? (
        <div className="mt-2" data-testid="plugin-evidence">
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            Source Evidence
          </p>
          <ul className="space-y-0.5">
            {evidence.map((e, i) => (
              <li
                key={e.id}
                data-testid={`plugin-evidence-${i}`}
                className={`flex items-center gap-1.5 text-[12px] text-zinc-400 ${
                  onSelect ? "cursor-pointer rounded hover:bg-white/[0.04]" : ""
                }`}
                {...(onSelect
                  ? rowActivation(() =>
                      onSelect({
                        kind: "evidence",
                        pluginId: e.pluginId,
                        sourceRef: e.sourceRef,
                        title: e.title,
                        status: e.status,
                        observed: e.observed,
                        trust: e.trust,
                      }),
                    )
                  : {})}
              >
                <span className="shrink-0 rounded bg-amber-400/10 px-1 text-[12px] uppercase text-amber-200/70">
                  evidence
                </span>
                <span className="min-w-0 flex-1 truncate">{e.title}</span>
                <span className="shrink-0 text-[12px] text-muted-foreground/60" data-trust={e.trust}>
                  trust:{e.trust}
                </span>
                <span className="shrink-0 text-[12px] text-muted-foreground/45">{e.pluginId}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Batch 15 LINE C — PREVIEW-only demo deck: a radio-group scenario switch (NOT
 * buttons) that flips the Source Dock between generic external-source health
 * states. Rendered only in the PREVIEW seat; never affects the LIVE data plane.
 */
function SourceDemoDeck({
  scenario,
  onChange,
}: {
  scenario: SourceScenarioKey;
  onChange: (key: SourceScenarioKey) => void;
}) {
  return (
    <div data-testid="source-demo-deck" className="mx-4 mb-1.5 flex flex-wrap items-center gap-1">
      <span className="mr-0.5 text-[12px] font-semibold uppercase tracking-wider text-amber-200/70">
        demo deck · PREVIEW
      </span>
      {SOURCE_SCENARIO_KEYS.map((k) => {
        const active = k === scenario;
        return (
          <label
            key={k}
            data-testid={`source-demo-option-${k}`}
            data-active={active}
            className={`cursor-pointer rounded border px-1.5 py-0.5 text-[12px] uppercase tracking-wide ${
              active
                ? "border-amber-400/40 bg-amber-400/10 text-amber-100"
                : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-zinc-300"
            }`}
          >
            <input
              type="radio"
              name="source-demo-scenario"
              className="sr-only"
              checked={active}
              onChange={() => onChange(k)}
            />
            {k}
          </label>
        );
      })}
    </div>
  );
}

/** Batch 17 LINE A — per-safety visual tone for the patch candidate badge. */
const SAFETY_TONE: Record<PatchSafetyStatus, string> = {
  pass: TONE.good,
  warning: TONE.warn,
  blocked: TONE.bad,
};

/** Build the read-only detail-drawer item for a patch candidate (LINE B). */
function patchDetailItem(c: PatchCandidate): SourceDetailItem {
  return {
    kind: "patch",
    candidateId: c.candidateId,
    runnerId: c.runnerId,
    missionId: c.missionId,
    title: `${c.candidateId} · ${c.changedFileCount} files`,
    changedFileCount: c.changedFileCount,
    additions: c.additions,
    deletions: c.deletions,
    safetyStatus: c.safetyStatus,
    verificationStatus: c.verificationStatus,
    source: c.source,
    observed: c.observed,
    safetyBlockers: c.safetyBlockers,
    safetyWarnings: c.safetyWarnings,
    secretFindingCount: c.secretFindingCount,
    pathPolicyStatus: c.pathPolicyStatus,
    claimedTests: c.claimedTests,
    actualTests: c.actualTests,
    evidenceRefs: c.evidenceRefs,
    files: c.files,
  };
}

/**
 * Batch 17 LINE A — Patch Candidate Speed Lane: a fast, READ-ONLY review surface
 * for runner patch/diff handoff candidates. Each row shows id / runner / mission /
 * changed-file count / additions·deletions / safety / verification / source /
 * observed, and is clickable ONLY to open the read-only detail drawer (LINE B).
 * There is NO apply / commit / dispatch control anywhere — a candidate is a
 * preview, never an action. Blocked candidates stay inspectable. Returns null when
 * empty (honest empty in LIVE).
 */
/** Batch 17 LINE D — local view filter over the patch lane (display-only). */
export type PatchLaneFilter = "all" | "blocked" | "warning" | "runner";

/** Batch 17 LINE E — read-only comparison strip (pure summarize, no model/runner). */
/** Batch 18 LINE C — patch lane health/summary strip (display-only, shown ≥1). */
function PatchSummaryStrip({ candidates }: { candidates: ReadonlyArray<PatchCandidate> }) {
  const s = summarizePatchCandidates(candidates);
  const chip = (testid: string, label: string, count: number, tone: string) => (
    <span
      data-testid={testid}
      data-count={count}
      className={`rounded px-1 tabular-nums ${tone}`}
    >
      {label} {count}
    </span>
  );
  return (
    <div
      data-testid="patch-summary-strip"
      className="mb-2 flex flex-wrap items-center gap-1 text-[12px] uppercase tracking-wider"
    >
      {chip("patch-sum-total", "total", s.count, TONE.neutral)}
      {chip("patch-sum-pass", "pass", s.pass, TONE.good)}
      {chip("patch-sum-warning", "warn", s.warning, TONE.warn)}
      {chip("patch-sum-blocked", "blocked", s.blocked, TONE.bad)}
      <span className="mx-0.5 text-muted-foreground/30">·</span>
      {chip("patch-sum-observed", "obs", s.observed, TONE.neutral)}
      {chip("patch-sum-not-observed", "not-obs", s.notObserved, "border border-white/10 bg-white/[0.03] text-muted-foreground/70")}
      {chip("patch-sum-no-actual", "no-actual", s.verificationNotRun, "border border-white/10 bg-white/[0.03] text-muted-foreground/70")}
      {chip("patch-sum-claimed", "claimed", s.claimedTestsPresent, "border border-white/10 bg-white/[0.03] text-muted-foreground")}
    </div>
  );
}

function PatchComparisonStrip({ candidates }: { candidates: ReadonlyArray<PatchCandidate> }) {
  const s = summarizePatchCandidates(candidates);
  return (
    <div
      data-testid="patch-comparison-strip"
      className="mb-2 flex flex-wrap items-center gap-1 text-[12px] uppercase tracking-wider"
    >
      <span
        data-testid="patch-cmp-count"
        data-count={s.count}
        className="rounded border border-white/10 bg-white/[0.03] px-1 tabular-nums text-muted-foreground"
      >
        candidates {s.count}
      </span>
      {s.safest ? (
        <span
          data-testid="patch-cmp-safest"
          data-safest={s.safest}
          className="rounded border border-emerald-400/30 bg-emerald-400/10 px-1 text-emerald-200"
        >
          safest {s.safest}
        </span>
      ) : null}
      <span
        data-testid="patch-cmp-blocked"
        data-count={s.blocked}
        className="rounded border border-rose-400/30 bg-rose-400/10 px-1 tabular-nums text-rose-200"
      >
        blocked {s.blocked}
      </span>
      <span
        data-testid="patch-cmp-warning"
        data-count={s.warning}
        className="rounded border border-amber-400/30 bg-amber-400/10 px-1 tabular-nums text-amber-200"
      >
        warning {s.warning}
      </span>
      {typeof s.overlapCount === "number" ? (
        <span
          data-testid="patch-cmp-overlap"
          data-count={s.overlapCount}
          className="rounded border border-white/10 bg-white/[0.03] px-1 tabular-nums text-muted-foreground"
        >
          overlap {s.overlapCount}
        </span>
      ) : null}
    </div>
  );
}

/** Batch 17 LINE D — patch lane quick filters (local-view buttons, view-only). */
function PatchLaneControls({
  filter,
  onChange,
}: {
  filter: PatchLaneFilter;
  onChange: (f: PatchLaneFilter) => void;
}) {
  const base = "rounded border px-1.5 py-0.5 text-[12px] tracking-wide transition-colors";
  const tone = (active: boolean) =>
    active
      ? "border-primary/40 bg-primary/10 text-primary"
      : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-zinc-200";
  const opts: ReadonlyArray<{ key: PatchLaneFilter; label: string; title: string }> = [
    { key: "all", label: "All", title: "모든 후보" },
    { key: "blocked", label: "Blocked", title: "막힌 후보만" },
    { key: "warning", label: "Warning", title: "경고 후보만" },
    { key: "runner", label: "Runner", title: "러너 출력 후보만" },
  ];
  return (
    <div data-testid="patch-lane-controls" className="mb-1.5 flex flex-wrap items-center gap-1">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          data-testid={`patch-ctl-${o.key}`}
          data-action-scope="local-view"
          data-active={filter === o.key}
          title={o.title}
          onClick={() => onChange(o.key)}
          className={`${base} ${tone(filter === o.key)}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Batch 20 LINE D — lane tone for the compare board. */
const LANE_TONE: Record<PatchLaneKey, string> = {
  safe: "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-200",
  watch: "border-amber-400/30 bg-amber-400/[0.06] text-amber-200",
  risk: "border-rose-400/30 bg-rose-400/[0.06] text-rose-200",
};

/**
 * Batch 20 LINE D — read-only compare board: safe/watch/risk lanes (sorted by
 * churn = fastest to review first), a file-overlap heatmap, verification-delta
 * (claimed vs actual) flags, and safety-reason chips. Display-only, zero controls.
 */
function PatchCompareBoardView({ candidates }: { candidates: ReadonlyArray<PatchCandidate> }) {
  const board = buildPatchCompareBoard(candidates);
  const deltaOf = (id: string) => board.deltas.find((d) => d.candidateId === id);
  return (
    <div
      data-testid="patch-compare-board"
      className="mb-2 rounded-md border border-white/[0.06] bg-white/[0.015] p-2"
    >
      <p className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-primary/60">
        compare · read-only
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {(["safe", "watch", "risk"] as PatchLaneKey[]).map((lane) => (
          <div
            key={lane}
            data-testid={`patch-lane-${lane}`}
            data-count={board.lanes[lane].length}
            className={`rounded border px-1 py-1 ${LANE_TONE[lane]}`}
          >
            <p className="mb-0.5 text-[12px] uppercase tracking-wide">
              {lane} {board.lanes[lane].length}
            </p>
            <ul className="space-y-0.5">
              {board.lanes[lane].map((c) => {
                const d = deltaOf(c.candidateId);
                return (
                  <li
                    key={c.id}
                    data-testid={`patch-lane-${lane}-${c.candidateId}`}
                    className="flex flex-wrap items-center gap-1 text-[12px] text-zinc-300"
                  >
                    <span className="font-medium">{c.candidateId}</span>
                    <span className="tabular-nums text-muted-foreground/60">
                      +{c.additions}/-{c.deletions}
                    </span>
                    {d?.mismatch ? (
                      <span
                        data-testid={`patch-delta-mismatch-${c.candidateId}`}
                        className="rounded bg-amber-400/15 px-1 text-amber-200/80"
                        title="claimed clean · actual unconfirmed"
                      >
                        <AlertTriangle className="inline h-3 w-3 align-text-bottom" /> verify
                      </span>
                    ) : null}
                    {c.safetyBlockers.slice(0, 2).map((b, i) => (
                      <span key={`b${i}`} className="rounded bg-rose-400/10 px-1 text-rose-200/70">
                        {b}
                      </span>
                    ))}
                    {c.safetyWarnings.slice(0, 1).map((w, i) => (
                      <span key={`w${i}`} className="rounded bg-amber-400/10 px-1 text-amber-200/70">
                        {w}
                      </span>
                    ))}
                  </li>
                );
              })}
              {board.lanes[lane].length === 0 ? (
                <li className="text-[12px] text-muted-foreground/60">없음</li>
              ) : null}
            </ul>
          </div>
        ))}
      </div>
      {board.heatmap.length > 0 ? (
        <div data-testid="patch-heatmap" className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-[12px] uppercase tracking-wider text-muted-foreground/50">files</span>
          {board.heatmap.map((h) => (
            <span
              key={h.path}
              data-testid={`patch-heat-${h.path}`}
              data-count={h.count}
              data-overlap={h.count >= 2}
              className={`rounded px-1 text-[12px] tabular-nums ${
                h.count >= 2
                  ? "border border-primary/40 bg-primary/10 text-primary"
                  : "border border-white/10 bg-white/[0.03] text-muted-foreground/70"
              }`}
            >
              {h.path} ×{h.count}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PatchCandidatesCard({
  candidates = [],
  cardRef,
  onSelect,
  filter = "all",
  onFilter,
  candidateLinks,
}: {
  candidates?: ReadonlyArray<PatchCandidate>;
  cardRef?: RefObject<HTMLDivElement | null>;
  onSelect?: (item: SourceDetailItem) => void;
  filter?: PatchLaneFilter;
  onFilter?: (f: PatchLaneFilter) => void;
  candidateLinks?: WorkItemCandidatePatchSignalLinks;
}) {
  // Batch 20 — local-view compare board toggle (display-only).
  const [compareOpen, setCompareOpen] = useState(false);
  if (candidates.length === 0) return null;
  // Filters narrow the LISTED candidates only; the comparison strip reflects the
  // FULL set (overview) — pure presentation, no data mutation.
  const shown = candidates.filter((c) =>
    filter === "all"
      ? true
      : filter === "runner"
        ? c.source === "runner"
        : c.safetyStatus === filter,
  );
  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      data-testid="patch-candidate-lane"
      className="mx-4 mb-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
    >
      <p
        className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground"
        data-testid="patch-lane-caption"
      >
        {INBOX_VOCAB.patchLaneCaption}
      </p>
      <PatchSummaryStrip candidates={candidates} />
      {candidates.length > 1 ? <PatchComparisonStrip candidates={candidates} /> : null}
      {onFilter ? <PatchLaneControls filter={filter} onChange={onFilter} /> : null}
      {candidates.length > 1 ? (
        <button
          type="button"
          data-testid="patch-compare-toggle"
          data-action-scope="local-view"
          data-active={compareOpen}
          title="후보 비교 보드 · 보기 전용"
          onClick={() => setCompareOpen((v) => !v)}
          className={`mb-1.5 rounded border px-1.5 py-0.5 text-[12px] tracking-wide transition-colors ${
            compareOpen
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-zinc-200"
          }`}
        >
          Compare{" "}
          {compareOpen ? (
            <ChevronDown className="inline h-3 w-3 align-text-bottom" />
          ) : (
            <ChevronRight className="inline h-3 w-3 align-text-bottom" />
          )}
        </button>
      ) : null}
      {compareOpen && candidates.length > 1 ? <PatchCompareBoardView candidates={candidates} /> : null}
      <ul className="space-y-1">
        {shown.map((c) => {
          const linkedCandidateCount =
            candidateLinks?.byPatchCandidateId[c.candidateId]?.candidateIds.length ?? 0;
          return (
            <li
              key={c.id}
              data-testid={`patch-candidate-${c.candidateId}`}
              data-safety={c.safetyStatus}
              data-blocked={c.safetyStatus === "blocked"}
              className={`rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 ${
                onSelect ? "cursor-pointer hover:bg-white/[0.04]" : ""
              }`}
              {...(onSelect ? rowActivation(() => onSelect(patchDetailItem(c))) : {})}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-medium text-zinc-300">{c.candidateId}</span>
                <span
                  className={`rounded px-1 text-[12px] uppercase tracking-wide ${SAFETY_TONE[c.safetyStatus]}`}
                  data-testid={`patch-safety-${c.candidateId}`}
                  data-safety={c.safetyStatus}
                >
                  {c.safetyStatus}
                </span>
                <span
                  className="rounded bg-white/[0.06] px-1 text-[12px] uppercase text-muted-foreground"
                  data-testid={`patch-verify-${c.candidateId}`}
                  data-verification={c.verificationStatus}
                >
                  {c.verificationStatus}
                </span>
                <span
                  className="rounded bg-white/[0.05] px-1 text-[12px] uppercase text-muted-foreground/70"
                  data-source={c.source}
                >
                  {c.source}
                </span>
                {linkedCandidateCount > 0 ? (
                  <span
                    data-testid={`patch-candidate-workitem-count-${c.candidateId}`}
                    data-count={linkedCandidateCount}
                    className={`${CHIP_BASE} ${TONE.info}`}
                  >
                    {linkedCandidateCount} candidate
                  </span>
                ) : null}
                <span className="ml-auto text-[12px] tabular-nums text-muted-foreground/55">
                  obs:{c.observed ? "true" : "false"}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-zinc-400">
                <span className="min-w-0 truncate text-muted-foreground/60">
                  {c.runnerId} · {c.missionId}
                </span>
                <span
                  className="ml-auto shrink-0 tabular-nums"
                  data-testid={`patch-files-${c.candidateId}`}
                  data-count={c.changedFileCount}
                >
                  {c.changedFileCount} files
                </span>
                <span className="shrink-0 tabular-nums text-emerald-300/70">+{c.additions}</span>
                <span className="shrink-0 tabular-nums text-rose-300/70">-{c.deletions}</span>
              </div>
            </li>
          );
        })}
      </ul>
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
  command,
  pluginSources,
  pluginEvidence,
  sourceScenario,
  onSourceScenarioChange,
  patchCandidates,
  runnerTheater,
  learningMemory,
  evidenceDraft,
  workItemCandidates,
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
  // Batch 15 LINE D — scroll/focus target for the "Source Dock 열기" palette jump.
  const sourceDockRef = useRef<HTMLDivElement>(null);
  // Batch 17 LINE D — scroll/focus target for the "Patch Candidates 열기" jump.
  const patchCandidatesRef = useRef<HTMLDivElement>(null);
  // Engine E7 — scroll/focus target for the WorkItem Candidate board jump.
  const workItemCandidatesRef = useRef<HTMLDivElement>(null);
  // Engine E15 — scroll/focus target for the read-only candidate operator review.
  const workItemCandidateReviewRef = useRef<HTMLDivElement>(null);
  // Batch 25 LINE J — scroll/focus targets for the Operator Console + Evidence Draft jumps.
  const operatorConsoleRef = useRef<HTMLDivElement>(null);
  const evidenceDraftRef = useRef<HTMLDivElement>(null);
  // Batch 15 LINE E — locally-selected Source Dock row for the read-only drawer.
  const [selectedDetail, setSelectedDetail] = useState<SourceDetailItem | null>(null);
  const closeDetail = useCallback(() => setSelectedDetail(null), []);
  // Engine E6 — locally-selected WorkItem Candidate row for the read-only drawer.
  const [selectedWorkItemCandidate, setSelectedWorkItemCandidate] = useState<WorkItemCandidate | null>(null);
  const closeWorkItemCandidateDetail = useCallback(() => setSelectedWorkItemCandidate(null), []);
  // INB-B (U8 dialog층 동시 개방 1개) — opening one detail drawer closes the other.
  const selectWorkItemCandidate = useCallback((candidate: WorkItemCandidate) => {
    setSelectedDetail(null);
    setSelectedWorkItemCandidate(candidate);
  }, []);
  const selectSourceDetail = useCallback((detail: SourceDetailItem) => {
    setSelectedWorkItemCandidate(null);
    setSelectedDetail(detail);
  }, []);
  // Batch 16 LINE C — local Source Dock view filter (display-only).
  const [dockView, setDockView] = useState<SourceDockView>(DEFAULT_DOCK_VIEW);
  // Batch 17 LINE D — local patch lane filter (display-only).
  const [patchFilter, setPatchFilter] = useState<PatchLaneFilter>("all");
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
  // Batch 16 LINE B — shared local-view callbacks for the Command Deck (also used
  // by the Batch 15 palette jump effect). View/focus only — no data action.
  const jumpToSourceDock = useCallback(() => {
    sourceDockRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    sourceDockRef.current?.focus();
  }, []);
  // Batch 17 LINE D — view/focus only jump to the Patch Candidate lane.
  const jumpToPatchCandidates = useCallback(() => {
    patchCandidatesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    patchCandidatesRef.current?.focus();
  }, []);
  // Engine E7 — view/focus only jump to the read-only candidate board.
  const jumpToWorkItemCandidates = useCallback(() => {
    workItemCandidatesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    workItemCandidatesRef.current?.focus();
  }, []);
  const jumpToWorkItemCandidateReview = useCallback(() => {
    workItemCandidateReviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    workItemCandidateReviewRef.current?.focus();
  }, []);
  // Batch 25 LINE J — view/focus only jumps to the Operator Console + Evidence Draft.
  const jumpToOperatorConsole = useCallback(() => {
    operatorConsoleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    operatorConsoleRef.current?.focus();
  }, []);
  const jumpToEvidenceDraft = useCallback(() => {
    evidenceDraftRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    evidenceDraftRef.current?.focus();
  }, []);
  const clearFilters = useCallback(() => {
    setQuery("");
    setCategory("all");
    setFocus("all");
  }, []);
  // Batch 12 LINE B/C — user-defined saved views (local UI preference only).
  const [userViews, setUserViews] = useState<UserSavedView[]>(() =>
    persistFilters ? readUserViews() : [],
  );
  const onSaveView = (rawName: string) => {
    const name = sanitizeSavedViewName(rawName);
    const next = upsertUserView(userViews, {
      id: slugifyViewName(name),
      name,
      mode,
      focus,
      category,
      search: query,
      schemaVersion: 1,
    });
    setUserViews(next);
    writeUserViews(next);
  };
  const onApplyView = (v: UserSavedView) => {
    onModeChange?.(v.mode);
    setFocus(v.focus);
    setCategory(v.category);
    setQuery(v.search);
  };
  const onDeleteView = (id: string) => {
    const next = removeUserView(userViews, id);
    setUserViews(next);
    writeUserViews(next);
  };
  const visibleLanes =
    focus === "today"
      ? workLanes.filter((l) => l.id === "today" || l.id === "recent")
      : focus === "blocked"
        ? workLanes.filter((l) => l.id === "blocked")
        : workLanes;
  const showCards = focus === "all" || focus === "warnings";
  const onInboxKeyDown = (e: React.KeyboardEvent) => {
    const el = document.activeElement as HTMLElement | null;
    const typing =
      !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    if (e.key === "/" && el !== searchRef.current) {
      e.preventDefault();
      searchRef.current?.focus();
      return;
    }
    if (e.key === "Escape" && query) {
      setQuery("");
      return;
    }
    // Batch 19 — single-key local-view accelerators (view/focus ONLY, no side
    // effect). Suppressed while typing or with a modifier held.
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "s") {
      e.preventDefault();
      jumpToSourceDock();
    } else if (e.key === "p") {
      e.preventDefault();
      jumpToPatchCandidates();
    } else if (e.key === "w") {
      e.preventDefault();
      jumpToWorkItemCandidates();
    } else if (e.key === "b") {
      e.preventDefault();
      onFocusPick("blocked");
    } else if (e.key === "c") {
      e.preventDefault();
      clearFilters();
    } else if (e.key === "o") {
      e.preventDefault();
      jumpToOperatorConsole();
    } else if (e.key === "e") {
      e.preventDefault();
      jumpToEvidenceDraft();
    }
  };
  // Batch 11 LINE B — persist the active view as a local UI preference only.
  useEffect(() => {
    if (persistFilters) writeJsonState(INBOX_FILTERS_KEY, { focus, category, query });
  }, [persistFilters, focus, category, query]);
  // Batch 11 LINE C — apply a one-shot view command from the palette (view-only;
  // mode commands are handled by the container which owns the seat).
  useEffect(() => {
    if (!command) return;
    if (command.kind === "focus" && command.value) setFocus(command.value as InboxFocus);
    else if (command.kind === "category" && command.value)
      setCategory(command.value as "all" | EventCategory);
    else if (command.kind === "clear") {
      setQuery("");
      setCategory("all");
      setFocus("all");
    } else if (command.kind === "applyView" && command.view) {
      // mode is applied by the container; the inbox applies the filter combo.
      setFocus(command.view.focus);
      setCategory(command.view.category);
      setQuery(command.view.search);
    }
  }, [command]);
  // Batch 15 LINE D — "Source Dock 열기" jump: scroll + focus the dock. View/focus
  // ONLY — no mode change, no filter change, no data action. When the dock is
  // empty (LIVE with no input) the ref is null and this is an honest no-op.
  useEffect(() => {
    if (command?.kind !== "focusSection") return;
    if (command.value === "source-dock") jumpToSourceDock();
    else if (command.value === "patch-candidates") jumpToPatchCandidates();
    else if (command.value === "work-item-candidates") jumpToWorkItemCandidates();
    else if (command.value?.startsWith("work-item-candidate-signals")) jumpToWorkItemCandidates();
    else if (command.value?.startsWith("work-item-candidate-review")) jumpToWorkItemCandidateReview();
    else if (command.value === "operator-console") jumpToOperatorConsole();
    else if (command.value === "evidence-draft") jumpToEvidenceDraft();
  }, [
    command,
    jumpToSourceDock,
    jumpToPatchCandidates,
    jumpToWorkItemCandidates,
    jumpToWorkItemCandidateReview,
    jumpToOperatorConsole,
    jumpToEvidenceDraft,
  ]);
  // Batch 16 LINE A — Operator Console derivations (all from props already on
  // screen; zero server call, zero write). Active view label, a terse filter
  // summary, source-health counts, and the read-only replay item count.
  const activeView = activeViewPreset(focus, category, query);
  const activeViewLabel = activeView?.label ?? "custom";
  const filterParts: string[] = [];
  if (query.trim()) filterParts.push(`q:${query.trim()}`);
  if (category !== "all") filterParts.push(`cat:${category}`);
  if (focus !== "all") filterParts.push(`focus:${focus}`);
  const filterSummary = filterParts.length > 0 ? filterParts.join(" · ") : "none";
  const consoleSrcSummary = summarizeSourceHealth(pluginSources ?? [], pluginEvidence ?? []);
  const hasSources = (pluginSources?.length ?? 0) > 0;
  const hasDock = hasSources || (pluginEvidence?.length ?? 0) > 0;
  const replayCount = recentEvents?.length;
  const workItemEvidenceLinks = linkWorkItemCandidatesToEvidenceDraft(
    workItemCandidates ?? [],
    evidenceDraft,
  );
  const workItemRunnerSignalLinks = linkCandidatesToRunnerSignals(
    workItemCandidates ?? [],
    runnerTheater ?? [],
  );
  const workItemPatchSignalLinks = linkCandidatesToPatchSignals(
    workItemCandidates ?? [],
    patchCandidates ?? [],
  );
  const workItemLearningMemorySignalLinks = linkCandidatesToLearningMemorySignals(
    workItemCandidates ?? [],
    learningMemory,
  );
  // INB-B (§6 UX-4 / R1 대안 A) — prev/next over the FULL candidate list so ↑/↓ can
  // review consecutive candidates (incl. any beyond the lane "더보기" cap) without
  // the open/close round-trip. undefined when nothing is selected (no nav chrome).
  const candidateNavList = workItemCandidates ?? [];
  const selectedCandidateIndex = selectedWorkItemCandidate
    ? candidateNavList.findIndex((c) => c.id === selectedWorkItemCandidate.id)
    : -1;
  const candidateNav =
    selectedCandidateIndex >= 0
      ? {
          position: `${selectedCandidateIndex + 1} / ${candidateNavList.length}`,
          hasPrev: selectedCandidateIndex > 0,
          hasNext: selectedCandidateIndex < candidateNavList.length - 1,
          onPrev: () => {
            const prev = candidateNavList[selectedCandidateIndex - 1];
            if (prev) setSelectedWorkItemCandidate(prev);
          },
          onNext: () => {
            const next = candidateNavList[selectedCandidateIndex + 1];
            if (next) setSelectedWorkItemCandidate(next);
          },
        }
      : undefined;
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
          <Inbox className="h-4 w-4 text-primary/80" />
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
          <span className="text-[12px] text-muted-foreground" data-testid="assistant-inbox-readonly-note">
            {INBOX_VOCAB.readOnlyNote}
          </span>
          {hasExample ? (
            <span
              className="text-[12px] text-amber-300/80"
              data-testid="assistant-inbox-example-notice"
            >
              일부 섹션은 예시(fixture) · live 아님
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
        activeViewLabel={activeViewLabel}
        filterSummary={filterSummary}
        srcHealth={
          hasSources
            ? {
                connected: consoleSrcSummary.connected,
                stale: consoleSrcSummary.stale,
                error: consoleSrcSummary.error,
              }
            : undefined
        }
        replayCount={replayCount}
        patchCount={patchCandidates?.length}
        cardRef={operatorConsoleRef}
      />
      <CommandDeck
        activeViewId={activeView?.id}
        onPreset={onPreset}
        onSourceDock={jumpToSourceDock}
        onPatchCandidates={jumpToPatchCandidates}
        onWorkItemCandidates={jumpToWorkItemCandidates}
        onCandidateReview={jumpToWorkItemCandidateReview}
        onClear={clearFilters}
      />
      {/* Batch 19 — local-view keyboard accelerators (discoverability + at-a-glance). */}
      <div
        data-testid="inbox-shortcuts-hint"
        className="flex flex-wrap items-center gap-2 px-4 pb-2 text-[12px] uppercase tracking-wider text-muted-foreground/45"
      >
        <span>
          <kbd className="text-primary/60">s</kbd> 소스독
        </span>
        <span>
          <kbd className="text-primary/60">p</kbd> 패치
        </span>
        <span>
          <kbd className="text-primary/60">w</kbd> 후보
        </span>
        <span>
          <kbd className="text-primary/60">b</kbd> 막힌
        </span>
        <span>
          <kbd className="text-primary/60">c</kbd> 초기화
        </span>
        <span>
          <kbd className="text-primary/60">o</kbd> 콘솔
        </span>
        <span>
          <kbd className="text-primary/60">e</kbd> Evidence
        </span>
        <span>
          <kbd className="text-primary/60">/</kbd> 검색
        </span>
      </div>
      <div className="px-4 pb-2">
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="검색 · 큐 / REPLAY 행 필터 ( / 포커스 · Esc 지움 · read-only )"
          aria-label="Assistant Inbox 검색"
          data-testid="inbox-search"
          className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[12px] text-zinc-200 placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none"
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
      {mode !== "replay" && persistFilters ? (
        <SavedViewManager
          views={userViews}
          onSave={onSaveView}
          onApply={onApplyView}
          onDelete={onDeleteView}
        />
      ) : null}
      {mode === "replay" ? (
        <ReplayDeck events={recentEvents ?? []} query={query} />
      ) : mode === "sandbox" ? (
        <SandboxProposalDeck />
      ) : (
        <>
          {mode === "preview" ? <PreviewBanner /> : null}
          {mode === "preview" ? <PreviewScenarioLegend /> : null}
          {liveSparse ? <LiveEmptyHero /> : null}
          {focus !== "warnings" ? (
            <WorkLaneRail lanes={visibleLanes} query={query} category={category} />
          ) : null}
          {workItemCandidates ? (
            <WorkItemCandidatesCard
              rows={workItemCandidates}
              onSelect={selectWorkItemCandidate}
              cardRef={workItemCandidatesRef}
              reviewRef={workItemCandidateReviewRef}
              reviewCommand={command}
              workItemLinks={workItemEvidenceLinks}
              runnerSignalLinks={workItemRunnerSignalLinks}
              patchSignalLinks={workItemPatchSignalLinks}
              learningMemorySignalLinks={workItemLearningMemorySignalLinks}
            />
          ) : null}
          {runnerTheater ? (
            <RunnerTheaterCard rows={runnerTheater} candidateLinks={workItemRunnerSignalLinks} />
          ) : null}
          {learningMemory ? (
            <LearningMemoryConsoleCard
              console={learningMemory}
              candidateLinks={workItemLearningMemorySignalLinks}
            />
          ) : null}
          {mode === "preview" && onSourceScenarioChange ? (
            <SourceDemoDeck scenario={sourceScenario ?? "mixed"} onChange={onSourceScenarioChange} />
          ) : null}
          {mode === "preview" ? <SourcePackCard /> : null}
          {evidenceDraft ? (
            <EvidenceDraftCard
              draft={evidenceDraft}
              cardRef={evidenceDraftRef}
              workItemLinks={workItemEvidenceLinks}
            />
          ) : null}
          {hasDock ? (
            <SourceDockQuickControls view={dockView} onChange={setDockView} onJump={jumpToSourceDock} />
          ) : null}
          <PluginSourcesCard
            sources={pluginSources}
            evidence={pluginEvidence}
            cardRef={sourceDockRef}
            onSelect={selectSourceDetail}
            view={dockView}
          />
          <PatchCandidatesCard
            candidates={patchCandidates}
            cardRef={patchCandidatesRef}
            onSelect={selectSourceDetail}
            filter={patchFilter}
            onFilter={setPatchFilter}
            candidateLinks={workItemPatchSignalLinks}
          />
          <SourceDetailDrawer item={selectedDetail} onClose={closeDetail} />
          <WorkItemCandidateDetailDrawer
            item={selectedWorkItemCandidate}
            onClose={closeWorkItemCandidateDetail}
            nav={candidateNav}
            draftLink={
              selectedWorkItemCandidate
                ? workItemEvidenceLinks.byCandidateId[selectedWorkItemCandidate.id]
                : undefined
            }
            runnerLink={
              selectedWorkItemCandidate
                ? workItemRunnerSignalLinks.byCandidateId[selectedWorkItemCandidate.id]
                : undefined
            }
            patchLink={
              selectedWorkItemCandidate
                ? workItemPatchSignalLinks.byCandidateId[selectedWorkItemCandidate.id]
                : undefined
            }
            learningMemoryLink={
              selectedWorkItemCandidate
                ? workItemLearningMemorySignalLinks.byCandidateId[selectedWorkItemCandidate.id]
                : undefined
            }
          />
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
          emptyDetail="learning loop 이벤트가 들어오면 가설 · 검증 · 증류 단계로 표시"
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
