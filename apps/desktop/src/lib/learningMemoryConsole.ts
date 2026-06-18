import type { LearningLoopItem, LearningLoopStage } from "../components/inbox/LearningLoopCard";
import type { MemoryCandidateItem } from "../components/inbox/MemoryCandidateCard";
import type { MemoryEvalReport } from "@ai-orchestrator/protocol";

/**
 * Engine E3 — Learning & Memory Console (read-only roll-up).
 *
 * Composes the EXISTING pure projections (learning-loop items, memory
 * candidates, memory-eval reports) into one at-a-glance operator console:
 * what the OS learned (loop stages), what it distilled (memory candidates,
 * honestly suggested / not written), and whether memory is healthy (eval
 * pass/warn/fail + forbidden / stale / contradicted hit counts).
 *
 * Pure summary only — no execution, no runtime load, no auto-trust, no write,
 * no I/O, no Date.now. It NEVER escalates a candidate to written/active and it
 * surfaces honest attention flags rather than acting on them. Generic only.
 */

const SETTLED_STAGES: ReadonlySet<LearningLoopStage> = new Set<LearningLoopStage>([
  "verified",
  "distilled",
  "consulted",
]);

const ALL_STAGES: ReadonlyArray<LearningLoopStage> = [
  "failed",
  "investigating",
  "hypothesis_recorded",
  "verified",
  "distilled",
  "consulted",
  "rejected",
];

export type LearningMemoryConsole = {
  learning: {
    total: number;
    byStage: Record<LearningLoopStage, number>;
    /** active = not settled and not rejected (failed / investigating / hypothesis). */
    active: number;
    /** settled = verified / distilled / consulted. */
    settled: number;
    rejected: number;
    verifiedHypotheses: number;
    rejectedHypotheses: number;
  };
  memory: {
    total: number;
    suggested: number;
    written: number;
    /** honest — candidates actually observed/written (a real writer); usually 0. */
    observed: number;
  };
  evalHealth: {
    reports: number;
    pass: number;
    warning: number;
    fail: number;
    forbiddenHits: number;
    staleHits: number;
    contradictedHits: number;
    supersededHits: number;
    /** reports carrying at least one blocker. */
    blocked: number;
  };
  /** Honest attention flags derived from the roll-up (display-only, never acted on). */
  flags: string[];
  /** false → honest empty (no learning loops, no memory candidates, no eval reports). */
  hasData: boolean;
};

function emptyByStage(): Record<LearningLoopStage, number> {
  return {
    failed: 0,
    investigating: 0,
    hypothesis_recorded: 0,
    verified: 0,
    distilled: 0,
    consulted: 0,
    rejected: 0,
  };
}

const len = (a?: ReadonlyArray<unknown>): number => (Array.isArray(a) ? a.length : 0);

/**
 * Build the read-only Learning & Memory console roll-up from already-projected
 * inputs (reuses the inbox's existing pure projections; no duplication).
 */
export function buildLearningMemoryConsole(input: {
  learningLoops?: ReadonlyArray<LearningLoopItem>;
  memoryCandidates?: ReadonlyArray<MemoryCandidateItem>;
  evalReports?: ReadonlyArray<MemoryEvalReport>;
}): LearningMemoryConsole {
  const loops = input.learningLoops ?? [];
  const candidates = input.memoryCandidates ?? [];
  const reports = input.evalReports ?? [];

  const byStage = emptyByStage();
  let settled = 0;
  let rejected = 0;
  let verifiedHypotheses = 0;
  let rejectedHypotheses = 0;
  for (const l of loops) {
    if (ALL_STAGES.includes(l.stage)) byStage[l.stage] += 1;
    if (SETTLED_STAGES.has(l.stage)) settled += 1;
    if (l.stage === "rejected") rejected += 1;
    verifiedHypotheses += l.verifiedCount ?? 0;
    rejectedHypotheses += l.rejectedCount ?? 0;
  }
  const active = loops.length - settled - rejected;

  let suggested = 0;
  let written = 0;
  let observed = 0;
  for (const c of candidates) {
    if (c.status === "written") written += 1;
    else suggested += 1; // "suggested" or "eval" → not written
    if (c.observed === true) observed += 1;
  }

  const evalHealth = {
    reports: reports.length,
    pass: 0,
    warning: 0,
    fail: 0,
    forbiddenHits: 0,
    staleHits: 0,
    contradictedHits: 0,
    supersededHits: 0,
    blocked: 0,
  };
  for (const r of reports) {
    if (r.verdict === "pass") evalHealth.pass += 1;
    else if (r.verdict === "warning") evalHealth.warning += 1;
    else if (r.verdict === "fail") evalHealth.fail += 1;
    evalHealth.forbiddenHits += len(r.forbiddenHitIds);
    evalHealth.staleHits += len(r.staleHitIds);
    evalHealth.contradictedHits += len(r.contradictedHitIds);
    evalHealth.supersededHits += len(r.supersededHitIds);
    if (len(r.blockers) > 0) evalHealth.blocked += 1;
  }

  const flags: string[] = [];
  if (rejected > 0) flags.push(`${rejected} rejected loop${rejected > 1 ? "s" : ""}`);
  if (evalHealth.fail > 0) flags.push(`${evalHealth.fail} memory eval fail${evalHealth.fail > 1 ? "s" : ""}`);
  if (evalHealth.forbiddenHits > 0) flags.push(`${evalHealth.forbiddenHits} forbidden hit${evalHealth.forbiddenHits > 1 ? "s" : ""}`);
  if (evalHealth.staleHits > 0) flags.push(`${evalHealth.staleHits} stale hit${evalHealth.staleHits > 1 ? "s" : ""}`);
  if (evalHealth.contradictedHits > 0) flags.push(`${evalHealth.contradictedHits} contradicted hit${evalHealth.contradictedHits > 1 ? "s" : ""}`);

  return {
    learning: {
      total: loops.length,
      byStage,
      active,
      settled,
      rejected,
      verifiedHypotheses,
      rejectedHypotheses,
    },
    memory: { total: candidates.length, suggested, written, observed },
    evalHealth,
    flags,
    hasData: loops.length > 0 || candidates.length > 0 || reports.length > 0,
  };
}
