// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  WorkItemCandidateNextStepPreviewCard,
  WorkItemCandidateReadinessSection,
  WorkItemCandidateTraceTimeline,
} from "./WorkItemCandidateDetailSections";
import type { WorkItemCandidateNextStepPreview } from "../../lib/workItemCandidateNextStepPreview";
import type { WorkItemCandidateReadiness } from "../../lib/workItemCandidateReadiness";
import type { WorkItemCandidateTrace } from "../../lib/workItemCandidateTrace";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
} from "./inboxInvariant";

afterEach(() => cleanup());

const readiness: WorkItemCandidateReadiness = {
  candidateId: "wic-section",
  readiness: "needs-evidence",
  confidence: "low",
  label: "readiness · read-only",
  reasons: ["evidence refs missing"],
  missingSourceRefs: [],
  missingEvidenceRefs: ["evidence refs unknown"],
  riskBlockers: [],
  suggestedNextInspectionTarget: "Inspect evidence refs and related draft claims",
};

const preview: WorkItemCandidateNextStepPreview = {
  candidateId: "wic-section",
  title: "section candidate",
  lane: "soon",
  status: "candidate",
  risk: "medium",
  reason: "section extraction smoke",
  label: "preview only · not committed · no lifecycle transition",
  availableSourceRefs: ["source-ref"],
  availableEvidenceRefs: [],
  relatedDraftClaims: [],
  relatedDraftFootnotes: [],
  missingSourceRefs: [],
  missingEvidenceRefs: ["evidence refs unknown"],
  riskNotes: ["medium risk candidate"],
  suggestedOperatorNote: "Preview only; no lifecycle transition.",
};

const trace: WorkItemCandidateTrace = {
  candidateId: "wic-section",
  title: "section candidate",
  label: "trace timeline · read-only · ref only",
  empty: false,
  missing: [],
  events: [
    {
      id: "wic-section-source",
      kind: "source",
      label: "source ref · source-ref",
      timeLabel: "time unknown",
      ref: "source-ref",
      refStatus: "ref only · unresolved",
      details: [],
      order: 20,
    },
  ],
};

describe("WorkItemCandidate detail section components", () => {
  it("renders extracted readiness, next-step, and trace sections as read-only surfaces", () => {
    const { container } = render(
      <div>
        <WorkItemCandidateReadinessSection readiness={readiness} />
        <WorkItemCandidateNextStepPreviewCard preview={preview} readiness={readiness} />
        <WorkItemCandidateTraceTimeline trace={trace} />
      </div>,
    );

    expect(screen.getByTestId("wic-readiness-section").textContent).toContain("needs-evidence");
    expect(screen.getByTestId("wic-next-step-preview").textContent).toContain("not committed");
    expect(screen.getByTestId("wic-trace-timeline").textContent).toContain("ref only");
    assertNoSideEffectActionControls(container);
    assertNoForbiddenActionText(container);
  });
});
