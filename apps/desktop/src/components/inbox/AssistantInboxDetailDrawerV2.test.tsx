// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WorkItemCandidateDetailDrawer } from "./WorkItemCandidateDetailDrawer";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { assertNoSideEffectActionControls } from "./inboxInvariant";
import { projectWorkItemCandidates } from "../../lib/workItemCandidate";
import type { WorkItemCandidateInput } from "../../lib/workItemCandidate";

afterEach(() => cleanup());

const DRAWER = "work-item-candidate-detail-drawer";
const cand = projectWorkItemCandidates([
  {
    id: "solo",
    title: "solo candidate",
    kind: "source",
    lane: "soon",
    status: "candidate",
    risk: "low",
    reason: "r",
  },
])[0]!;

const fieldId = () => screen.getByTestId("wic-detail-field-id").textContent ?? "";
const nextCtl = () => screen.getByTestId(`${DRAWER}-next`);
const prevCtl = () => screen.getByTestId(`${DRAWER}-prev`);

// INB-B — detail drawer v2: useDialogFocus (trap/backdrop/Escape/restore), prev/next
// navigation + document-level ↑/↓ list review (§6 UX-4 / R1 대안 A), hidden tab panels.
describe("INB-B — inbox detail drawer v2 (component-level nav mechanics)", () => {
  it("is a modal dialog with a backdrop that closes on click (useDialogFocus + U8 scrim)", () => {
    const onClose = vi.fn();
    render(<WorkItemCandidateDetailDrawer item={cand} onClose={onClose} />);
    const drawer = screen.getByTestId(DRAWER);
    expect(drawer.getAttribute("role")).toBe("dialog");
    expect(drawer.getAttribute("aria-modal")).toBe("true");
    fireEvent.click(screen.getByTestId(`${DRAWER}-backdrop`));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape closes via the shared useDialogFocus trap", () => {
    const onClose = vi.fn();
    render(<WorkItemCandidateDetailDrawer item={cand} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the position readout and fires prev/next from the header controls", () => {
    const calls = { prev: 0, next: 0 };
    render(
      <WorkItemCandidateDetailDrawer
        item={cand}
        onClose={() => {}}
        nav={{
          position: "2 / 5",
          hasPrev: true,
          hasNext: true,
          onPrev: () => calls.prev++,
          onNext: () => calls.next++,
        }}
      />,
    );
    expect(screen.getByTestId(`${DRAWER}-position`).textContent).toContain("2 / 5");
    fireEvent.click(nextCtl());
    fireEvent.click(prevCtl());
    expect(calls).toEqual({ prev: 1, next: 1 });
  });

  it("↑/↓ keys review consecutive rows while the drawer stays open (UX-4)", () => {
    const calls = { prev: 0, next: 0 };
    render(
      <WorkItemCandidateDetailDrawer
        item={cand}
        onClose={() => {}}
        nav={{
          position: "2 / 5",
          hasPrev: true,
          hasNext: true,
          onPrev: () => calls.prev++,
          onNext: () => calls.next++,
        }}
      />,
    );
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(calls).toEqual({ prev: 1, next: 2 });
    // still mounted — no open/close round-trip
    expect(screen.getByTestId(DRAWER)).toBeTruthy();
  });

  it("respects bounds: prev disabled at head, next disabled at tail, ↑/↓ no-op past the edge", () => {
    const calls = { prev: 0, next: 0 };
    render(
      <WorkItemCandidateDetailDrawer
        item={cand}
        onClose={() => {}}
        nav={{
          position: "1 / 3",
          hasPrev: false,
          hasNext: true,
          onPrev: () => calls.prev++,
          onNext: () => calls.next++,
        }}
      />,
    );
    expect(prevCtl().getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(document, { key: "ArrowUp" }); // at head → suppressed
    fireEvent.click(prevCtl()); // disabled → no handler
    expect(calls.prev).toBe(0);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(calls.next).toBe(1);
  });

  it("renders no nav chrome when nav is absent", () => {
    render(<WorkItemCandidateDetailDrawer item={cand} onClose={() => {}} />);
    expect(screen.queryByTestId(`${DRAWER}-nav`)).toBeNull();
    expect(screen.queryByTestId(`${DRAWER}-position`)).toBeNull();
  });

  it("switches tabs with only the active panel visible (hidden inactive)", () => {
    render(<WorkItemCandidateDetailDrawer item={cand} onClose={() => {}} />);
    expect((screen.getByTestId("wic-detail-panel-overview") as HTMLElement).hidden).toBe(false);
    expect((screen.getByTestId("wic-detail-panel-map") as HTMLElement).hidden).toBe(true);
    fireEvent.click(screen.getByTestId("wic-detail-tab-map"));
    expect((screen.getByTestId("wic-detail-panel-overview") as HTMLElement).hidden).toBe(true);
    expect((screen.getByTestId("wic-detail-panel-map") as HTMLElement).hidden).toBe(false);
  });

  it("adds zero DOM when nothing is selected (button-free scan preserved)", () => {
    const { container } = render(<WorkItemCandidateDetailDrawer item={null} onClose={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("keeps nav + close as local-detail scoped role=button divs (no side-effect controls)", () => {
    render(
      <WorkItemCandidateDetailDrawer
        item={cand}
        onClose={() => {}}
        nav={{ position: "1 / 2", hasPrev: false, hasNext: true, onPrev: () => {}, onNext: () => {} }}
      />,
    );
    const drawer = screen.getByTestId(DRAWER);
    assertNoSideEffectActionControls(drawer);
    for (const id of [`${DRAWER}-prev`, `${DRAWER}-next`, "wic-detail-close"]) {
      const ctl = screen.getByTestId(id);
      expect(ctl.getAttribute("role")).toBe("button");
      expect(ctl.tagName.toLowerCase()).not.toBe("button");
      expect(ctl.getAttribute("data-action-scope")).toBe("local-detail");
    }
  });
});

const inbox = (extra: WorkItemCandidateInput[]) =>
  render(<AssistantInboxContainer live={{ workItemCandidates: extra }} />);

const three: WorkItemCandidateInput[] = [
  { id: "wic-a", title: "alpha", kind: "source", lane: "soon", status: "candidate", risk: "low", reason: "a" },
  { id: "wic-b", title: "bravo", kind: "memory", lane: "watch", status: "candidate", risk: "medium", reason: "b" },
  { id: "wic-c", title: "charlie", kind: "runner", lane: "now", status: "candidate", risk: "high", reason: "c" },
];

describe("INB-B — inbox detail drawer v2 (candidate-list wiring)", () => {
  it("wires prev/next over the full candidate list so ↑/↓ can review every candidate", () => {
    inbox(three);
    fireEvent.click(screen.getByTestId("wic-row-wic-a"));
    expect(screen.getByTestId(`${DRAWER}-position`).textContent).toMatch(/\/ 3$/);

    // walk to the head, then sweep to the tail collecting each distinct candidate.
    let guard = 0;
    while (prevCtl().getAttribute("aria-disabled") !== "true" && guard++ < 8) fireEvent.click(prevCtl());
    const seen = new Set<string>([fieldId()]);
    guard = 0;
    while (nextCtl().getAttribute("aria-disabled") !== "true" && guard++ < 8) {
      fireEvent.click(nextCtl());
      seen.add(fieldId());
    }
    expect(seen.size).toBe(3);
    // the drawer never closed during the sweep
    expect(screen.getByTestId(DRAWER)).toBeTruthy();
  });

  it("↑/↓ walk the candidate list from the container wiring", () => {
    inbox(three);
    fireEvent.click(screen.getByTestId("wic-row-wic-a"));
    const start = fieldId();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(fieldId()).not.toBe(start);
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(fieldId()).toBe(start);
    expect(screen.getByTestId(DRAWER)).toBeTruthy();
  });

  it("opening a work-item candidate closes an open source detail drawer (U8 dialog 동시 1)", () => {
    render(<AssistantInboxContainer />); // default seat renders both patch + candidate rows
    // a patch candidate row opens the source-detail drawer
    fireEvent.click(screen.getByTestId("patch-candidate-patch-001"));
    expect(screen.getByTestId("source-detail-drawer")).toBeTruthy();
    // opening a work-item candidate must close the source drawer (single dialog)
    const wicRow = screen.getAllByTestId(/^wic-row-/)[0];
    fireEvent.click(wicRow!);
    expect(screen.getByTestId(DRAWER)).toBeTruthy();
    expect(screen.queryByTestId("source-detail-drawer")).toBeNull();
  });
});
