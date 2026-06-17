// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
  collectActionControls,
} from "./inboxInvariant";
import type { PatchCandidateInput } from "../../lib/plugins/patchCandidateSource";

afterEach(() => cleanup());

// Batch 17 LINE A — Patch Candidate Speed Lane: a fast, read-only review surface.
// No apply/commit/dispatch anywhere; blocked candidates stay inspectable.

const live = (over: Partial<PatchCandidateInput> = {}): PatchCandidateInput => ({
  candidateId: "patch-501",
  runnerId: "runner-007",
  missionId: "mission-009",
  changedFileCount: 3,
  additions: 22,
  deletions: 5,
  safetyStatus: "pass",
  verificationStatus: "actual",
  source: "runner",
  observed: true,
  ...over,
});

describe("Batch 17 LINE A — patch candidate lane", () => {
  it("PREVIEW shows the example lane with safety/verification/source fields", () => {
    render(<AssistantInboxContainer />); // PREVIEW fixtures
    expect(screen.getByTestId("patch-candidate-lane")).toBeTruthy();
    expect(screen.getByTestId("patch-candidate-patch-001")).toBeTruthy();
    expect(screen.getByTestId("patch-safety-patch-001").getAttribute("data-safety")).toBe("pass");
    expect(screen.getByTestId("patch-verify-patch-001").getAttribute("data-verification")).toBe(
      "actual",
    );
    expect(screen.getByTestId("patch-files-patch-001").getAttribute("data-count")).toBe("2");
  });

  it("a blocked candidate renders, is marked blocked, and exposes NO apply control", () => {
    render(<AssistantInboxContainer />);
    const blocked = screen.getByTestId("patch-candidate-patch-003");
    expect(blocked.getAttribute("data-safety")).toBe("blocked");
    expect(blocked.getAttribute("data-blocked")).toBe("true");
    // the row is clickable to inspect (local-detail) but carries no apply/commit/dispatch
    const controls = collectActionControls(blocked);
    expect(controls.every((c) => c.getAttribute("data-action-scope") === "local-detail")).toBe(true);
  });

  it("LIVE reflects only real patch input", () => {
    render(<AssistantInboxContainer live={{ patchCandidates: [live()] }} />);
    expect(screen.getByTestId("patch-candidate-patch-501")).toBeTruthy();
    // PREVIEW example candidates must not leak into LIVE
    expect(screen.queryByTestId("patch-candidate-patch-001")).toBeNull();
  });

  it("LIVE empty → no lane (honest empty)", () => {
    render(<AssistantInboxContainer live={{}} />);
    expect(screen.queryByTestId("patch-candidate-lane")).toBeNull();
  });

  it("the lane is read-only: scoped controls only, no side-effect action text", () => {
    render(<AssistantInboxContainer />);
    const lane = screen.getByTestId("patch-candidate-lane");
    assertNoSideEffectActionControls(lane);
    assertNoForbiddenActionText(lane);
    // every interactive control in the lane is a local-detail row activation (no apply button)
    const controls = collectActionControls(lane);
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every((c) => c.getAttribute("data-action-scope") === "local-detail")).toBe(true);
  });
});
