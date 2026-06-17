// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { assertNoSideEffectActionControls } from "./inboxInvariant";

afterEach(() => cleanup());

// Batch 21 — Replay Timeline V2: a read-only, time-clustered REPLAY view behind a
// local-view list/timeline toggle, with a local scrubber. No EventStorage/server write.

// two clusters: three events ~minutes apart, then one event 2h earlier.
const EVENTS = [
  { id: "e1", type: "runner.completed", createdAt: "2026-06-18T10:00:00.000Z", source: "eventLog" },
  { id: "e2", type: "runner.failed", createdAt: "2026-06-18T10:03:00.000Z", source: "eventLog" },
  { id: "e3", type: "learning.recorded", createdAt: "2026-06-18T10:06:00.000Z", source: "eventLog" },
  { id: "e4", type: "system.note", createdAt: "2026-06-18T08:00:00.000Z", source: "eventLog" },
];

const replay = () =>
  render(
    <AssistantInboxContainer
      live={{ recentEvents: EVENTS, nowMs: 1750241200000 }}
      command={{ kind: "mode", value: "replay", nonce: 1 }}
    />,
  );

describe("Batch 21 — Replay Timeline V2", () => {
  it("defaults to the list view (existing replay UX preserved)", () => {
    replay();
    expect(screen.getByTestId("replay-deck")).toBeTruthy();
    expect(screen.queryByTestId("replay-timeline")).toBeNull(); // list by default
    expect(screen.getByTestId("replay-view-list").getAttribute("data-action-scope")).toBe(
      "local-view",
    );
  });

  it("toggling Timeline renders time clusters (newest cluster first)", () => {
    replay();
    fireEvent.click(screen.getByTestId("replay-view-timeline"));
    const tl = screen.getByTestId("replay-timeline");
    expect(tl.getAttribute("data-clusters")).toBe("2");
    // newest cluster (10:00–10:06) has 3 events; older (08:00) has 1
    expect(screen.getByTestId("replay-cluster-0").getAttribute("data-count")).toBe("3");
    expect(screen.getByTestId("replay-cluster-1").getAttribute("data-count")).toBe("1");
  });

  it("the scrubber moves the active cluster (local view state only)", () => {
    replay();
    fireEvent.click(screen.getByTestId("replay-view-timeline"));
    expect(screen.getByTestId("replay-cluster-0").getAttribute("data-active")).toBe("true");
    fireEvent.change(screen.getByTestId("replay-scrubber"), { target: { value: "1" } });
    expect(screen.getByTestId("replay-scrubber-pos").textContent).toContain("2/2");
    expect(screen.getByTestId("replay-cluster-1").getAttribute("data-active")).toBe("true");
  });

  it("respects the category filter (timeline reflects the same filtered set)", () => {
    replay();
    fireEvent.click(screen.getByTestId("replay-view-timeline"));
    // filter to 'failure' → only e2 remains → a single 1-event cluster
    fireEvent.click(screen.getByTestId("replay-filter-failure"));
    expect(screen.getByTestId("replay-timeline").getAttribute("data-clusters")).toBe("1");
    expect(screen.getByTestId("replay-cluster-0").getAttribute("data-count")).toBe("1");
  });

  it("the replay seat stays side-effect-free with the timeline open", () => {
    const { container } = replay();
    fireEvent.click(screen.getByTestId("replay-view-timeline"));
    assertNoSideEffectActionControls(container);
  });
});
