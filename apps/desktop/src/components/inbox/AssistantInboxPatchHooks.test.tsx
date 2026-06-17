// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { buildInboxPaletteCommands } from "../../lib/inboxPaletteCommands";
import { assertNoSideEffectActionControls } from "./inboxInvariant";
import type { PatchCandidateInput } from "../../lib/plugins/patchCandidateSource";

beforeEach(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

const patch = (over: Partial<PatchCandidateInput> = {}): PatchCandidateInput => ({
  candidateId: "patch-001",
  runnerId: "runner-001",
  missionId: "mission-001",
  changedFileCount: 1,
  additions: 5,
  deletions: 1,
  safetyStatus: "pass",
  verificationStatus: "actual",
  source: "runner",
  observed: true,
  ...over,
});

describe("Batch 17 LINE D — palette + deck jump (view/focus only)", () => {
  it("palette exposes a view-only 'Patch Candidates 열기' that dispatches focusSection", () => {
    const dispatch = vi.fn();
    const cmds = buildInboxPaletteCommands({ goInbox: vi.fn(), dispatch, applyView: vi.fn() });
    const entry = cmds.find((c) => c.id === "inbox.patchCandidates")!;
    expect(entry.label).toBe("Patch Candidates 열기");
    expect(entry.hint).toContain("적용 없음");
    entry.run();
    expect(dispatch).toHaveBeenCalledWith("focusSection", "patch-candidates");
  });

  it("the focusSection command scrolls the lane without changing the seat", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<AssistantInboxContainer command={{ kind: "focusSection", value: "patch-candidates", nonce: 1 }} />);
    expect(spy).toHaveBeenCalled();
    expect(screen.getByTestId("assistant-inbox-status-strip").getAttribute("data-mode")).toBe(
      "preview",
    );
  });

  it("the command deck Patch Candidates button is a local-view control", () => {
    render(<AssistantInboxContainer />);
    expect(
      screen.getByTestId("command-deck-patch-candidates").getAttribute("data-action-scope"),
    ).toBe("local-view");
  });

  it("empty LIVE lane → jump is an honest no-op", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    render(
      <AssistantInboxContainer
        live={{}}
        command={{ kind: "focusSection", value: "patch-candidates", nonce: 1 }}
      />,
    );
    expect(screen.queryByTestId("patch-candidate-lane")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("Batch 17 LINE D — patch lane filters (local-view)", () => {
  it("Blocked filter lists only blocked candidates; All restores", () => {
    render(<AssistantInboxContainer />); // mixed example: 001 pass, 002 warning, 003 blocked
    fireEvent.click(screen.getByTestId("patch-ctl-blocked"));
    expect(screen.getByTestId("patch-candidate-patch-003")).toBeTruthy();
    expect(screen.queryByTestId("patch-candidate-patch-001")).toBeNull();
    fireEvent.click(screen.getByTestId("patch-ctl-all"));
    expect(screen.getByTestId("patch-candidate-patch-001")).toBeTruthy();
  });

  it("Warning filter lists only warning candidates", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("patch-ctl-warning"));
    expect(screen.getByTestId("patch-candidate-patch-002")).toBeTruthy();
    expect(screen.queryByTestId("patch-candidate-patch-001")).toBeNull();
  });

  it("filter controls are all local-view; the lane stays side-effect-free", () => {
    render(<AssistantInboxContainer />);
    const lane = screen.getByTestId("patch-candidate-lane");
    assertNoSideEffectActionControls(lane);
    for (const k of ["all", "blocked", "warning", "runner"]) {
      expect(screen.getByTestId(`patch-ctl-${k}`).getAttribute("data-action-scope")).toBe(
        "local-view",
      );
    }
  });
});

describe("Batch 17 LINE E — patch comparison strip", () => {
  it("with >1 candidate, shows count / safest / blocked / warning", () => {
    render(<AssistantInboxContainer />); // 3 example candidates
    const strip = screen.getByTestId("patch-comparison-strip");
    expect(screen.getByTestId("patch-cmp-count").getAttribute("data-count")).toBe("3");
    expect(screen.getByTestId("patch-cmp-blocked").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("patch-cmp-warning").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("patch-cmp-safest").getAttribute("data-safest")).toBe("patch-001");
    // the strip is display-only
    expect(strip.querySelectorAll("button").length).toBe(0);
  });

  it("with a single candidate, no comparison strip", () => {
    render(<AssistantInboxContainer live={{ patchCandidates: [patch({ candidateId: "patch-solo" })] }} />);
    expect(screen.getByTestId("patch-candidate-patch-solo")).toBeTruthy();
    expect(screen.queryByTestId("patch-comparison-strip")).toBeNull();
  });
});
