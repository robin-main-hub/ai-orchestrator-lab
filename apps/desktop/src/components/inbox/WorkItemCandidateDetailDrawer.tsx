import { useEffect, useState } from "react";
import { InboxDetailDrawerShell, type InboxDrawerNav } from "./InboxDetailDrawerShell";
import { TONE } from "../../lib/inboxStyleTokens";
import type { WorkItemCandidate } from "../../lib/workItemCandidate";
import {
  buildWorkItemCandidateNextStepPreview,
  type WorkItemCandidateNextStepPreview,
} from "../../lib/workItemCandidateNextStepPreview";
import {
  buildWorkItemCandidateReadiness,
  type WorkItemCandidateReadiness,
} from "../../lib/workItemCandidateReadiness";
import { buildWorkItemCandidateTrace } from "../../lib/workItemCandidateTrace";
import { buildWorkItemCandidateSignalSummary } from "../../lib/workItemCandidateSignals";
import type { CandidateDraftEvidenceLink } from "../../lib/workItemEvidenceLinks";
import {
  WorkItemCandidateLearningMemorySignalsSection,
  WorkItemCandidateNextStepPreviewCard,
  WorkItemCandidatePatchSignalsSection,
  WorkItemCandidateReadinessSection,
  WorkItemCandidateRunnerSignalsSection,
  WorkItemCandidateTraceTimeline,
} from "./WorkItemCandidateDetailSections";
import type { WorkItemCandidateLearningMemoryCandidateLink } from "../../lib/workItemCandidateLearningMemorySignals";
import type { WorkItemCandidatePatchCandidateLink } from "../../lib/workItemCandidatePatchSignals";
import type { WorkItemCandidateRunnerCandidateLink } from "../../lib/workItemCandidateRunnerSignals";
import { WorkItemCandidateSignalSummarySection } from "./WorkItemCandidateSignalChips";

const WIC_UNKNOWN = "none / unknown";

type WorkItemCandidateDetailField = [string, string];
type WicDetailTab = "overview" | "map" | "readiness" | "preview" | "trace";

const WIC_DETAIL_TABS: ReadonlyArray<{ id: WicDetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "map", label: "Map" },
  { id: "readiness", label: "Readiness" },
  { id: "preview", label: "Preview" },
  { id: "trace", label: "Trace" },
];

function wicValue(value: string | undefined): string {
  return value && value.trim().length > 0 ? value : WIC_UNKNOWN;
}

function wicRefs(refs: ReadonlyArray<string>): string {
  return refs.length > 0 ? refs.join(", ") : WIC_UNKNOWN;
}

function WorkItemCandidateDetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div
      data-testid={`wic-detail-field-${k}`}
      data-field={k}
      className="flex items-start justify-between gap-2 text-[12px]"
    >
      <dt className="shrink-0 uppercase tracking-wide text-muted-foreground/60">{k}</dt>
      <dd className="min-w-0 break-all text-right text-zinc-300">{v}</dd>
    </div>
  );
}

function WorkItemCandidateLinkGraph({ item }: { item: WorkItemCandidate }) {
  return (
    <section data-testid="wic-link-graph" className="mt-2 rounded-md border border-white/[0.08] bg-white/[0.02] p-2">
      <p className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/45">
        Link graph · ref only
      </p>
      <div className="space-y-1 text-[12px] text-zinc-300">
        <div data-testid="wic-link-node-candidate" className="rounded bg-white/[0.04] px-1.5 py-1">
          candidate → {item.title}
        </div>
        <ul className="space-y-0.5">
          {item.sourceRefs.length > 0 ? (
            item.sourceRefs.map((ref, i) => (
              <li
                key={`source-${ref}-${i}`}
                data-testid={`wic-link-source-${i}`}
                className="flex items-center gap-1.5 text-muted-foreground"
              >
                <span className="text-zinc-400">candidate → sourceRef</span>
                <span className="min-w-0 flex-1 break-all text-zinc-300">{ref}</span>
                <span className="shrink-0 rounded bg-white/[0.05] px-1 text-[12px] uppercase">unresolved ref</span>
              </li>
            ))
          ) : (
            <li data-testid="wic-link-source-empty" className="text-muted-foreground/65">
              candidate → sourceRefs · {WIC_UNKNOWN}
            </li>
          )}
          {item.evidenceRefs.length > 0 ? (
            item.evidenceRefs.map((ref, i) => (
              <li
                key={`evidence-${ref}-${i}`}
                data-testid={`wic-link-evidence-${i}`}
                className="flex items-center gap-1.5 text-muted-foreground"
              >
                <span className="text-zinc-400">candidate → evidenceRef</span>
                <span className="min-w-0 flex-1 break-all text-zinc-300">{ref}</span>
                <span className="shrink-0 rounded bg-white/[0.05] px-1 text-[12px] uppercase">unresolved ref</span>
              </li>
            ))
          ) : (
            <li data-testid="wic-link-evidence-empty" className="text-muted-foreground/65">
              candidate → evidenceRefs · {WIC_UNKNOWN}
            </li>
          )}
          <li data-testid="wic-link-reason" className="flex items-center gap-1.5 text-muted-foreground">
            <span className="text-zinc-400">candidate → signal</span>
            <span className="min-w-0 flex-1 break-all text-zinc-300">
              {item.kind} · {item.reason}
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}

function WorkItemCandidateDraftEvidenceLinks({
  link,
}: {
  link?: CandidateDraftEvidenceLink;
}) {
  const matchedRefs = link?.matchedRefs ?? [];
  return (
    <section
      data-testid="wic-draft-cross-links"
      data-count={matchedRefs.length}
      className="mt-2 rounded-md border border-white/[0.08] bg-white/[0.02] p-2"
    >
      <p className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/45">
        Evidence Draft refs · read-only
      </p>
      {matchedRefs.length === 0 ? (
        <p
          data-testid="wic-draft-cross-link-empty"
          className="text-[12px] text-muted-foreground/65"
        >
          no matching draft evidence
        </p>
      ) : (
        <ul className="space-y-0.5">
          {matchedRefs.map((ref) => (
            <li
              key={ref.refId}
              data-testid={`wic-draft-cross-link-${ref.refId}`}
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground"
            >
              <span className="shrink-0 tabular-nums text-primary/70">[{ref.footnote}]</span>
              <code className="shrink-0 rounded bg-background/70 px-1">{ref.refId}</code>
              <span className="min-w-0 flex-1 truncate">{ref.label}</span>
              <span className="shrink-0 rounded bg-white/[0.05] px-1 text-[12px] uppercase">
                {ref.claimIds.length > 0 ? ref.claimIds.join(", ") : "claim unknown"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WorkItemCandidateRelationshipMapV2({
  item,
  draftLink,
  nextStepPreview,
  readiness,
}: {
  item: WorkItemCandidate;
  draftLink?: CandidateDraftEvidenceLink;
  nextStepPreview: WorkItemCandidateNextStepPreview;
  readiness: WorkItemCandidateReadiness;
}) {
  const matchedRefs = draftLink?.matchedRefs ?? [];
  const previewGapCount =
    nextStepPreview.missingSourceRefs.length + nextStepPreview.missingEvidenceRefs.length;
  return (
    <section
      data-testid="wic-relationship-map-v2"
      data-source-count={item.sourceRefs.length}
      data-evidence-count={item.evidenceRefs.length}
      data-draft-count={matchedRefs.length}
      data-readiness={readiness.readiness}
      className="mt-2 rounded-md border border-primary/15 bg-primary/[0.035] p-2"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-primary/70">
          Relationship map V2 · ref only
        </p>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[12px] uppercase text-primary/75">
          local detail
        </span>
      </div>
      <div className="space-y-1 text-[12px] text-zinc-300">
        <div data-testid="wic-map-v2-candidate" className="rounded bg-white/[0.04] px-1.5 py-1">
          candidate hub · {item.id} · {item.title}
        </div>

        <div className="rounded border border-white/[0.06] bg-white/[0.02] p-1">
          <p className="mb-0.5 text-[12px] uppercase tracking-wide text-muted-foreground/50">
            source refs
          </p>
          {item.sourceRefs.length > 0 ? (
            <ul className="space-y-0.5">
              {item.sourceRefs.map((ref, i) => (
                <li
                  key={`map-source-${ref}-${i}`}
                  data-testid={`wic-map-v2-source-${i}`}
                  className="flex items-center gap-1.5 text-muted-foreground"
                >
                  <span className="text-zinc-400">candidate {">"} sourceRef</span>
                  <span className="min-w-0 flex-1 break-all text-zinc-300">{ref}</span>
                  <span className="shrink-0 rounded bg-white/[0.05] px-1 text-[12px] uppercase">
                    ref only
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p data-testid="wic-map-v2-source-empty" className="text-muted-foreground/65">
              sourceRefs · {WIC_UNKNOWN}
            </p>
          )}
        </div>

        <div className="rounded border border-white/[0.06] bg-white/[0.02] p-1">
          <p className="mb-0.5 text-[12px] uppercase tracking-wide text-muted-foreground/50">
            evidence refs
          </p>
          {item.evidenceRefs.length > 0 ? (
            <ul className="space-y-0.5">
              {item.evidenceRefs.map((ref, i) => (
                <li
                  key={`map-evidence-${ref}-${i}`}
                  data-testid={`wic-map-v2-evidence-${i}`}
                  className="flex items-center gap-1.5 text-muted-foreground"
                >
                  <span className="text-zinc-400">candidate {">"} evidenceRef</span>
                  <span className="min-w-0 flex-1 break-all text-zinc-300">{ref}</span>
                  <span className="shrink-0 rounded bg-white/[0.05] px-1 text-[12px] uppercase">
                    ref only
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p data-testid="wic-map-v2-evidence-empty" className="text-muted-foreground/65">
              evidenceRefs · {WIC_UNKNOWN}
            </p>
          )}
        </div>

        <div className="rounded border border-white/[0.06] bg-white/[0.02] p-1">
          <p className="mb-0.5 text-[12px] uppercase tracking-wide text-muted-foreground/50">
            draft refs
          </p>
          {matchedRefs.length > 0 ? (
            <ul className="space-y-0.5">
              {matchedRefs.map((ref) => (
                <li
                  key={`map-draft-${ref.refId}`}
                  data-testid={`wic-map-v2-draft-${ref.refId}`}
                  className="flex items-center gap-1.5 text-muted-foreground"
                >
                  <span className="shrink-0 tabular-nums text-primary/70">[{ref.footnote}]</span>
                  <code className="shrink-0 rounded bg-background/70 px-1">{ref.refId}</code>
                  <span className="min-w-0 flex-1 truncate">{ref.label}</span>
                  <span className="shrink-0 rounded bg-white/[0.05] px-1 text-[12px] uppercase">
                    {ref.claimIds.length > 0 ? ref.claimIds.join(", ") : "claim unknown"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p data-testid="wic-map-v2-draft-empty" className="text-muted-foreground/65">
              no matching draft evidence
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1">
          <div
            data-testid="wic-map-v2-readiness"
            className="rounded border border-white/[0.06] bg-white/[0.02] p-1"
          >
            <p className="text-[12px] uppercase tracking-wide text-muted-foreground/50">readiness</p>
            <p className="break-all text-zinc-300">
              {readiness.readiness} · confidence {readiness.confidence}
            </p>
          </div>
          <div
            data-testid="wic-map-v2-preview"
            className="rounded border border-white/[0.06] bg-white/[0.02] p-1"
          >
            <p className="text-[12px] uppercase tracking-wide text-muted-foreground/50">preview</p>
            <p className="break-all text-zinc-300">
              preview only · {previewGapCount} gaps · not committed
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function WorkItemCandidateDetailDrawer({
  item,
  onClose,
  draftLink,
  runnerLink,
  patchLink,
  learningMemoryLink,
  nav,
}: {
  item: WorkItemCandidate | null;
  onClose: () => void;
  draftLink?: CandidateDraftEvidenceLink;
  runnerLink?: WorkItemCandidateRunnerCandidateLink;
  patchLink?: WorkItemCandidatePatchCandidateLink;
  learningMemoryLink?: WorkItemCandidateLearningMemoryCandidateLink;
  /** INB-B: prev/next over the candidate list (§6 UX-4 consecutive review). */
  nav?: InboxDrawerNav;
}) {
  const [activeTab, setActiveTab] = useState<WicDetailTab>("overview");
  // Reset to the first tab whenever the drawer targets a new candidate — including
  // prev/next (↑/↓) navigation, which swaps item.id while the drawer stays open.
  useEffect(() => {
    setActiveTab("overview");
  }, [item?.id]);

  return (
    <InboxDetailDrawerShell
      open={item != null}
      onClose={onClose}
      testid="work-item-candidate-detail-drawer"
      closeTestid="wic-detail-close"
      kind={item?.kind}
      width="w-80"
      ariaLabel="work item candidate detail"
      title="Work Item Candidate detail · read-only"
      nav={nav}
    >
      {item ? (
        <WorkItemCandidateDetailBody
          item={item}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          draftLink={draftLink}
          runnerLink={runnerLink}
          patchLink={patchLink}
          learningMemoryLink={learningMemoryLink}
        />
      ) : null}
    </InboxDetailDrawerShell>
  );
}

function WorkItemCandidateDetailBody({
  item,
  activeTab,
  setActiveTab,
  draftLink,
  runnerLink,
  patchLink,
  learningMemoryLink,
}: {
  item: WorkItemCandidate;
  activeTab: WicDetailTab;
  setActiveTab: (tab: WicDetailTab) => void;
  draftLink?: CandidateDraftEvidenceLink;
  runnerLink?: WorkItemCandidateRunnerCandidateLink;
  patchLink?: WorkItemCandidatePatchCandidateLink;
  learningMemoryLink?: WorkItemCandidateLearningMemoryCandidateLink;
}) {
  const nextStepPreview = buildWorkItemCandidateNextStepPreview(item, draftLink);
  const readiness = buildWorkItemCandidateReadiness(item, nextStepPreview, draftLink);
  const trace = buildWorkItemCandidateTrace(item, { draftLink, nextStepPreview, readiness });
  const signalSummary = buildWorkItemCandidateSignalSummary({
    candidate: item,
    link: draftLink,
    nextStepPreview,
    readiness,
  });
  const fields: WorkItemCandidateDetailField[] = [
    ["id", item.id],
    ["title", item.title],
    ["kind", item.kind],
    ["lane", item.lane],
    ["status", item.status],
    ["risk", item.risk],
    ["reason", item.reason],
    ["observed", String(item.observed)],
    ["createdAt", wicValue(item.createdAt)],
    ["sourceRefs", wicRefs(item.sourceRefs)],
    ["evidenceRefs", wicRefs(item.evidenceRefs)],
  ];

  return (
    <>
      <div
        role="tablist"
        aria-label="work item candidate detail sections"
        data-testid="wic-detail-tabs"
        data-active-tab={activeTab}
        className="mb-2 grid grid-cols-5 gap-1"
      >
        {WIC_DETAIL_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`wic-detail-tab-${tab.id}`}
              data-action-scope="local-detail"
              data-active={active ? "true" : "false"}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded border px-1 py-0.5 text-[12px] uppercase tracking-wide transition-colors ${
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <section
        data-testid="wic-detail-panel-overview"
        data-active={activeTab === "overview" ? "true" : "false"}
        hidden={activeTab !== "overview"}
      >
        <dl className="space-y-0.5">
          {fields.map(([k, v]) => (
            <WorkItemCandidateDetailRow key={k} k={k} v={v} />
          ))}
        </dl>
        <WorkItemCandidateSignalSummarySection summary={signalSummary} />
        <WorkItemCandidateRunnerSignalsSection link={runnerLink} />
        <WorkItemCandidatePatchSignalsSection link={patchLink} />
        <WorkItemCandidateLearningMemorySignalsSection link={learningMemoryLink} />
      </section>
      <section
        data-testid="wic-detail-panel-map"
        data-active={activeTab === "map" ? "true" : "false"}
        hidden={activeTab !== "map"}
      >
        <WorkItemCandidateLinkGraph item={item} />
        <WorkItemCandidateRelationshipMapV2
          item={item}
          draftLink={draftLink}
          nextStepPreview={nextStepPreview}
          readiness={readiness}
        />
        <WorkItemCandidateDraftEvidenceLinks link={draftLink} />
      </section>
      <section
        data-testid="wic-detail-panel-readiness"
        data-active={activeTab === "readiness" ? "true" : "false"}
        hidden={activeTab !== "readiness"}
      >
        <WorkItemCandidateReadinessSection readiness={readiness} />
      </section>
      <section
        data-testid="wic-detail-panel-preview"
        data-active={activeTab === "preview" ? "true" : "false"}
        hidden={activeTab !== "preview"}
      >
        <WorkItemCandidateNextStepPreviewCard preview={nextStepPreview} readiness={readiness} />
      </section>
      <section
        data-testid="wic-detail-panel-trace"
        data-active={activeTab === "trace" ? "true" : "false"}
        hidden={activeTab !== "trace"}
      >
        <WorkItemCandidateTraceTimeline trace={trace} />
      </section>
    </>
  );
}
