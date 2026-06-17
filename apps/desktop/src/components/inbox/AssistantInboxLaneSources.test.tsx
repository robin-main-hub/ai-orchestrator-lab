// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { buildWorkLanes } from "./AssistantInbox";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { buildAssistantInboxLiveProps } from "../../lib/assistantInboxProjection";

afterEach(() => cleanup());

const NOW = Date.parse("2026-06-17T12:00:00.000Z");
const EVENTS = [
  { id: "f", type: "sandbox.error_card", createdAt: "2026-06-17T09:00:00.000Z" }, // failure
  { id: "r", type: "runner.gate.changed", createdAt: "2026-06-17T08:00:00.000Z" }, // runner
  { id: "l", type: "learning.hypothesis_verified", createdAt: "2026-06-16T08:00:00.000Z" }, // learning
  { id: "a", type: "approval.requested", createdAt: "2026-06-16T07:00:00.000Z" }, // approval
];

describe("Batch 13 — LINE B/C: lanes draw from real classified OS events", () => {
  it("buckets event-log activity into Blocked/Runner/Learning/Waiting by category", () => {
    const lanes = buildWorkLanes(buildAssistantInboxLiveProps({}), { events: EVENTS, nowMs: NOW });
    const by = Object.fromEntries(lanes.map((l) => [l.id, l]));
    // LIVE base: the runner gate is one blocked + one runner row.
    expect(by.blocked!.count).toBe(2); // gate(blocked) + failure event
    expect(by.runner!.count).toBe(2); // gate + runner event
    expect(by.learning!.count).toBe(1); // learning event
    expect(by.waiting!.count).toBe(1); // approval event
    // event-derived rows keep their classifier category badge
    expect(by.learning!.items.some((i) => i.category === "learning")).toBe(true);
    expect(by.waiting!.items.some((i) => i.category === "approval")).toBe(true);
  });

  it("adds nothing when there are no events (honest empty / unchanged)", () => {
    const lanes = buildWorkLanes(buildAssistantInboxLiveProps({}));
    const by = Object.fromEntries(lanes.map((l) => [l.id, l]));
    expect(by.learning!.count).toBe(0);
    expect(by.waiting!.count).toBe(0);
    expect(by.runner!.count).toBe(1); // just the gate
  });

  it("renders the enriched counts in LIVE", () => {
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    expect(screen.getByTestId("work-lane-runner").getAttribute("data-count")).toBe("2");
    expect(screen.getByTestId("work-lane-learning").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("work-lane-waiting").getAttribute("data-count")).toBe("1");
  });
});
