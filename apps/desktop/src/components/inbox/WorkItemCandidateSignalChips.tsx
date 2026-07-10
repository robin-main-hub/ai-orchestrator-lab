import {
  CHIP_BASE,
  TONE,
} from "../../lib/inboxStyleTokens";
import type {
  WorkItemCandidateSignalChip,
  WorkItemCandidateSignalChipStatus,
  WorkItemCandidateSignalSummary,
} from "../../lib/workItemCandidateSignals";

const WIC_UNKNOWN = "none / unknown";

function signalTone(status: WorkItemCandidateSignalChipStatus): string {
  if (status === "present" || status === "ready") return TONE.good;
  if (status === "blocked") return TONE.bad;
  if (status === "missing" || status === "needs-evidence") return TONE.warn;
  if (status === "needs-review") return TONE.info;
  return TONE.muted;
}

function chipLabel(chip: WorkItemCandidateSignalChip): string {
  return chip.count != null ? `${chip.label} ${chip.count}` : chip.label;
}

export function WorkItemCandidateSignalChips({
  candidateId,
  chips,
}: {
  candidateId: string;
  chips: ReadonlyArray<WorkItemCandidateSignalChip>;
}) {
  return (
    <span data-testid={`wic-signal-chips-${candidateId}`} className="flex min-w-0 flex-wrap items-center gap-0.5">
      {chips.map((chip) => (
        <span
          key={chip.id}
          data-testid={`wic-signal-chip-${candidateId}-${chip.id}`}
          data-signal-type={chip.type}
          data-signal-status={chip.status}
          className={`${CHIP_BASE} ${signalTone(chip.status)} max-w-[8rem] truncate`}
          title={chip.detail}
        >
          {chipLabel(chip)}
        </span>
      ))}
    </span>
  );
}

export function WorkItemCandidateSignalSummarySection({
  summary,
}: {
  summary: WorkItemCandidateSignalSummary;
}) {
  const missing = summary.missingSignalTypes.length > 0
    ? summary.missingSignalTypes.join(", ")
    : WIC_UNKNOWN;
  const unresolved = summary.unresolvedRefs.length > 0
    ? summary.unresolvedRefs.join(", ")
    : WIC_UNKNOWN;
  return (
    <section
      data-testid="wic-signal-summary"
      data-origin={summary.originKind}
      data-signal-count={summary.signalCount}
      className="mt-2 rounded-md border border-primary/15 bg-primary/[0.035] p-2"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-primary/75">
          Signal origin · ref only
        </p>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[12px] uppercase text-primary/75">
          local detail
        </span>
      </div>
      <div className="space-y-1 text-[12px] text-zinc-300">
        <div className="flex flex-wrap items-center gap-1">
          <span>origin · {summary.originKind}</span>
          <span>signals · {summary.signalCount}</span>
          <span>readiness · {summary.readinessContribution}</span>
          <span>confidence · {summary.confidenceContribution}</span>
        </div>
        <div className="break-all text-muted-foreground">missing · {missing}</div>
        <div className="break-all text-muted-foreground">unresolved refs · {unresolved}</div>
        <WorkItemCandidateSignalChips candidateId={summary.candidateId} chips={summary.chips} />
      </div>
    </section>
  );
}
