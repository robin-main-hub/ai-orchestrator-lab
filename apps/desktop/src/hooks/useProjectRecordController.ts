import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createProjectRecord,
  findProjectRecord,
  readProjectRecordIndex,
  removeProjectRecord,
  sortProjectRecordsByUpdatedAt,
  updateProjectEditTimeline,
  updateProjectPreview,
  updateProjectPublishStatus,
  updateProjectScaffold,
  updateProjectVisualQa,
  upsertProjectRecord,
  writeProjectRecordIndex,
  type ProjectEditTimelineSummary,
  type ProjectPreviewTruth,
  type ProjectPublishStatus,
  type ProjectRecord,
  type ProjectRecordIndex,
  type ProjectScaffoldStatus,
  type ProjectVisualQaSummary,
} from "../lib/projectRecord";
import type { JsonStorageLike } from "../lib/persistentJsonState";

/**
 * H10 Project Persistence / Resume — React controller (slice 2).
 *
 * Thin React wrapper around the pure `projectRecord.ts` helpers from
 * slice 1. Owns the in-memory ProjectRecordIndex, hydrates from storage
 * on mount, persists on every change.
 *
 * Honesty + safety constraints (handoff 2026-06-15) are enforced in the
 * underlying helpers; this hook only orchestrates state + persistence.
 * In particular:
 *   - `recordPreview` never persists a URL when truth is not "observed".
 *   - No automatic provider call, preview rerun, QA rerun, or overlay
 *     apply happens here — this is a passive snapshot store.
 *   - No server route is touched; storage is the local JsonStorageLike
 *     (defaults to window.localStorage when running in the browser).
 *
 * Usage pattern (wiring will land in a follow-up slice):
 *   const controller = useProjectRecordController();
 *   controller.ensureRecord({ missionId, title, goal });
 *   controller.recordPreview(missionId, { url, truth, observedAt });
 *   controller.recordVisualQa(missionId, summary);
 *   ...
 */

export type UseProjectRecordControllerInput = {
  /** Time source (testable). Defaults to () => new Date().toISOString(). */
  now?: () => string;
  /**
   * Injectable storage (testable). When omitted, falls back to
   * `window.localStorage` via the underlying helper.
   */
  storage?: JsonStorageLike;
};

export type ProjectRecordController = {
  /** Records sorted by updatedAt descending. */
  records: ReadonlyArray<ProjectRecord>;
  /** Lookup by missionId. */
  find: (missionId: string) => ProjectRecord | undefined;
  /**
   * Ensure a record exists for a mission. Creates one with honest
   * defaults (scaffold "unknown", empty editTimeline) if missing.
   * Returns the resulting record (existing or freshly created).
   */
  ensureRecord: (input: { missionId: string; title: string; goal?: string }) => ProjectRecord;
  /** Apply a preview observation. URL only persisted when truth === "observed". */
  recordPreview: (
    missionId: string,
    input: { url?: string; truth: ProjectPreviewTruth; observedAt: string },
  ) => void;
  /** Apply a Visual QA snapshot (use unknownVisualQaSummary() for honest defaults). */
  recordVisualQa: (missionId: string, summary: ProjectVisualQaSummary) => void;
  /** Apply a scaffold availability change. */
  recordScaffold: (missionId: string, scaffold: ProjectScaffoldStatus) => void;
  /** Apply an edit timeline summary update. */
  recordEditTimeline: (missionId: string, summary: ProjectEditTimelineSummary) => void;
  /** Apply or clear (pass undefined) publish status. */
  recordPublishStatus: (missionId: string, publish: ProjectPublishStatus | undefined) => void;
  /** Remove a record by missionId (e.g. user-initiated delete). No-op if missing. */
  remove: (missionId: string) => void;
};

export function useProjectRecordController(
  input: UseProjectRecordControllerInput = {},
): ProjectRecordController {
  const now = input.now ?? (() => new Date().toISOString());
  const storage = input.storage;

  const [index, setIndex] = useState<ProjectRecordIndex>(() => readProjectRecordIndex(now(), storage));

  // Persist on every change. The storage helper is no-throw on quota /
  // private-mode errors so an operator UI never breaks because of it.
  useEffect(() => {
    writeProjectRecordIndex(index, storage);
  }, [index, storage]);

  const find = useCallback(
    (missionId: string) => findProjectRecord(index, missionId),
    [index],
  );

  const ensureRecord = useCallback<ProjectRecordController["ensureRecord"]>(
    ({ missionId, title, goal }) => {
      const existing = findProjectRecord(index, missionId);
      if (existing) return existing;
      const ts = now();
      const fresh = createProjectRecord({ missionId, title, goal, now: ts });
      setIndex((prev) => upsertProjectRecord(prev, fresh, ts));
      return fresh;
    },
    [index, now],
  );

  const apply = useCallback(
    (missionId: string, mutator: (record: ProjectRecord, ts: string) => ProjectRecord) => {
      setIndex((prev) => {
        const existing = findProjectRecord(prev, missionId);
        if (!existing) return prev;
        const ts = now();
        return upsertProjectRecord(prev, mutator(existing, ts), ts);
      });
    },
    [now],
  );

  const recordPreview = useCallback<ProjectRecordController["recordPreview"]>(
    (missionId, { url, truth, observedAt }) => {
      apply(missionId, (record, ts) =>
        updateProjectPreview(record, { url, truth, observedAt, now: ts }),
      );
    },
    [apply],
  );

  const recordVisualQa = useCallback<ProjectRecordController["recordVisualQa"]>(
    (missionId, summary) => {
      apply(missionId, (record, ts) => updateProjectVisualQa(record, summary, ts));
    },
    [apply],
  );

  const recordScaffold = useCallback<ProjectRecordController["recordScaffold"]>(
    (missionId, scaffold) => {
      apply(missionId, (record, ts) => updateProjectScaffold(record, scaffold, ts));
    },
    [apply],
  );

  const recordEditTimeline = useCallback<ProjectRecordController["recordEditTimeline"]>(
    (missionId, summary) => {
      apply(missionId, (record, ts) => updateProjectEditTimeline(record, summary, ts));
    },
    [apply],
  );

  const recordPublishStatus = useCallback<ProjectRecordController["recordPublishStatus"]>(
    (missionId, publish) => {
      apply(missionId, (record, ts) => updateProjectPublishStatus(record, publish, ts));
    },
    [apply],
  );

  const remove = useCallback<ProjectRecordController["remove"]>(
    (missionId) => {
      setIndex((prev) => removeProjectRecord(prev, missionId, now()));
    },
    [now],
  );

  const records = useMemo(
    () => sortProjectRecordsByUpdatedAt(index.records),
    [index.records],
  );

  return {
    records,
    find,
    ensureRecord,
    recordPreview,
    recordVisualQa,
    recordScaffold,
    recordEditTimeline,
    recordPublishStatus,
    remove,
  };
}
