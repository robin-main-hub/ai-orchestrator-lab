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

/**
 * LINE F / H / N — Assistant Inbox / command center.
 *
 * A dense, dark, read-only command-center shell. It composes the four
 * card surfaces (evidence / learning loop / memory candidates / runtime
 * manifest preview) into labelled sections. Everything is presentational:
 * the inbox accepts arrays of items and renders them. It NEVER fires a
 * callback on mount and exposes no enable/approve affordance — it is a
 * read surface, not a control panel.
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

/** The four seats. REPLAY/SANDBOX are disabled placeholders this batch. */
export const INBOX_VIEW_MODES: ReadonlyArray<{
  value: InboxViewMode;
  label: string;
  enabled: boolean;
}> = [
  { value: "live", label: "LIVE", enabled: true },
  { value: "preview", label: "PREVIEW", enabled: true },
  { value: "replay", label: "REPLAY", enabled: false },
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
};

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
      className="space-y-1.5 rounded-lg border border-white/5 bg-white/[0.015] p-2.5"
      data-testid={`assistant-inbox-section-${id}`}
      data-count={count}
      data-source={source}
    >
      <div className="flex items-center gap-2">
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
  gateLabel,
  gateKind,
  generatedAt,
}: {
  mode: InboxViewMode;
  total: number;
  liveSections: number;
  emptySections: number;
  gateLabel: string | null;
  gateKind: string | null;
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
      data-gate={gateKind ?? "none"}
    >
      <StatChip>{mode.toUpperCase()}</StatChip>
      <StatChip>{total} items</StatChip>
      <StatChip>{liveSections}/4 live</StatChip>
      <StatChip>{emptySections}/4 empty</StatChip>
      {gateLabel ? <StatChip>gate · {gateLabel}</StatChip> : null}
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

export function AssistantInbox({
  evidence = [],
  learningLoops = [],
  memoryCandidates = [],
  manifestEntries = [],
  sources,
  mode = "live",
  onModeChange,
  generatedAt,
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
  // LIVE-sparse = LIVE with nothing live beyond the gate. Drives the polished
  // "No live data yet" hero so the first impression reads intentional.
  const liveSparse =
    mode === "live" &&
    learningLoops.length === 0 &&
    memoryCandidates.length === 0 &&
    manifestEntries.length === 0;
  return (
    <Card
      className="border-white/10 bg-black/40 py-4"
      data-testid="assistant-inbox"
      data-total={total}
      data-live-sections={liveCount}
      data-has-example={hasExample ? "true" : "false"}
      data-view-mode={mode}
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
        gateLabel={gateLabel}
        gateKind={gateKind}
        generatedAt={generatedAt}
      />
      {mode === "preview" ? <PreviewBanner /> : null}
      {liveSparse ? <LiveEmptyHero /> : null}
      <CardContent className="grid grid-cols-1 gap-3 px-4 lg:grid-cols-2">
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
    </Card>
  );
}
