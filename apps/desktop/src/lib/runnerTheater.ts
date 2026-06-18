/**
 * Engine loop E2 — Runner Theater (read-only projection).
 *
 * Turns REAL app-level mission/runner state (the workbenchMissionStore snapshot)
 * into honest, display-only "operating theater" rows: which runners are active,
 * which need attention, which are idle/done, how fresh each heartbeat is, the
 * latest output line, and how much it has produced (events / artifacts).
 *
 * Pure projection only — no execution, no dispatch, no runner start, no I/O, no
 * Date.now (the reference time is injected). It NEVER reads the filesystem, so it
 * only asserts what is present in memory (e.g. artifactCount from the in-memory
 * artifacts array — never by reading diffPath off disk). Generic identifiers only.
 *
 * Decoupled from the store: the ingress `RunnerSessionInput` is a structural
 * subset of WorkbenchMission, so the App can pass `workbenchMissionStore
 * .getSnapshot()` directly without this module importing the store.
 */

export type RunnerMissionStatus =
  | "running"
  | "done"
  | "blocked"
  | "failed"
  | "needs_review"
  | "killed"
  | "cleanup_ready";

/** Operator-facing lane a runner sits in (derived purely from its status). */
export type RunnerLane = "active" | "attention" | "idle" | "done";

/** Heartbeat liveness verdict — runner-scale (minutes), NOT the evidence freshness scale. */
export type HeartbeatLiveness = "live" | "idle" | "stale" | "unknown";

/** Minutes-from-now thresholds for runner heartbeat liveness. */
export const HEARTBEAT_THRESHOLDS = { liveUnderMin: 2, idleUnderMin: 30 } as const;

/** Read-only ingress — a structural subset of WorkbenchMission (no store import). */
export type RunnerSessionInput = {
  id: string;
  title: string;
  role: string;
  agent: string;
  model: string;
  status: RunnerMissionStatus;
  heartbeat?: string;
  lastOutput?: string;
  events?: ReadonlyArray<{ id: string; at: string; text: string }>;
  artifacts?: ReadonlyArray<string>;
  worktree?: { branch: string };
};

/** Projected, display-ready runner theater row. */
export type RunnerTheaterRow = {
  id: string;
  title: string;
  role: string;
  agent: string;
  model: string;
  status: RunnerMissionStatus;
  lane: RunnerLane;
  liveness: HeartbeatLiveness;
  /** Whole minutes since the heartbeat (relative to injected now); null if unknown. */
  ageMinutes: number | null;
  heartbeatAt?: string;
  lastOutput: string;
  eventCount: number;
  /** In-memory artifact count only — never asserts a file exists on disk. */
  artifactCount: number;
  branch?: string;
  note: string;
};

const STATUS_LANE: Record<RunnerMissionStatus, RunnerLane> = {
  running: "active",
  needs_review: "attention",
  blocked: "attention",
  failed: "attention",
  killed: "attention",
  cleanup_ready: "idle",
  done: "done",
};

const VALID_STATUS = new Set<RunnerMissionStatus>(Object.keys(STATUS_LANE) as RunnerMissionStatus[]);

/** Classify a heartbeat age (ms) into runner liveness. null/NaN → "unknown". */
export function classifyHeartbeat(ageMs: number | null): HeartbeatLiveness {
  if (ageMs == null || Number.isNaN(ageMs)) return "unknown";
  if (ageMs < 0) return "live"; // future-stamped → treat as freshest
  const minutes = ageMs / 60_000;
  if (minutes < HEARTBEAT_THRESHOLDS.liveUnderMin) return "live";
  if (minutes < HEARTBEAT_THRESHOLDS.idleUnderMin) return "idle";
  return "stale";
}

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Project runner sessions into read-only theater rows.
 *
 * @param sessions  real mission/runner state (structural subset of WorkbenchMission)
 * @param nowMs     injected reference time (ms) for heartbeat liveness — keeps the
 *                  projection pure/deterministic (the App passes Date.now()).
 */
export function projectRunnerTheater(
  sessions: ReadonlyArray<RunnerSessionInput> = [],
  nowMs: number,
): RunnerTheaterRow[] {
  return sessions
    .filter((s) => nonEmpty(s.id) && nonEmpty(s.title) && VALID_STATUS.has(s.status))
    .map((s) => {
      const beatMs = nonEmpty(s.heartbeat) ? Date.parse(s.heartbeat as string) : NaN;
      const ageMs = Number.isNaN(beatMs) ? null : nowMs - beatMs;
      return {
        id: s.id,
        title: s.title,
        role: s.role,
        agent: s.agent,
        model: s.model,
        status: s.status,
        lane: STATUS_LANE[s.status],
        liveness: classifyHeartbeat(ageMs),
        ageMinutes: ageMs == null ? null : Math.max(0, Math.round(ageMs / 60_000)),
        heartbeatAt: nonEmpty(s.heartbeat) ? s.heartbeat : undefined,
        lastOutput: nonEmpty(s.lastOutput) ? (s.lastOutput as string) : "",
        eventCount: Array.isArray(s.events) ? s.events.length : 0,
        artifactCount: Array.isArray(s.artifacts) ? s.artifacts.length : 0,
        branch: s.worktree?.branch,
        note: "runner theater · read-only · observed only",
      };
    });
}

export type RunnerLaneSummary = Record<RunnerLane, number> & {
  total: number;
  /** runners whose heartbeat is stale while still marked running (possible dead). */
  stalledActive: number;
};

/** Pure roll-up of theater rows by lane + a stalled-active warning count. */
export function summarizeRunnerTheater(rows: ReadonlyArray<RunnerTheaterRow>): RunnerLaneSummary {
  const summary: RunnerLaneSummary = {
    active: 0,
    attention: 0,
    idle: 0,
    done: 0,
    total: rows.length,
    stalledActive: 0,
  };
  for (const r of rows) {
    summary[r.lane] += 1;
    if (r.lane === "active" && r.liveness === "stale") summary.stalledActive += 1;
  }
  return summary;
}

/** Fixed reference time for the PREVIEW example so liveness is deterministic. */
export const EXAMPLE_RUNNER_NOW_MS = Date.parse("2026-06-18T12:00:00.000Z");

/**
 * Generic example runner sessions for the PREVIEW seat — one live/active, one
 * attention (blocked, stale heartbeat), one done. Generic names only.
 */
export const EXAMPLE_RUNNER_SESSIONS: ReadonlyArray<RunnerSessionInput> = [
  {
    id: "ms-001",
    title: "example-runner implement slice",
    role: "Implementer",
    agent: "implementer",
    model: "route: task complexity policy",
    status: "running",
    heartbeat: "2026-06-18T11:59:10.000Z", // ~50s → live
    lastOutput: "editing apps/desktop/src/example/entity-001.ts",
    events: [
      { id: "e1", at: "2026-06-18T11:40:00.000Z", text: "worktree prepared" },
      { id: "e2", at: "2026-06-18T11:58:00.000Z", text: "first diff produced" },
    ],
    artifacts: ["changes.diff"],
    worktree: { branch: "agent/example-slice-001" },
  },
  {
    id: "ms-002",
    title: "entity-001 verify gate",
    role: "QA/Verifier",
    agent: "qa-verifier",
    model: "route: task complexity policy",
    status: "blocked",
    heartbeat: "2026-06-18T11:20:00.000Z", // 40m → stale
    lastOutput: "awaiting human approval before send-keys",
    events: [{ id: "e3", at: "2026-06-18T11:18:00.000Z", text: "gate: human approval required" }],
    artifacts: [],
    worktree: { branch: "agent/entity-001-verify" },
  },
  {
    id: "ms-003",
    title: "example-runner cleanup pass",
    role: "Implementer",
    agent: "implementer",
    model: "route: task complexity policy",
    status: "done",
    heartbeat: "2026-06-18T10:30:00.000Z",
    lastOutput: "verify.log clean · ready",
    events: [{ id: "e4", at: "2026-06-18T10:29:00.000Z", text: "verification observed clean" }],
    artifacts: ["changes.diff", "verify.log"],
    worktree: { branch: "agent/example-cleanup" },
  },
];
