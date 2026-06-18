// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
} from "./inboxInvariant";
import type { PatchCandidateInput } from "../../lib/plugins/patchCandidateSource";

afterEach(() => cleanup());

const patchCandidates: PatchCandidateInput[] = [
  {
    candidateId: "patch-001",
    runnerId: "runner-alpha",
    missionId: "mission-alpha",
    createdAt: "2026-06-18T12:00:00.000Z",
    changedFileCount: 2,
    additions: 12,
    deletions: 3,
    safetyStatus: "blocked",
    verificationStatus: "not_run",
    source: "runner",
    observed: true,
    files: [
      { path: "src/app.tsx", change: "modified", additions: 10, deletions: 2 },
      { path: "src/app.test.tsx", change: "modified", additions: 2, deletions: 1 },
    ],
    evidenceRefs: ["ev-risk"],
  },
];

function renderPatchSignals() {
  return render(<AssistantInboxContainer live={{ patchCandidates }} />);
}

describe("E17 — WorkItem Candidate patch signal UI", () => {
  it("renders patch signal chips on candidate rows and Patch Candidate counts", () => {
    renderPatchSignals();

    expect(screen.getByTestId("wic-patch-signal-chip-wic-patch-patch-001").textContent).toContain(
      "patch-blocked",
    );
    const patchRow = screen.getByTestId("patch-candidate-patch-001");
    expect(
      within(patchRow).getByTestId("patch-candidate-workitem-count-patch-001").textContent,
    ).toContain("1 candidate");
  });

  it("shows patch signals in the candidate detail drawer as read-only", () => {
    renderPatchSignals();

    fireEvent.click(screen.getByTestId("wic-row-wic-patch-patch-001"));
    const drawer = screen.getByTestId("work-item-candidate-detail-drawer");
    const section = within(drawer).getByTestId("wic-patch-signals-section");

    expect(section.textContent).toContain("Patch Signals");
    expect(section.textContent).toContain("patch-001");
    expect(section.textContent).toContain("blocked");
    expect(section.textContent).toContain("verification pending");
    expect(section.textContent).toContain("2 files");
    expect(
      within(section)
        .getByTestId("wic-patch-signal-patch-001-patch-blocked")
        .getAttribute("data-verification"),
    ).toBe("not_run");
    assertNoSideEffectActionControls(section);
    assertNoForbiddenActionText(section);
  });
});
