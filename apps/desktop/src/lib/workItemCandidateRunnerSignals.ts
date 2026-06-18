import type { WorkItemCandidate } from "./workItemCandidate";
import type {
  HeartbeatLiveness,
  RunnerLane,
  RunnerMissionStatus,
  RunnerTheaterRow,
} from "./runnerTheater";

/**
 * Engine E16 — read-only links between WorkItemCandidates and Runner Theater.
 *
 * Pure ref matching only. The helper consumes candidate refs and already-present
 * runner theater rows; it never starts a runner, writes, dispatches, or resolves
 * anything beyond the rows it was handed.
 */

export type WorkItemCandidateRunnerSignalKind =
  | "runner-linked"
  | "runner-active"
  | "runner-stalled"
  | "runner-done"
  | "runner-attention";

export type WorkItemCandidateRunnerSignal = {
  id: string;
  candidateId: string;
  runnerId: string;
  missionId: string;
  title: string;
  branch?: string;
  lane: RunnerLane;
  liveness: HeartbeatLiveness;
  status: RunnerMissionStatus;
  signal: WorkItemCandidateRunnerSignalKind;
  refStatus: "matched-row";
};

export type WorkItemCandidateRunnerCandidateLink = {
  candidateId: string;
  signals: WorkItemCandidateRunnerSignal[];
  unresolvedRefs: string[];
};

export type WorkItemCandidateRunnerRowLink = {
  runnerId: string;
  candidateIds: string[];
};

export type WorkItemCandidateRunnerSignalLinks = {
  byCandidateId: Record<string, WorkItemCandidateRunnerCandidateLink>;
  byRunnerId: Record<string, WorkItemCandidateRunnerRowLink>;
};

function cleanRefs(refs: ReadonlyArray<string>): string[] {
  return Array.from(new Set(refs.map((ref) => ref.trim()).filter(Boolean)));
}

function matchesRunner(candidate: WorkItemCandidate, runner: RunnerTheaterRow): boolean {
  const refs = cleanRefs(candidate.sourceRefs);
  return (
    candidate.id === `wic-runner-${runner.id}` ||
    refs.includes(runner.id) ||
    (runner.branch ? refs.includes(runner.branch) : false)
  );
}

function runnerSignal(row: RunnerTheaterRow): WorkItemCandidateRunnerSignalKind {
  if (row.lane === "active" && row.liveness === "stale") return "runner-stalled";
  if (row.lane === "active") return "runner-active";
  if (row.lane === "attention") return "runner-attention";
  if (row.lane === "done") return "runner-done";
  return "runner-linked";
}

function unresolvedRunnerRefs(
  candidate: WorkItemCandidate,
  matched: ReadonlyArray<RunnerTheaterRow>,
): string[] {
  if (matched.length > 0) return [];
  if (candidate.kind !== "runner") return [];
  return cleanRefs(candidate.sourceRefs);
}

export function linkCandidatesToRunnerSignals(
  candidates: ReadonlyArray<WorkItemCandidate> = [],
  runnerTheater: ReadonlyArray<RunnerTheaterRow> = [],
): WorkItemCandidateRunnerSignalLinks {
  const byCandidateId: Record<string, WorkItemCandidateRunnerCandidateLink> = {};
  const byRunnerId: Record<string, WorkItemCandidateRunnerRowLink> = {};

  for (const candidate of candidates) {
    const matched = runnerTheater.filter((row) => matchesRunner(candidate, row));
    const signals = matched.map((row) => ({
      id: `${candidate.id}-${row.id}`,
      candidateId: candidate.id,
      runnerId: row.id,
      missionId: row.id,
      title: row.title,
      branch: row.branch,
      lane: row.lane,
      liveness: row.liveness,
      status: row.status,
      signal: runnerSignal(row),
      refStatus: "matched-row" as const,
    }));
    byCandidateId[candidate.id] = {
      candidateId: candidate.id,
      signals,
      unresolvedRefs: unresolvedRunnerRefs(candidate, matched),
    };
    for (const signal of signals) {
      const rowLink =
        byRunnerId[signal.runnerId] ??
        (byRunnerId[signal.runnerId] = { runnerId: signal.runnerId, candidateIds: [] });
      rowLink.candidateIds.push(candidate.id);
    }
  }

  for (const link of Object.values(byRunnerId)) {
    link.candidateIds = Array.from(new Set(link.candidateIds)).sort();
  }

  return { byCandidateId, byRunnerId };
}
