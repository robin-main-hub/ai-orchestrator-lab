// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { bucketEventsByTime, buildWorkLanes } from "./AssistantInbox";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { buildAssistantInboxProps } from "../../lib/assistantInboxProjection";

afterEach(() => cleanup());

const NOW = Date.parse("2026-06-16T12:00:00.000Z");
const EVENTS = [
  { id: "e-today", type: "session.started", createdAt: "2026-06-16T09:00:00.000Z" }, // today
  { id: "e-recent", type: "mission.updated", createdAt: "2026-06-14T09:00:00.000Z" }, // recent (7d)
  { id: "e-old", type: "mission.archived", createdAt: "2026-06-01T00:00:00.000Z" }, // older → dropped
  { id: "e-bad", type: "broken.ts", createdAt: "not-a-date" }, // unparseable → skipped
];
const laneCount = (id: string) =>
  screen.getByTestId(`work-lane-${id}`).getAttribute("data-count");

describe("Batch 8 — LINE B: time bucketing (pure, injected now)", () => {
  it("buckets events into today/recent against an injected now; drops old + invalid", () => {
    const { today, recent } = bucketEventsByTime(EVENTS, NOW);
    expect(today).toEqual(["session.started"]);
    expect(recent).toEqual(["mission.updated"]);
  });

  it("returns honest-empty buckets without an injected now (never calls Date.now)", () => {
    expect(bucketEventsByTime(EVENTS)).toEqual({ today: [], recent: [] });
  });

  it("buildWorkLanes surfaces today/recent counts from timed events", () => {
    const lanes = buildWorkLanes(buildAssistantInboxProps(), { events: EVENTS, nowMs: NOW });
    const by = Object.fromEntries(lanes.map((l) => [l.id, l]));
    expect(by.today!.count).toBe(1);
    expect(by.recent!.count).toBe(1);
  });
});

describe("Batch 8 — LINE B: Today/Recent lanes in LIVE", () => {
  it("populates Today/Recent from real timed events", () => {
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    expect(laneCount("today")).toBe("1");
    expect(laneCount("recent")).toBe("1");
  });

  it("is honestly empty when no timed events are wired", () => {
    render(<AssistantInboxContainer live={{}} />);
    expect(laneCount("today")).toBe("0");
    expect(laneCount("recent")).toBe("0");
    expect(screen.getByTestId("work-lane-empty-today")).toBeTruthy();
  });
});
