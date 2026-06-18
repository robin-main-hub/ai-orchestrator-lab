import type { LearningMemoryConsole } from "./learningMemoryConsole";
import type { WorkItemCandidate } from "./workItemCandidate";

/**
 * Engine E18 — read-only links between WorkItemCandidates and the aggregate
 * Learning & Memory Console.
 *
 * The console is a roll-up, not an object resolver. Links here are therefore
 * aggregate-console signals only; this helper never writes memory, trusts memory,
 * loads runtime skills, or resolves string refs into hidden objects.
 */

export type WorkItemCandidateLearningMemorySignalKind =
  | "memory-linked"
  | "learning-linked"
  | "memory-warning"
  | "stale-memory"
  | "contradicted-memory"
  | "missing-memory-context";

export type WorkItemCandidateLearningMemorySignal = {
  id: string;
  candidateId: string;
  signal: WorkItemCandidateLearningMemorySignalKind;
  reason: string;
  ref?: string;
  warning?: string;
  learningLoops: number;
  memoryCandidates: number;
  evalReports: number;
  refStatus: "aggregate-console";
};

export type WorkItemCandidateLearningMemoryCandidateLink = {
  candidateId: string;
  signals: WorkItemCandidateLearningMemorySignal[];
  unresolvedRefs: string[];
};

export type WorkItemCandidateLearningMemoryConsoleLink = {
  candidateIds: string[];
};

export type WorkItemCandidateLearningMemorySignalLinks = {
  byCandidateId: Record<string, WorkItemCandidateLearningMemoryCandidateLink>;
  console: WorkItemCandidateLearningMemoryConsoleLink;
};

function cleanRefs(refs: ReadonlyArray<string>): string[] {
  return Array.from(new Set(refs.map((ref) => ref.trim()).filter(Boolean)));
}

function refsHintLearningMemory(candidate: WorkItemCandidate): boolean {
  const refs = cleanRefs([...candidate.sourceRefs, ...candidate.evidenceRefs]).map((ref) =>
    ref.toLowerCase(),
  );
  return refs.some(
    (ref) => ref.includes("memory") || ref.includes("learning") || ref.includes("eval"),
  );
}

function shouldInspect(candidate: WorkItemCandidate): boolean {
  return candidate.kind === "memory" || refsHintLearningMemory(candidate);
}

function unresolvedRefs(candidate: WorkItemCandidate, hasConsoleData: boolean): string[] {
  if (hasConsoleData) return [];
  if (!shouldInspect(candidate)) return [];
  return cleanRefs([...candidate.sourceRefs, ...candidate.evidenceRefs]);
}

function signal(
  candidate: WorkItemCandidate,
  console: LearningMemoryConsole | undefined,
  kind: WorkItemCandidateLearningMemorySignalKind,
  reason: string,
  warning?: string,
): WorkItemCandidateLearningMemorySignal {
  return {
    id: `${candidate.id}-${kind}`,
    candidateId: candidate.id,
    signal: kind,
    reason,
    warning,
    ref: candidate.sourceRefs[0] ?? candidate.evidenceRefs[0],
    learningLoops: console?.learning.total ?? 0,
    memoryCandidates: console?.memory.total ?? 0,
    evalReports: console?.evalHealth.reports ?? 0,
    refStatus: "aggregate-console",
  };
}

function signalsForCandidate(
  candidate: WorkItemCandidate,
  console: LearningMemoryConsole | undefined,
): WorkItemCandidateLearningMemorySignal[] {
  if (!shouldInspect(candidate)) return [];
  if (!console?.hasData) {
    return [signal(candidate, console, "missing-memory-context", "no learning/memory console data")];
  }

  const out: WorkItemCandidateLearningMemorySignal[] = [];
  const evalWarnings =
    console.evalHealth.fail +
    console.evalHealth.blocked +
    console.evalHealth.forbiddenHits;
  if (evalWarnings > 0) {
    out.push(
      signal(
        candidate,
        console,
        "memory-warning",
        "memory eval warning",
        `${evalWarnings} eval warning${evalWarnings > 1 ? "s" : ""}`,
      ),
    );
  }
  if (console.evalHealth.staleHits > 0) {
    out.push(
      signal(
        candidate,
        console,
        "stale-memory",
        "stale memory hit",
        `${console.evalHealth.staleHits} stale hit${console.evalHealth.staleHits > 1 ? "s" : ""}`,
      ),
    );
  }
  if (console.evalHealth.contradictedHits > 0) {
    out.push(
      signal(
        candidate,
        console,
        "contradicted-memory",
        "contradicted memory hit",
        `${console.evalHealth.contradictedHits} contradicted hit${
          console.evalHealth.contradictedHits > 1 ? "s" : ""
        }`,
      ),
    );
  }
  if (console.memory.total > 0 || console.evalHealth.reports > 0) {
    out.push(signal(candidate, console, "memory-linked", "memory console aggregate present"));
  }
  if (console.learning.total > 0) {
    out.push(signal(candidate, console, "learning-linked", "learning console aggregate present"));
  }
  if (out.length === 0) {
    out.push(signal(candidate, console, "missing-memory-context", "no specific learning/memory signal"));
  }
  return out;
}

export function linkCandidatesToLearningMemorySignals(
  candidates: ReadonlyArray<WorkItemCandidate> = [],
  console?: LearningMemoryConsole,
): WorkItemCandidateLearningMemorySignalLinks {
  const byCandidateId: Record<string, WorkItemCandidateLearningMemoryCandidateLink> = {};
  const candidateIds: string[] = [];
  const hasConsoleData = console?.hasData === true;

  for (const candidate of candidates) {
    const signals = signalsForCandidate(candidate, console);
    byCandidateId[candidate.id] = {
      candidateId: candidate.id,
      signals,
      unresolvedRefs: unresolvedRefs(candidate, hasConsoleData),
    };
    if (hasConsoleData && signals.some((s) => s.signal !== "missing-memory-context")) {
      candidateIds.push(candidate.id);
    }
  }

  return {
    byCandidateId,
    console: { candidateIds: Array.from(new Set(candidateIds)).sort() },
  };
}
