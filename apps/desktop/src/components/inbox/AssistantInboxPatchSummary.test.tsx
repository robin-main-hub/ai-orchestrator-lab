// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { assertNoSideEffectActionControls, assertNoForbiddenActionText } from "./inboxInvariant";
import type { PatchCandidateInput } from "../../lib/plugins/patchCandidateSource";

beforeEach(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

const patch = (over: Partial<PatchCandidateInput> = {}): PatchCandidateInput => ({
  candidateId: "patch-x",
  runnerId: "runner-001",
  missionId: "mission-001",
  changedFileCount: 1,
  additions: 5,
  deletions: 1,
  safetyStatus: "pass",
  verificationStatus: "actual",
  source: "runner",
  observed: true,
  claimedTests: { ran: true, passed: 3, failed: 0 },
  ...over,
});

describe("Batch 18 LINE C — patch summary / health strip", () => {
  it("PREVIEW shows the health summary (total/pass/warn/blocked + observed/verification)", () => {
    render(<AssistantInboxContainer />); // mixed fixtures: pass + warning + blocked
    const strip = screen.getByTestId("patch-summary-strip");
    expect(strip).toBeTruthy();
    expect(screen.getByTestId("patch-sum-total").getAttribute("data-count")).toBe("3");
    expect(screen.getByTestId("patch-sum-pass").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("patch-sum-warning").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("patch-sum-blocked").getAttribute("data-count")).toBe("1");
    // fixtures: patch-001 observed, patch-002 observed, patch-003 not observed
    expect(screen.getByTestId("patch-sum-observed").getAttribute("data-count")).toBe("2");
    expect(screen.getByTestId("patch-sum-not-observed").getAttribute("data-count")).toBe("1");
    // strip is display-only
    expect(strip.querySelectorAll("button").length).toBe(0);
  });

  it("the summary strip shows for a single candidate too (health overview)", () => {
    render(<AssistantInboxContainer live={{ patchCandidates: [patch()] }} />);
    expect(screen.getByTestId("patch-summary-strip")).toBeTruthy();
    expect(screen.getByTestId("patch-sum-total").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("patch-sum-claimed").getAttribute("data-count")).toBe("1");
    // comparison strip stays >1 only
    expect(screen.queryByTestId("patch-comparison-strip")).toBeNull();
  });

  it("no domain/side-effect text in the summary strip", () => {
    render(<AssistantInboxContainer />);
    assertNoForbiddenActionText(screen.getByTestId("patch-summary-strip"));
  });
});

describe("Batch 18 LINE D — deck/palette/filter polish (view-only)", () => {
  it("all four lane filters are local-view and narrow the list", () => {
    render(<AssistantInboxContainer />);
    for (const k of ["all", "blocked", "warning", "runner"]) {
      expect(screen.getByTestId(`patch-ctl-${k}`).getAttribute("data-action-scope")).toBe("local-view");
    }
    // Runner filter → only source==="runner" candidates (fixtures: 001 runner, 002 handoff, 003 runner)
    fireEvent.click(screen.getByTestId("patch-ctl-runner"));
    expect(screen.getByTestId("patch-candidate-patch-001")).toBeTruthy();
    expect(screen.queryByTestId("patch-candidate-patch-002")).toBeNull(); // handoff source hidden
    expect(screen.getByTestId("patch-candidate-patch-003")).toBeTruthy();
  });

  it("the deck Patch Candidates jump scrolls the lane (view-only) and the whole inbox stays clean", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    const { container } = render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("command-deck-patch-candidates"));
    expect(spy).toHaveBeenCalled();
    assertNoSideEffectActionControls(container);
  });
});
