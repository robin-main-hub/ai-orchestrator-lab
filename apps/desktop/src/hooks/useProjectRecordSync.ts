import { useEffect, useRef } from "react";
import type { ProjectRecordController } from "./useProjectRecordController";
import type {
  ProjectEditTimelineSummary,
  ProjectPreviewTruth,
  ProjectPublishStatus,
  ProjectScaffoldStatus,
  ProjectVisualQaSummary,
} from "../lib/projectRecord";
import type { EditTimelineItem } from "../lib/editTimeline";

/**
 * H10 Project Persistence / Resume — adapter hook (slice 4).
 *
 * Bridges existing Mission Workspace state into the ProjectRecord
 * controller without forcing callers to know the individual
 * `controller.record*` method names. A caller (e.g. `MissionBoardPanel`
 * or `App`) passes the observable inputs it already has, and this hook
 * forwards each non-undefined change to the controller.
 *
 * Safety + honesty contract (handoff 2026-06-15):
 *   - The adapter never triggers a provider call, preview rerun, QA
 *     rerun, or overlay apply. It only writes to the ProjectRecord
 *     store when an input changes (passive snapshot).
 *   - `observedPreview.url` is forwarded as-is — the underlying
 *     `controller.recordPreview` enforces that the URL is only
 *     persisted when `truth === "observed"`.
 *   - Callers must pass `undefined` instead of fabricating defaults.
 *     Use the controller's helpers if they need explicit "unknown".
 *
 * Usage (typical wiring, lands in a follow-up slice):
 *
 * ```ts
 * const controller = useProjectRecordController();
 * useProjectRecordSync({
 *   controller,
 *   missionId,
 *   title,
 *   goal,
 *   observedPreview: { url: previewUrl, truth: previewTruth, observedAt },
 *   visualQa: visualQaSummary,
 *   scaffold: scaffoldStatus,
 *   editTimelineItems: editTimelineItems,
 *   publish: publishStatus,
 * });
 * ```
 */

export type ProjectRecordSyncInput = {
  controller: ProjectRecordController;
  /** Required — the canonical key for the resumable project. */
  missionId: string;
  /** Required for first-time creation; ignored on subsequent updates. */
  title: string;
  /** Optional free-form goal text. */
  goal?: string;
  /**
   * Latest preview observation. Pass `undefined` if there has not been
   * any observation yet. The adapter only emits a `recordPreview` call
   * when this object reference (or any nested field) changes.
   */
  observedPreview?: {
    url?: string;
    truth: ProjectPreviewTruth;
    observedAt: string;
  };
  /** Latest Visual QA summary. Pass `undefined` if QA never ran. */
  visualQa?: ProjectVisualQaSummary;
  /** Latest scaffold availability. */
  scaffold?: ProjectScaffoldStatus;
  /**
   * Either a pre-summarized edit timeline (use when the caller already
   * derives the summary) or the raw `EditTimelineItem[]` (the adapter
   * derives the summary itself).
   */
  editTimeline?: ProjectEditTimelineSummary;
  editTimelineItems?: ReadonlyArray<EditTimelineItem>;
  /** Latest publish/PR draft status. Pass `undefined` to leave unchanged. */
  publish?: ProjectPublishStatus;
};

/**
 * Derive a `ProjectEditTimelineSummary` from raw `EditTimelineItem[]`.
 * Exported for direct use by callers that prefer to pass the items
 * unchanged.
 *
 * Rules:
 *   - `totalEvents` = items.length
 *   - `lastEventAt` / `lastSource` / `lastStatus` taken from the last
 *     item (assumes caller-provided list is already ordered;
 *     `editTimeline` items are inserted chronologically by H9).
 *   - `hasRestorablePatch` is true if any item has `restoreText` and
 *     status `"applied"` — matches the H9 EditTimelineCard restore rule.
 */
export function deriveEditTimelineSummary(
  items: ReadonlyArray<EditTimelineItem>,
): ProjectEditTimelineSummary {
  if (items.length === 0) {
    return { totalEvents: 0, hasRestorablePatch: false };
  }
  const last = items[items.length - 1]!;
  const hasRestorablePatch = items.some(
    (item) => item.status === "applied" && typeof item.restoreText === "string" && item.restoreText.length > 0,
  );
  return {
    totalEvents: items.length,
    lastEventAt: last.timestamp,
    lastSource: last.source,
    lastStatus: last.status,
    hasRestorablePatch,
  };
}

export function useProjectRecordSync(input: ProjectRecordSyncInput): void {
  const {
    controller,
    missionId,
    title,
    goal,
    observedPreview,
    visualQa,
    scaffold,
    editTimeline,
    editTimelineItems,
    publish,
  } = input;

  // Ensure the record exists on mount (and whenever missionId changes).
  const ensuredKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (ensuredKeyRef.current === missionId) return;
    ensuredKeyRef.current = missionId;
    controller.ensureRecord({ missionId, title, goal });
  }, [controller, missionId, title, goal]);

  // Forward preview observation changes.
  const previewKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!observedPreview) return;
    const key = `${observedPreview.truth}|${observedPreview.observedAt}|${observedPreview.url ?? ""}`;
    if (previewKeyRef.current === key) return;
    previewKeyRef.current = key;
    controller.recordPreview(missionId, {
      url: observedPreview.url,
      truth: observedPreview.truth,
      observedAt: observedPreview.observedAt,
    });
  }, [controller, missionId, observedPreview]);

  // Forward Visual QA snapshot changes.
  const visualQaKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!visualQa) return;
    const key = `${visualQa.status}|${visualQa.checkedAt ?? ""}|${visualQa.summary ?? ""}`;
    if (visualQaKeyRef.current === key) return;
    visualQaKeyRef.current = key;
    controller.recordVisualQa(missionId, visualQa);
  }, [controller, missionId, visualQa]);

  // Forward scaffold availability changes.
  const scaffoldRef = useRef<ProjectScaffoldStatus | undefined>(undefined);
  useEffect(() => {
    if (!scaffold) return;
    if (scaffoldRef.current === scaffold) return;
    scaffoldRef.current = scaffold;
    controller.recordScaffold(missionId, scaffold);
  }, [controller, missionId, scaffold]);

  // Forward edit timeline summary changes — derives from raw items if needed.
  const editTimelineKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const summary = editTimeline ?? (editTimelineItems ? deriveEditTimelineSummary(editTimelineItems) : undefined);
    if (!summary) return;
    const key = `${summary.totalEvents}|${summary.lastEventAt ?? ""}|${summary.lastSource ?? ""}|${summary.lastStatus ?? ""}|${summary.hasRestorablePatch ? 1 : 0}`;
    if (editTimelineKeyRef.current === key) return;
    editTimelineKeyRef.current = key;
    controller.recordEditTimeline(missionId, summary);
  }, [controller, missionId, editTimeline, editTimelineItems]);

  // Forward publish/PR draft changes (only when the caller explicitly opts in
  // by passing a non-undefined value; passing undefined intentionally does
  // NOT clear an existing record — use controller.recordPublishStatus(missionId, undefined) for that).
  const publishKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!publish) return;
    const key = `${publish.hasDraft ? 1 : 0}|${publish.prNumber ?? ""}|${publish.prUrl ?? ""}|${publish.lastUpdatedAt ?? ""}`;
    if (publishKeyRef.current === key) return;
    publishKeyRef.current = key;
    controller.recordPublishStatus(missionId, publish);
  }, [controller, missionId, publish]);
}
