import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";

/**
 * Pure runtime-health projection.
 *
 * The status bar previously derived a single health dot from only two
 * subsystems (`dgxStatus`, `localModelStatus`) and only reacted to the
 * "offline" string. That masked three real states:
 *   - `degraded` / `syncing` enum values were unrecognized and silently
 *     treated as healthy ("unknown shown as healthy"),
 *   - `memorySyncStatus` failures were invisible while DGX looked fine
 *     ("one subsystem failure hides others"),
 *   - a stale snapshot was reported as confidently healthy
 *     ("stale state not visible").
 *
 * This helper classifies every subsystem honestly and rolls them up with a
 * worst-of policy so no subsystem can hide another. It is pure: no network,
 * no I/O, no mutation. `now` is injected so callers control the clock.
 */

export type RuntimeHealthLevel = "healthy" | "degraded" | "offline" | "unknown";

export type RuntimeSubsystemHealth = {
  key: string;
  label: string;
  level: RuntimeHealthLevel;
  raw?: string;
};

export type RuntimeHealthProjection = {
  level: RuntimeHealthLevel;
  reasons: string[];
  subsystems: RuntimeSubsystemHealth[];
  stale: boolean;
};

export type RuntimeHealthProjectionOptions = {
  /** Epoch millis used as "now" for staleness. Inject for purity/tests. */
  now?: number;
  /** A snapshot older than this is flagged stale (and downgrades healthy). */
  stalenessThresholdMs?: number;
};

const DEFAULT_STALENESS_THRESHOLD_MS = 5 * 60_000;

const LEVEL_SEVERITY: Record<RuntimeHealthLevel, number> = {
  healthy: 0,
  unknown: 1,
  degraded: 2,
  offline: 3,
};

/**
 * Classify a single runtime-status string. Recognizes the real RuntimeStatus
 * enum (online/degraded/offline/syncing). Anything unrecognized or missing is
 * `unknown` — never silently `healthy`.
 */
export function classifyRuntimeStatus(status?: string): RuntimeHealthLevel {
  if (!status) return "unknown";
  switch (status) {
    // sync-in-progress is an expected working state, not a fault.
    case "online":
    case "syncing":
      return "healthy";
    case "degraded":
      return "degraded";
    case "offline":
      return "offline";
    default:
      return "unknown";
  }
}

function worse(a: RuntimeHealthLevel, b: RuntimeHealthLevel): RuntimeHealthLevel {
  return LEVEL_SEVERITY[a] >= LEVEL_SEVERITY[b] ? a : b;
}

export function projectRuntimeHealth(
  snapshot?: RuntimeSnapshot,
  options: RuntimeHealthProjectionOptions = {},
): RuntimeHealthProjection {
  if (!snapshot) {
    return { level: "unknown", reasons: ["런타임 스냅샷 없음"], subsystems: [], stale: false };
  }

  const subsystems: RuntimeSubsystemHealth[] = [
    { key: "dgx", label: "DGX", raw: snapshot.dgxStatus, level: classifyRuntimeStatus(snapshot.dgxStatus) },
    { key: "local", label: "로컬", raw: snapshot.localModelStatus, level: classifyRuntimeStatus(snapshot.localModelStatus) },
    { key: "memory", label: "기억", raw: snapshot.memorySyncStatus, level: classifyRuntimeStatus(snapshot.memorySyncStatus) },
  ];

  const reasons: string[] = [];
  let level: RuntimeHealthLevel = "healthy";
  for (const subsystem of subsystems) {
    level = worse(level, subsystem.level);
    if (subsystem.level === "degraded" || subsystem.level === "offline") {
      reasons.push(`${subsystem.label} ${subsystem.level}`);
    } else if (subsystem.level === "unknown") {
      reasons.push(`${subsystem.label} 상태 미상`);
    }
  }

  // A recorded recent error is a real failure signal — surface as offline.
  if (snapshot.recentError) {
    level = worse(level, "offline");
    reasons.push("최근 오류 기록 있음");
  }

  const stale = computeStale(snapshot.updatedAt, options);
  if (stale) {
    reasons.push("스냅샷 정보 지연(stale)");
    // Stale data cannot be confidently reported as healthy.
    if (level === "healthy") level = "degraded";
  }

  return { level, reasons, subsystems, stale };
}

function computeStale(updatedAt: string | undefined, options: RuntimeHealthProjectionOptions): boolean {
  const now = options.now;
  if (now == null) return false;
  const threshold = options.stalenessThresholdMs ?? DEFAULT_STALENESS_THRESHOLD_MS;
  if (!updatedAt) return true;
  const parsed = Date.parse(updatedAt);
  if (Number.isNaN(parsed)) return true;
  return now - parsed > threshold;
}
