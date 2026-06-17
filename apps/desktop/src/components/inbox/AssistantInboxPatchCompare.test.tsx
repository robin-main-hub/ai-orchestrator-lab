// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
} from "./inboxInvariant";
import type { PatchCandidateInput } from "../../lib/plugins/patchCandidateSource";

afterEach(() => cleanup());

// Batch 20 — Patch Candidate Comparison V2: a read-only compare board behind a
// local-view toggle. Lanes / file-overlap heatmap / verification deltas / reason
// chips. No apply/commit/dispatch anywhere.

const live: PatchCandidateInput[] = [
  {
    candidateId: "patch-safe",
    runnerId: "runner-001",
    missionId: "mission-001",
    changedFileCount: 1,
    additions: 4,
    deletions: 1,
    safetyStatus: "pass",
    verificationStatus: "actual",
    source: "runner",
    observed: true,
    files: [{ path: "src/shared.ts", change: "modified", additions: 4, deletions: 1 }],
    claimedTests: { ran: true, passed: 6, failed: 0 },
    actualTests: { status: "actual", summary: "6 passed" },
  },
  {
    candidateId: "patch-risk",
    runnerId: "runner-002",
    missionId: "mission-001",
    changedFileCount: 1,
    additions: 120,
    deletions: 0,
    safetyStatus: "blocked",
    verificationStatus: "not_run",
    source: "runner",
    observed: false,
    files: [{ path: "src/shared.ts", change: "modified", additions: 120, deletions: 0 }],
    safetyBlockers: ["not_observed"],
    claimedTests: { ran: true, passed: 2, failed: 0 },
    actualTests: { status: "not_run" },
  },
];

describe("Batch 20 — patch compare board (toggle + lanes)", () => {
  it("the Compare toggle is a local-view control; board hidden until opened", () => {
    render(<AssistantInboxContainer live={{ patchCandidates: live }} />);
    const toggle = screen.getByTestId("patch-compare-toggle");
    expect(toggle.getAttribute("data-action-scope")).toBe("local-view");
    expect(screen.queryByTestId("patch-compare-board")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByTestId("patch-compare-board")).toBeTruthy();
  });

  it("buckets candidates into safe / watch / risk lanes", () => {
    render(<AssistantInboxContainer live={{ patchCandidates: live }} />);
    fireEvent.click(screen.getByTestId("patch-compare-toggle"));
    expect(screen.getByTestId("patch-lane-safe").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("patch-lane-risk").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("patch-lane-safe-patch-safe")).toBeTruthy();
    expect(screen.getByTestId("patch-lane-risk-patch-risk")).toBeTruthy();
  });

  it("shows a file-overlap heatmap (shared file touched by both → overlap)", () => {
    render(<AssistantInboxContainer live={{ patchCandidates: live }} />);
    fireEvent.click(screen.getByTestId("patch-compare-toggle"));
    const heat = screen.getByTestId("patch-heat-src/shared.ts");
    expect(heat.getAttribute("data-count")).toBe("2");
    expect(heat.getAttribute("data-overlap")).toBe("true");
  });

  it("flags a claimed-clean / actual-unconfirmed verification mismatch", () => {
    render(<AssistantInboxContainer live={{ patchCandidates: live }} />);
    fireEvent.click(screen.getByTestId("patch-compare-toggle"));
    // patch-risk claims 2/0 but actual not_run → mismatch
    expect(screen.getByTestId("patch-delta-mismatch-patch-risk")).toBeTruthy();
    // patch-safe confirmed actual → no mismatch flag
    expect(screen.queryByTestId("patch-delta-mismatch-patch-safe")).toBeNull();
  });

  it("the open board is read-only (no buttons, no side-effect/domain text)", () => {
    render(<AssistantInboxContainer live={{ patchCandidates: live }} />);
    fireEvent.click(screen.getByTestId("patch-compare-toggle"));
    const board = screen.getByTestId("patch-compare-board");
    expect(board.querySelectorAll("button").length).toBe(0);
    assertNoForbiddenActionText(board);
  });

  it("the whole lane stays side-effect-free with the board open", () => {
    render(<AssistantInboxContainer live={{ patchCandidates: live }} />);
    fireEvent.click(screen.getByTestId("patch-compare-toggle"));
    assertNoSideEffectActionControls(screen.getByTestId("patch-candidate-lane"));
  });

  it("no Compare toggle for a single candidate", () => {
    render(<AssistantInboxContainer live={{ patchCandidates: [live[0]!] }} />);
    expect(screen.queryByTestId("patch-compare-toggle")).toBeNull();
  });
});
