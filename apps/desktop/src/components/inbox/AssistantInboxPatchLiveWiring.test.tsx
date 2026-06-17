// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { patchCandidateFromHandoff } from "../../lib/patchHandoffToCandidate";
import type { RunnerPatchHandoff } from "../../lib/runnerPatchHandoff";
import type { RunnerPatchSafetyReport } from "../../lib/runnerPatchSafety";

afterEach(() => cleanup());

// Batch 18 LINE B — the LIVE projection seam carries mapped real H8 handoffs into
// the Patch Candidate lane (read-only), honest-empty when absent, no PREVIEW leak.

const handoff = (over: Partial<RunnerPatchHandoff> = {}): RunnerPatchHandoff => ({
  id: "patch_mission-009_2026-06-18T11:00:00.000Z",
  missionId: "mission-009",
  repoRoot: "/repo",
  runnerId: "runner-007",
  createdAt: "2026-06-18T11:00:00.000Z",
  files: [{ path: "src/feature.ts", change: "modified", additions: 18, deletions: 4, diff: "@@ secret-ish @@" }],
  unifiedDiff: "diff --git a/src/feature.ts b/src/feature.ts",
  stats: { files: 1, additions: 18, deletions: 4 },
  testResult: { ran: true, passed: 9, failed: 0 },
  applicable: true,
  requiresApproval: true,
  blockers: [],
  warnings: [],
  ...over,
});

const passSafety: RunnerPatchSafetyReport = {
  status: "pass",
  secretScan: { status: "pass", findings: [] },
  pathPolicy: { status: "pass", allowedPaths: ["src/"], deniedPaths: [], violations: [] },
  verification: {
    runnerClaimedTests: { ran: true, passed: 9, failed: 0 },
    actualVerification: { status: "passed", summary: "9 passed" },
    mismatch: false,
  },
};

describe("Batch 18 LINE B — LIVE patch candidate wiring", () => {
  it("a mapped real handoff appears as a LIVE read-only candidate", () => {
    const candidate = patchCandidateFromHandoff(handoff(), passSafety);
    render(<AssistantInboxContainer live={{ patchCandidates: [candidate] }} />);
    const lane = screen.getByTestId("patch-candidate-lane");
    expect(lane).toBeTruthy();
    const row = screen.getByTestId(`patch-candidate-${candidate.candidateId}`);
    expect(row.getAttribute("data-safety")).toBe("pass");
    expect(screen.getByTestId(`patch-verify-${candidate.candidateId}`).getAttribute("data-verification")).toBe(
      "actual",
    );
    // no raw diff body leaked into the rendered lane
    expect(lane.textContent).not.toContain("@@");
    expect(lane.textContent).not.toContain("secret-ish");
  });

  it("a blocked mapped handoff is inspectable but exposes no apply control", () => {
    const blocked = patchCandidateFromHandoff(
      handoff({ applicable: false, blockers: ["not_observed"] }),
    );
    render(<AssistantInboxContainer live={{ patchCandidates: [blocked] }} />);
    const row = screen.getByTestId(`patch-candidate-${blocked.candidateId}`);
    expect(row.getAttribute("data-blocked")).toBe("true");
    expect(row.querySelectorAll("button").length).toBe(0);
  });

  it("LIVE with no patch candidates → no lane (honest empty)", () => {
    render(<AssistantInboxContainer live={{}} />);
    expect(screen.queryByTestId("patch-candidate-lane")).toBeNull();
  });

  it("PREVIEW fixture candidates never leak into a LIVE seat", () => {
    const candidate = patchCandidateFromHandoff(handoff(), passSafety);
    render(<AssistantInboxContainer live={{ patchCandidates: [candidate] }} />);
    // the Batch 17 PREVIEW fixtures (patch-001..003) must not appear in LIVE
    expect(screen.queryByTestId("patch-candidate-patch-001")).toBeNull();
    expect(screen.getByTestId(`patch-candidate-${candidate.candidateId}`)).toBeTruthy();
  });
});
