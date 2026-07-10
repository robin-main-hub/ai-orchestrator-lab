import {
  CHIP_BASE,
  TONE,
} from "../../lib/inboxStyleTokens";
import type { WorkItemCandidateNextStepPreview } from "../../lib/workItemCandidateNextStepPreview";
import type {
  WorkItemCandidateConfidenceBand,
  WorkItemCandidateReadiness,
  WorkItemCandidateReadinessState,
} from "../../lib/workItemCandidateReadiness";
import type {
  WorkItemCandidateTrace,
  WorkItemCandidateTraceEvent,
  WorkItemCandidateTraceEventKind,
} from "../../lib/workItemCandidateTrace";
import type { WorkItemCandidateLearningMemoryCandidateLink } from "../../lib/workItemCandidateLearningMemorySignals";
import type { WorkItemCandidatePatchCandidateLink } from "../../lib/workItemCandidatePatchSignals";
import type { WorkItemCandidateRunnerCandidateLink } from "../../lib/workItemCandidateRunnerSignals";

const WIC_UNKNOWN = "none / unknown";

const WIC_READINESS_TONE: Record<WorkItemCandidateReadinessState, string> = {
  ready: TONE.good,
  "needs-evidence": TONE.warn,
  blocked: TONE.bad,
  "needs-review": TONE.info,
  unknown: TONE.muted,
};

const WIC_CONFIDENCE_TONE: Record<WorkItemCandidateConfidenceBand, string> = {
  high: TONE.good,
  medium: TONE.info,
  low: TONE.warn,
  unknown: TONE.muted,
};

const WIC_TRACE_TONE: Record<WorkItemCandidateTraceEventKind, string> = {
  patch: TONE.warn,
  runner: TONE.bad,
  memory: TONE.info,
  source: TONE.neutral,
  evidence: TONE.good,
  draft: TONE.info,
  readiness: TONE.good,
  "next-step": TONE.warn,
  unknown: TONE.muted,
};

function wicRefs(refs: ReadonlyArray<string>): string {
  return refs.length > 0 ? refs.join(", ") : WIC_UNKNOWN;
}

export function WorkItemCandidateNextStepPreviewCard({
  preview,
  readiness,
}: {
  preview: WorkItemCandidateNextStepPreview;
  readiness?: WorkItemCandidateReadiness;
}) {
  return (
    <section
      data-testid="wic-next-step-preview"
      data-risk={preview.risk}
      className="mt-2 rounded-md border border-primary/15 bg-primary/[0.04] p-2"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-primary/70">
          Next-step preview
        </p>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[12px] uppercase text-primary/80">
          {preview.label}
        </span>
      </div>
      <div className="space-y-1 text-[12px] text-zinc-300">
        <p data-testid="wic-next-step-candidate" className="break-all">
          {preview.candidateId} · {preview.title}
        </p>
        <p data-testid="wic-next-step-state" className="text-muted-foreground">
          {preview.lane} · {preview.status} · {preview.risk}
        </p>
        <p data-testid="wic-next-step-reason" className="break-all text-muted-foreground">
          reason · {preview.reason}
        </p>
        <dl className="space-y-0.5">
          <div className="flex items-start justify-between gap-2">
            <dt className="shrink-0 text-muted-foreground/60">source refs</dt>
            <dd data-testid="wic-next-step-sourceRefs" className="min-w-0 break-all text-right">
              {wicRefs(preview.availableSourceRefs)}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-2">
            <dt className="shrink-0 text-muted-foreground/60">evidence refs</dt>
            <dd data-testid="wic-next-step-evidenceRefs" className="min-w-0 break-all text-right">
              {wicRefs(preview.availableEvidenceRefs)}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-2">
            <dt className="shrink-0 text-muted-foreground/60">missing source</dt>
            <dd data-testid="wic-next-step-missingSource" className="min-w-0 break-all text-right">
              {preview.missingSourceRefs.length > 0
                ? preview.missingSourceRefs.join(", ")
                : WIC_UNKNOWN}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-2">
            <dt className="shrink-0 text-muted-foreground/60">missing evidence</dt>
            <dd data-testid="wic-next-step-missingEvidence" className="min-w-0 break-all text-right">
              {preview.missingEvidenceRefs.length > 0
                ? preview.missingEvidenceRefs.join(", ")
                : WIC_UNKNOWN}
            </dd>
          </div>
        </dl>
        <div data-testid="wic-next-step-draftClaims" className="break-all text-muted-foreground">
          draft claims ·{" "}
          {preview.relatedDraftClaims.length > 0
            ? preview.relatedDraftClaims.join(", ")
            : "no linked draft claims"}
        </div>
        <div data-testid="wic-next-step-draftFootnotes" className="space-y-0.5 text-muted-foreground">
          {preview.relatedDraftFootnotes.length > 0 ? (
            preview.relatedDraftFootnotes.map((ref) => (
              <div key={`${ref.footnote}-${ref.refId}`} className="flex items-center gap-1.5">
                <span className="shrink-0 tabular-nums text-primary/70">[{ref.footnote}]</span>
                <code className="shrink-0 rounded bg-background/70 px-1">{ref.refId}</code>
                <span className="min-w-0 flex-1 truncate">{ref.label}</span>
              </div>
            ))
          ) : (
            <span>no linked draft footnotes</span>
          )}
        </div>
        <div data-testid="wic-next-step-riskNotes" className="break-all text-muted-foreground">
          risk notes · {preview.riskNotes.join(", ")}
        </div>
        {readiness ? (
          <div data-testid="wic-next-step-readiness" className="break-all text-muted-foreground">
            readiness · {readiness.readiness} · confidence · {readiness.confidence}
          </div>
        ) : null}
        <div data-testid="wic-next-step-operator-note" className="break-all text-primary/75">
          {preview.suggestedOperatorNote}
        </div>
      </div>
    </section>
  );
}

export function WorkItemCandidateReadinessSection({
  readiness,
}: {
  readiness: WorkItemCandidateReadiness;
}) {
  return (
    <section
      data-testid="wic-readiness-section"
      data-readiness={readiness.readiness}
      data-confidence={readiness.confidence}
      className="mt-2 rounded-md border border-emerald-400/15 bg-emerald-400/[0.04] p-2"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-emerald-200/70">
          Readiness / confidence
        </p>
        <span className="rounded bg-emerald-300/10 px-1.5 py-0.5 text-[12px] uppercase text-emerald-100/80">
          {readiness.label}
        </span>
      </div>
      <div className="space-y-1 text-[12px] text-zinc-300">
        <div data-testid="wic-readiness-state" className="flex flex-wrap items-center gap-1">
          <span className={`${CHIP_BASE} ${WIC_READINESS_TONE[readiness.readiness]}`}>
            {readiness.readiness}
          </span>
          <span className={`${CHIP_BASE} ${WIC_CONFIDENCE_TONE[readiness.confidence]}`}>
            confidence · {readiness.confidence}
          </span>
        </div>
        <div data-testid="wic-readiness-reasons" className="break-all text-muted-foreground">
          reasons · {readiness.reasons.join(", ")}
        </div>
        <div data-testid="wic-readiness-missing-source" className="break-all text-muted-foreground">
          missing source · {readiness.missingSourceRefs.length > 0 ? readiness.missingSourceRefs.join(", ") : WIC_UNKNOWN}
        </div>
        <div data-testid="wic-readiness-missing-evidence" className="break-all text-muted-foreground">
          missing evidence · {readiness.missingEvidenceRefs.length > 0 ? readiness.missingEvidenceRefs.join(", ") : WIC_UNKNOWN}
        </div>
        <div data-testid="wic-readiness-risk-blockers" className="break-all text-muted-foreground">
          risk blockers · {readiness.riskBlockers.length > 0 ? readiness.riskBlockers.join(", ") : WIC_UNKNOWN}
        </div>
        <div data-testid="wic-readiness-target" className="break-all text-emerald-100/75">
          {readiness.suggestedNextInspectionTarget}
        </div>
      </div>
    </section>
  );
}

function WorkItemCandidateTraceRow({ event }: { event: WorkItemCandidateTraceEvent }) {
  return (
    <li
      data-testid={`wic-trace-event-${event.kind}-${event.id}`}
      data-kind={event.kind}
      className="rounded border border-white/[0.06] bg-white/[0.025] p-1.5 text-[12px] text-zinc-300"
    >
      <div className="mb-0.5 flex flex-wrap items-center gap-1">
        <span className={`${CHIP_BASE} ${WIC_TRACE_TONE[event.kind]}`}>{event.kind}</span>
        <span className="rounded bg-white/[0.04] px-1 text-[12px] uppercase text-muted-foreground/65">
          {event.timeLabel}
        </span>
        {event.refStatus ? (
          <span className="rounded bg-white/[0.04] px-1 text-[12px] uppercase text-muted-foreground/65">
            {event.refStatus}
          </span>
        ) : null}
      </div>
      <div className="break-all text-zinc-200">{event.label}</div>
      {event.ref ? (
        <div className="break-all text-muted-foreground">
          ref · <code className="rounded bg-background/70 px-1">{event.ref}</code>
        </div>
      ) : null}
      {event.readiness || event.confidence ? (
        <div className="break-all text-muted-foreground">
          {event.readiness ? `readiness · ${event.readiness}` : null}
          {event.confidence ? ` · confidence · ${event.confidence}` : null}
        </div>
      ) : null}
      {event.details.length > 0 ? (
        <div className="break-all text-muted-foreground">details · {event.details.join(", ")}</div>
      ) : null}
    </li>
  );
}

export function WorkItemCandidateTraceTimeline({ trace }: { trace: WorkItemCandidateTrace }) {
  return (
    <section
      data-testid="wic-trace-timeline"
      data-empty={trace.empty ? "true" : "false"}
      className="mt-2 rounded-md border border-amber-300/15 bg-amber-300/[0.035] p-2"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-100/75">
          Trace timeline
        </p>
        <span className="rounded bg-amber-300/10 px-1.5 py-0.5 text-[12px] uppercase text-amber-100/75">
          {trace.label}
        </span>
      </div>
      {trace.empty ? (
        <p data-testid="wic-trace-empty" className="mb-1 text-[12px] text-muted-foreground/70">
          no source/evidence trace refs yet · {trace.missing.join(", ")}
        </p>
      ) : null}
      <ol className="space-y-1">
        {trace.events.map((event) => (
          <WorkItemCandidateTraceRow key={event.id} event={event} />
        ))}
      </ol>
    </section>
  );
}

export function WorkItemCandidateRunnerSignalsSection({
  link,
}: {
  link?: WorkItemCandidateRunnerCandidateLink;
}) {
  const signals = link?.signals ?? [];
  return (
    <section
      data-testid="wic-runner-signals-section"
      data-count={signals.length}
      className="mt-2 rounded-md border border-emerald-400/15 bg-emerald-400/[0.035] p-2"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-emerald-200/70">
          Runner Signals
        </p>
        <span className="rounded bg-emerald-300/10 px-1.5 py-0.5 text-[12px] uppercase text-emerald-100/75">
          local detail
        </span>
      </div>
      {signals.length === 0 ? (
        <p data-testid="wic-runner-signals-empty" className="text-[12px] text-muted-foreground/70">
          {link?.unresolvedRefs.length
            ? `runner refs unresolved · ${link.unresolvedRefs.join(", ")}`
            : "no matching runner signals"}
        </p>
      ) : (
        <ul className="space-y-1">
          {signals.map((signal) => (
            <li
              key={signal.id}
              data-testid={`wic-runner-signal-${signal.runnerId}`}
              className="rounded border border-white/[0.06] bg-white/[0.025] p-1.5 text-[12px] text-zinc-300"
            >
              <div className="mb-0.5 flex flex-wrap items-center gap-1">
                <span className={`${CHIP_BASE} ${signal.signal === "runner-stalled" ? TONE.bad : TONE.info}`}>
                  {signal.signal}
                </span>
                <span className={`${CHIP_BASE} ${TONE.muted}`}>{signal.refStatus}</span>
              </div>
              <div className="break-all text-zinc-200">{signal.title}</div>
              <div className="break-all text-muted-foreground">
                runner id · <code className="rounded bg-background/70 px-1">{signal.runnerId}</code>
              </div>
              <div className="break-all text-muted-foreground">
                mission id · <code className="rounded bg-background/70 px-1">{signal.missionId}</code>
              </div>
              <div className="break-all text-muted-foreground">
                {signal.lane} · {signal.liveness} · {signal.status}
              </div>
              {signal.branch ? (
                <div className="break-all text-muted-foreground">branch ref · {signal.branch}</div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function WorkItemCandidatePatchSignalsSection({
  link,
}: {
  link?: WorkItemCandidatePatchCandidateLink;
}) {
  const signals = link?.signals ?? [];
  return (
    <section
      data-testid="wic-patch-signals-section"
      data-count={signals.length}
      className="mt-2 rounded-md border border-amber-400/15 bg-amber-400/[0.035] p-2"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-200/70">
          Patch Signals
        </p>
        <span className="rounded bg-amber-300/10 px-1.5 py-0.5 text-[12px] uppercase text-amber-100/75">
          local detail
        </span>
      </div>
      {signals.length === 0 ? (
        <p data-testid="wic-patch-signals-empty" className="text-[12px] text-muted-foreground/70">
          {link?.unresolvedRefs.length
            ? `patch refs unresolved · ${link.unresolvedRefs.join(", ")}`
            : "no matching patch signals"}
        </p>
      ) : (
        <ul className="space-y-1">
          {signals.map((signal) => (
            <li
              key={signal.id}
              data-testid={`wic-patch-signal-${signal.patchCandidateId}-${signal.signal}`}
              data-verification={signal.verificationStatus}
              className="rounded border border-white/[0.06] bg-white/[0.025] p-1.5 text-[12px] text-zinc-300"
            >
              <div className="mb-0.5 flex flex-wrap items-center gap-1">
                <span className={`${CHIP_BASE} ${signal.signal === "patch-blocked" ? TONE.bad : TONE.warn}`}>
                  {signal.signal}
                </span>
                <span className={`${CHIP_BASE} ${TONE.muted}`}>{signal.refStatus}</span>
              </div>
              <div className="break-all text-muted-foreground">
                patch candidate · <code className="rounded bg-background/70 px-1">{signal.patchCandidateId}</code>
              </div>
              <div className="break-all text-muted-foreground">
                runner id · <code className="rounded bg-background/70 px-1">{signal.runnerId}</code>
              </div>
              <div className="break-all text-muted-foreground">
                mission id · <code className="rounded bg-background/70 px-1">{signal.missionId}</code>
              </div>
              <div className="break-all text-muted-foreground">
                {signal.safetyStatus} ·{" "}
                {signal.verificationStatus === "not_run" ? "verification pending" : signal.verificationStatus} ·{" "}
                {signal.changedFileCount} files
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function WorkItemCandidateLearningMemorySignalsSection({
  link,
}: {
  link?: WorkItemCandidateLearningMemoryCandidateLink;
}) {
  const signals = link?.signals ?? [];
  return (
    <section
      data-testid="wic-learning-memory-signals-section"
      data-count={signals.length}
      className="mt-2 rounded-md border border-primary/15 bg-primary/[0.035] p-2"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-primary/70">
          Learning/Memory Signals
        </p>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[12px] uppercase text-primary/75">
          aggregate only
        </span>
      </div>
      {signals.length === 0 ? (
        <p
          data-testid="wic-learning-memory-signals-empty"
          className="text-[12px] text-muted-foreground/70"
        >
          {link?.unresolvedRefs.length
            ? `learning/memory refs unresolved · ${link.unresolvedRefs.join(", ")}`
            : "no matching learning/memory signals"}
        </p>
      ) : (
        <ul className="space-y-1">
          {signals.map((signal) => (
            <li
              key={signal.id}
              data-testid={`wic-learning-memory-signal-${signal.signal}`}
              className="rounded border border-white/[0.06] bg-white/[0.025] p-1.5 text-[12px] text-zinc-300"
            >
              <div className="mb-0.5 flex flex-wrap items-center gap-1">
                <span
                  className={`${CHIP_BASE} ${
                    signal.signal === "memory-warning" ||
                    signal.signal === "stale-memory" ||
                    signal.signal === "contradicted-memory"
                      ? TONE.warn
                      : signal.signal === "missing-memory-context"
                        ? TONE.muted
                        : TONE.info
                  }`}
                >
                  {signal.signal}
                </span>
                <span className={`${CHIP_BASE} ${TONE.muted}`}>{signal.refStatus}</span>
              </div>
              <div className="break-all text-zinc-200">{signal.reason}</div>
              {signal.warning ? (
                <div className="break-all text-muted-foreground">warning · {signal.warning}</div>
              ) : null}
              {signal.ref ? (
                <div className="break-all text-muted-foreground">
                  ref · <code className="rounded bg-background/70 px-1">{signal.ref}</code>
                </div>
              ) : null}
              <div className="break-all text-muted-foreground">
                {signal.learningLoops} learning loops · {signal.memoryCandidates} memory candidates ·{" "}
                {signal.evalReports} eval reports
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
