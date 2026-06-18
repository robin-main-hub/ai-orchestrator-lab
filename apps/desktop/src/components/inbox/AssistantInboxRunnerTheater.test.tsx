// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { assertNoSideEffectActionControls, assertNoForbiddenActionText } from "./inboxInvariant";
import type { RunnerSessionInput } from "../../lib/runnerTheater";

afterEach(() => cleanup());

// Engine E2 — Runner Theater: a read-only operations theater over REAL runner /
// mission state (workbenchMissionStore snapshot), wired through live.runnerSessions.

const liveSession: RunnerSessionInput = {
  id: "ms-live-1",
  title: "live runner working",
  role: "Implementer",
  agent: "implementer",
  model: "m",
  status: "running",
  heartbeat: "2026-06-18T11:59:30.000Z",
  lastOutput: "editing entity-001",
  events: [{ id: "e", at: "2026-06-18T11:50:00.000Z", text: "started" }],
  artifacts: ["changes.diff"],
  worktree: { branch: "agent/live-1" },
};

describe("E2 — Runner Theater card", () => {
  it("PREVIEW shows the example runner sessions grouped by lane", () => {
    render(<AssistantInboxContainer />); // PREVIEW
    const card = screen.getByTestId("runner-theater-card");
    expect(card).toBeTruthy();
    expect(card.getAttribute("data-total")).toBe("3");
    expect(screen.getByTestId("runner-theater-lane-active")).toBeTruthy();
    expect(screen.getByTestId("runner-theater-lane-attention")).toBeTruthy();
    expect(screen.getByTestId("runner-theater-row-ms-001").getAttribute("data-liveness")).toBe("live");
    expect(screen.getByTestId("runner-theater-row-ms-002").getAttribute("data-liveness")).toBe("stale");
  });

  it("LIVE projects ONLY real runner sessions passed in (no fixture leak)", () => {
    render(<AssistantInboxContainer live={{ runnerSessions: [liveSession], nowMs: Date.parse("2026-06-18T12:00:00.000Z") }} />);
    expect(screen.getByTestId("runner-theater-row-ms-live-1")).toBeTruthy();
    expect(screen.getByTestId("runner-theater-row-ms-live-1").getAttribute("data-liveness")).toBe("live");
    // PREVIEW example runners never leak into LIVE
    expect(screen.queryByTestId("runner-theater-row-ms-001")).toBeNull();
  });

  it("LIVE with no sessions shows an honest empty state (not a fixture)", () => {
    render(<AssistantInboxContainer live={{}} />);
    const card = screen.getByTestId("runner-theater-card");
    expect(card.getAttribute("data-total")).toBe("0");
    expect(screen.getByTestId("runner-theater-empty")).toBeTruthy();
    expect(screen.queryByTestId("runner-theater-row-ms-001")).toBeNull();
    // the empty-state copy must itself stay free of side-effect action words
    assertNoForbiddenActionText(card);
  });

  it("is read-only: no buttons, no side-effect/domain text", () => {
    render(<AssistantInboxContainer />);
    const card = screen.getByTestId("runner-theater-card");
    expect(card.querySelectorAll("button").length).toBe(0);
    assertNoSideEffectActionControls(card);
    assertNoForbiddenActionText(card);
  });
});
