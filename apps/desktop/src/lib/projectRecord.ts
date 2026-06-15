/**
 * H10 Project Persistence / Resume — pure data model + serializer.
 *
 * Captures the slim "where I left off" state for an App Builder mission so the
 * user can leave and resume the Mission Workspace without losing context.
 *
 * Persistence rules (handoff 2026-06-15):
 *   - Never fabricate observed values. `lastPreviewUrl` is only set when the
 *     truth status confirms a real observed URL. Visual QA / scaffold / publish
 *     all have explicit "unknown" / "pending" enum members instead of silent
 *     defaults.
 *   - The record is a passive snapshot — no provider calls, no overlay applies,
 *     no preview / QA rerun are triggered by resuming a project. UI consumers
 *     are responsible for the user-initiated reactivation.
 *   - This module is a pure helper. Storage is injected via the same
 *     `JsonStorageLike` shape used by `persistentJsonState` so callers can
 *     wire it to `window.localStorage`, an in-memory store, or a future
 *     server-side adapter without changing the model.
 *   - Renderers must not display `editTimeline.lastSource` / `lastStatus` as
 *     raw enum strings to users; consumers translate them.
 */

import {
  getBrowserLocalStorage,
  readJsonState,
  writeJsonState,
  type JsonStorageLike,
} from "./persistentJsonState";

/** Observed preview truth — matches MissionBoardModel.previewTruth semantics. */
export type ProjectPreviewTruth = "observed" | "stale" | "unobserved";

/** Visual QA summary status — `unknown` is the honest default before any QA run. */
export type ProjectVisualQaStatus =
  | "passed"
  | "failed"
  | "blocked"
  | "pending"
  | "unknown";

/** Scaffold availability — `unknown` is honest default; do not default to `available`. */
export type ProjectScaffoldStatus = "available" | "stale" | "missing" | "unknown";

/** Slim Visual QA result snapshot — short label only, no raw output dump. */
export type ProjectVisualQaSummary = {
  status: ProjectVisualQaStatus;
  /** ISO timestamp when the QA result was observed. Required for non-`unknown`. */
  checkedAt?: string;
  /** Short human label (e.g. "3 issues / 1 fixed"). Never raw provider response. */
  summary?: string;
};

/** Edit timeline summary — counts + last event metadata, no raw event payload. */
export type ProjectEditTimelineSummary = {
  totalEvents: number;
  /** ISO timestamp of the most recent event. */
  lastEventAt?: string;
  /** Last EditTimelineSource value (e.g. "search_replace"). Renderers translate. */
  lastSource?: string;
  /** Last EditTimelineStatus value (e.g. "applied"). Renderers translate. */
  lastStatus?: string;
  /** True if a SEARCH/REPLACE patch is still restorable into the textarea. */
  hasRestorablePatch: boolean;
};

/** Publish / PR draft snapshot — only populated when an actual draft exists. */
export type ProjectPublishStatus = {
  hasDraft: boolean;
  prNumber?: number;
  prUrl?: string;
  lastUpdatedAt?: string;
};

/** Top-level resumable project record. */
export type ProjectRecord = {
  /** Mission identifier — the canonical key for resume / lookup. */
  missionId: string;
  /** Short app title displayed in the project list. */
  title: string;
  /** Free-form goal text the user described in conversation. */
  goal?: string;
  /** Last observed preview URL — only set when truth is "observed". */
  lastPreviewUrl?: string;
  /** Truth status for the recorded preview URL. */
  lastPreviewTruth?: ProjectPreviewTruth;
  /** ISO timestamp of last preview observation (matches lastPreviewUrl). */
  lastPreviewAt?: string;
  /** Most recent Visual QA snapshot, if any QA has ever run. */
  visualQa?: ProjectVisualQaSummary;
  /** Latest scaffold availability — `unknown` until first observation. */
  scaffold: ProjectScaffoldStatus;
  /** Slim edit timeline summary for the resume surface. */
  editTimeline: ProjectEditTimelineSummary;
  /** Publish/PR draft status — only present when a draft exists. */
  publish?: ProjectPublishStatus;
  /** ISO timestamp when this record was first created. */
  createdAt: string;
  /** ISO timestamp of the most recent record update. */
  updatedAt: string;
};

/** Stored projection — list of records + index metadata. */
export type ProjectRecordIndex = {
  records: ProjectRecord[];
  /** ISO timestamp for the last index update. */
  updatedAt: string;
};

export const PROJECT_RECORDS_STORAGE_KEY = "ai-orchestrator-lab:project-records:v1";

const EMPTY_EDIT_TIMELINE_SUMMARY: ProjectEditTimelineSummary = {
  totalEvents: 0,
  hasRestorablePatch: false,
};

/** Build an empty index. Convenience for first-write paths. */
export function emptyProjectRecordIndex(now: string): ProjectRecordIndex {
  return { records: [], updatedAt: now };
}

/** Default Visual QA summary used when a record is created before any QA run. */
export function unknownVisualQaSummary(): ProjectVisualQaSummary {
  return { status: "unknown" };
}

/**
 * Validate + normalize an unknown payload into a ProjectRecordIndex.
 * Throws if the payload cannot be safely interpreted.
 *
 * Filters out individual records that fail validation so a single corrupt
 * entry does not nuke the entire index (kept as a soft-recovery policy).
 */
export function parseProjectRecordIndex(value: unknown): ProjectRecordIndex {
  if (!value || typeof value !== "object") {
    throw new Error("ProjectRecordIndex must be an object");
  }

  const raw = value as { records?: unknown; updatedAt?: unknown };
  const records: ProjectRecord[] = [];

  if (Array.isArray(raw.records)) {
    for (const entry of raw.records) {
      const parsed = tryParseProjectRecord(entry);
      if (parsed) {
        records.push(parsed);
      }
    }
  }

  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString();
  return { records, updatedAt };
}

function tryParseProjectRecord(value: unknown): ProjectRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<ProjectRecord> & Record<string, unknown>;

  if (typeof raw.missionId !== "string" || !raw.missionId) return undefined;
  if (typeof raw.title !== "string") return undefined;
  if (typeof raw.createdAt !== "string") return undefined;
  if (typeof raw.updatedAt !== "string") return undefined;

  const scaffold = isScaffoldStatus(raw.scaffold) ? raw.scaffold : "unknown";
  const editTimeline = parseEditTimelineSummary(raw.editTimeline);

  return {
    missionId: raw.missionId,
    title: raw.title,
    goal: typeof raw.goal === "string" ? raw.goal : undefined,
    lastPreviewUrl: typeof raw.lastPreviewUrl === "string" ? raw.lastPreviewUrl : undefined,
    lastPreviewTruth: isPreviewTruth(raw.lastPreviewTruth) ? raw.lastPreviewTruth : undefined,
    lastPreviewAt: typeof raw.lastPreviewAt === "string" ? raw.lastPreviewAt : undefined,
    visualQa: parseVisualQa(raw.visualQa),
    scaffold,
    editTimeline,
    publish: parsePublish(raw.publish),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function parseEditTimelineSummary(value: unknown): ProjectEditTimelineSummary {
  if (!value || typeof value !== "object") return { ...EMPTY_EDIT_TIMELINE_SUMMARY };
  const raw = value as Partial<ProjectEditTimelineSummary>;
  return {
    totalEvents: typeof raw.totalEvents === "number" && raw.totalEvents >= 0 ? raw.totalEvents : 0,
    lastEventAt: typeof raw.lastEventAt === "string" ? raw.lastEventAt : undefined,
    lastSource: typeof raw.lastSource === "string" ? raw.lastSource : undefined,
    lastStatus: typeof raw.lastStatus === "string" ? raw.lastStatus : undefined,
    hasRestorablePatch: raw.hasRestorablePatch === true,
  };
}

function parseVisualQa(value: unknown): ProjectVisualQaSummary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<ProjectVisualQaSummary>;
  if (!isVisualQaStatus(raw.status)) return undefined;
  return {
    status: raw.status,
    checkedAt: typeof raw.checkedAt === "string" ? raw.checkedAt : undefined,
    summary: typeof raw.summary === "string" ? raw.summary : undefined,
  };
}

function parsePublish(value: unknown): ProjectPublishStatus | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<ProjectPublishStatus>;
  if (typeof raw.hasDraft !== "boolean") return undefined;
  return {
    hasDraft: raw.hasDraft,
    prNumber: typeof raw.prNumber === "number" ? raw.prNumber : undefined,
    prUrl: typeof raw.prUrl === "string" ? raw.prUrl : undefined,
    lastUpdatedAt: typeof raw.lastUpdatedAt === "string" ? raw.lastUpdatedAt : undefined,
  };
}

function isScaffoldStatus(value: unknown): value is ProjectScaffoldStatus {
  return value === "available" || value === "stale" || value === "missing" || value === "unknown";
}

function isPreviewTruth(value: unknown): value is ProjectPreviewTruth {
  return value === "observed" || value === "stale" || value === "unobserved";
}

function isVisualQaStatus(value: unknown): value is ProjectVisualQaStatus {
  return (
    value === "passed" ||
    value === "failed" ||
    value === "blocked" ||
    value === "pending" ||
    value === "unknown"
  );
}

/** Upsert a record. Existing record (same missionId) is replaced. */
export function upsertProjectRecord(
  index: ProjectRecordIndex,
  record: ProjectRecord,
  now: string,
): ProjectRecordIndex {
  const others = index.records.filter((entry) => entry.missionId !== record.missionId);
  return {
    records: [...others, record],
    updatedAt: now,
  };
}

/** Remove a record by missionId. No-op if not present. */
export function removeProjectRecord(
  index: ProjectRecordIndex,
  missionId: string,
  now: string,
): ProjectRecordIndex {
  const filtered = index.records.filter((entry) => entry.missionId !== missionId);
  if (filtered.length === index.records.length) {
    return index;
  }
  return { records: filtered, updatedAt: now };
}

/** Find a record by missionId. */
export function findProjectRecord(
  index: ProjectRecordIndex,
  missionId: string,
): ProjectRecord | undefined {
  return index.records.find((entry) => entry.missionId === missionId);
}

/** Return records sorted by updatedAt descending (most recent first). */
export function sortProjectRecordsByUpdatedAt(records: ReadonlyArray<ProjectRecord>): ProjectRecord[] {
  return [...records].sort((a, b) => {
    if (a.updatedAt === b.updatedAt) return 0;
    return a.updatedAt < b.updatedAt ? 1 : -1;
  });
}

/** Create a fresh record with honest defaults. */
export function createProjectRecord(input: {
  missionId: string;
  title: string;
  goal?: string;
  now: string;
}): ProjectRecord {
  const { missionId, title, goal, now } = input;
  return {
    missionId,
    title,
    goal,
    scaffold: "unknown",
    editTimeline: { ...EMPTY_EDIT_TIMELINE_SUMMARY },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Apply a preview observation. Only records the URL when truth === "observed".
 * For "stale" or "unobserved" we clear the URL to avoid presenting a fake one.
 */
export function updateProjectPreview(
  record: ProjectRecord,
  input: { url?: string; truth: ProjectPreviewTruth; observedAt: string; now: string },
): ProjectRecord {
  const { url, truth, observedAt, now } = input;
  const nextUrl = truth === "observed" && typeof url === "string" && url ? url : undefined;
  return {
    ...record,
    lastPreviewUrl: nextUrl,
    lastPreviewTruth: truth,
    lastPreviewAt: observedAt,
    updatedAt: now,
  };
}

/** Apply a Visual QA snapshot. */
export function updateProjectVisualQa(
  record: ProjectRecord,
  summary: ProjectVisualQaSummary,
  now: string,
): ProjectRecord {
  return {
    ...record,
    visualQa: summary,
    updatedAt: now,
  };
}

/** Apply a scaffold availability change. */
export function updateProjectScaffold(
  record: ProjectRecord,
  scaffold: ProjectScaffoldStatus,
  now: string,
): ProjectRecord {
  return {
    ...record,
    scaffold,
    updatedAt: now,
  };
}

/** Apply an edit timeline summary update (from missionBoard / editTimeline). */
export function updateProjectEditTimeline(
  record: ProjectRecord,
  summary: ProjectEditTimelineSummary,
  now: string,
): ProjectRecord {
  return {
    ...record,
    editTimeline: summary,
    updatedAt: now,
  };
}

/** Apply a publish status update. Pass undefined to clear. */
export function updateProjectPublishStatus(
  record: ProjectRecord,
  publish: ProjectPublishStatus | undefined,
  now: string,
): ProjectRecord {
  return {
    ...record,
    publish,
    updatedAt: now,
  };
}

/** Read + parse the project record index from storage. Falls back to empty. */
export function readProjectRecordIndex(
  now: string,
  storage: JsonStorageLike | undefined = getBrowserLocalStorage(),
): ProjectRecordIndex {
  return readJsonState(
    PROJECT_RECORDS_STORAGE_KEY,
    emptyProjectRecordIndex(now),
    parseProjectRecordIndex,
    storage,
  );
}

/** Write the project record index to storage. */
export function writeProjectRecordIndex(
  index: ProjectRecordIndex,
  storage: JsonStorageLike | undefined = getBrowserLocalStorage(),
): void {
  writeJsonState(PROJECT_RECORDS_STORAGE_KEY, index, storage);
}
