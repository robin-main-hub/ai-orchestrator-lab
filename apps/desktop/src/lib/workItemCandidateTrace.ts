import type { WorkItemCandidate, WorkItemCandidateKind } from "./workItemCandidate";
import type { WorkItemCandidateNextStepPreview } from "./workItemCandidateNextStepPreview";
import type {
  WorkItemCandidateConfidenceBand,
  WorkItemCandidateReadiness,
  WorkItemCandidateReadinessState,
} from "./workItemCandidateReadiness";
import type { CandidateDraftEvidenceLink } from "./workItemEvidenceLinks";

/**
 * Engine E12 — read-only source trace timeline for WorkItemCandidate.
 *
 * Pure projection only. Ref-only, local-detail context; no object resolution, no
 * lifecycle transition, no EventStorage/server write, no runner/patch action.
 */

export type WorkItemCandidateTraceEventKind =
  | "source"
  | "evidence"
  | "draft"
  | "runner"
  | "patch"
  | "memory"
  | "readiness"
  | "next-step"
  | "unknown";

export type WorkItemCandidateTraceEvent = {
  id: string;
  kind: WorkItemCandidateTraceEventKind;
  label: string;
  timestamp?: string;
  timeLabel: string;
  ref?: string;
  refStatus?: "ref only · unresolved";
  readiness?: WorkItemCandidateReadinessState;
  confidence?: WorkItemCandidateConfidenceBand;
  details: string[];
  order: number;
};

export type WorkItemCandidateTrace = {
  candidateId: string;
  title: string;
  label: "trace timeline · read-only · ref only";
  empty: boolean;
  missing: string[];
  events: WorkItemCandidateTraceEvent[];
};

export type WorkItemCandidateTraceContext = {
  draftLink?: CandidateDraftEvidenceLink;
  nextStepPreview?: WorkItemCandidateNextStepPreview;
  readiness?: WorkItemCandidateReadiness;
};

const TRACE_LABEL = "trace timeline · read-only · ref only" as const;

const KIND_ORDER: Record<WorkItemCandidateTraceEventKind, number> = {
  patch: 10,
  runner: 10,
  memory: 10,
  source: 20,
  evidence: 30,
  draft: 40,
  readiness: 50,
  "next-step": 60,
  unknown: 90,
};

function cleanRefs(refs: ReadonlyArray<string> = []): string[] {
  return Array.from(new Set(refs.map((ref) => ref.trim()).filter(Boolean)));
}

function signalKind(kind: WorkItemCandidateKind): WorkItemCandidateTraceEventKind {
  if (kind === "patch" || kind === "runner" || kind === "memory" || kind === "source" || kind === "evidence") {
    return kind;
  }
  return "unknown";
}

function timeLabel(timestamp?: string): string {
  return timestamp && timestamp.trim().length > 0 ? timestamp : "time unknown";
}

function timestampMs(timestamp?: string): number | null {
  if (!timestamp) return null;
  const ms = Date.parse(timestamp);
  return Number.isFinite(ms) ? ms : null;
}

function sortTraceEvents(events: WorkItemCandidateTraceEvent[]): WorkItemCandidateTraceEvent[] {
  return [...events].sort((a, b) => {
    const aMs = timestampMs(a.timestamp);
    const bMs = timestampMs(b.timestamp);
    if (aMs != null && bMs != null && aMs !== bMs) return aMs - bMs;
    if (aMs != null && bMs == null) return -1;
    if (aMs == null && bMs != null) return 1;
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

function refEvent(args: {
  id: string;
  kind: WorkItemCandidateTraceEventKind;
  label: string;
  ref: string;
  order: number;
  details?: string[];
}): WorkItemCandidateTraceEvent {
  return {
    id: args.id,
    kind: args.kind,
    label: args.label,
    ref: args.ref,
    refStatus: "ref only · unresolved",
    timeLabel: "time unknown",
    details: args.details ?? [],
    order: args.order,
  };
}

export function buildWorkItemCandidateTrace(
  candidate: WorkItemCandidate,
  context: WorkItemCandidateTraceContext = {},
): WorkItemCandidateTrace {
  const sourceRefs = cleanRefs(candidate.sourceRefs);
  const evidenceRefs = cleanRefs(candidate.evidenceRefs);
  const draftRefs = context.draftLink?.matchedRefs ?? [];
  const missing: string[] = [];
  if (sourceRefs.length === 0) missing.push("source refs unknown");
  if (evidenceRefs.length === 0) missing.push("evidence refs unknown");

  const events: WorkItemCandidateTraceEvent[] = [
    {
      id: `${candidate.id}-signal`,
      kind: signalKind(candidate.kind),
      label: `${candidate.kind} signal · ${candidate.reason}`,
      timestamp: candidate.createdAt,
      timeLabel: timeLabel(candidate.createdAt),
      ref: candidate.id,
      details: [`lane ${candidate.lane}`, `status ${candidate.status}`, `risk ${candidate.risk}`],
      order: KIND_ORDER[signalKind(candidate.kind)],
    },
  ];

  sourceRefs.forEach((ref, index) => {
    events.push(
      refEvent({
        id: `${candidate.id}-source-${index}`,
        kind: "source",
        label: `source ref · ${ref}`,
        ref,
        order: KIND_ORDER.source + index,
      }),
    );
  });

  evidenceRefs.forEach((ref, index) => {
    events.push(
      refEvent({
        id: `${candidate.id}-evidence-${index}`,
        kind: "evidence",
        label: `evidence ref · ${ref}`,
        ref,
        order: KIND_ORDER.evidence + index,
      }),
    );
  });

  draftRefs.forEach((ref, index) => {
    events.push(
      refEvent({
        id: `${candidate.id}-draft-${ref.refId}`,
        kind: "draft",
        label: `draft footnote [${ref.footnote}] · ${ref.label}`,
        ref: ref.refId,
        details: ref.claimIds,
        order: KIND_ORDER.draft + index,
      }),
    );
  });

  if (context.readiness) {
    events.push({
      id: `${candidate.id}-readiness`,
      kind: "readiness",
      label: `readiness · ${context.readiness.readiness} · confidence ${context.readiness.confidence}`,
      timeLabel: "time unknown",
      readiness: context.readiness.readiness,
      confidence: context.readiness.confidence,
      details: context.readiness.reasons,
      order: KIND_ORDER.readiness,
    });
  }

  if (context.nextStepPreview) {
    const gapCount =
      context.nextStepPreview.missingSourceRefs.length + context.nextStepPreview.missingEvidenceRefs.length;
    events.push({
      id: `${candidate.id}-next-step`,
      kind: "next-step",
      label: `next-step preview · ${gapCount} preview gaps`,
      timeLabel: "time unknown",
      ref: candidate.id,
      details: [context.nextStepPreview.label, context.nextStepPreview.suggestedOperatorNote],
      order: KIND_ORDER["next-step"],
    });
  }

  return {
    candidateId: candidate.id,
    title: candidate.title,
    label: TRACE_LABEL,
    empty: sourceRefs.length === 0 && evidenceRefs.length === 0 && draftRefs.length === 0,
    missing,
    events: sortTraceEvents(events),
  };
}
