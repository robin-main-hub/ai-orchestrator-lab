// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { buildWorkLanes } from "./AssistantInbox";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { buildAssistantInboxProps } from "../../lib/assistantInboxProjection";

afterEach(() => cleanup());

const NOW = Date.parse("2026-06-17T12:00:00.000Z");
const EVENTS = [
  { id: "e1", type: "runner.gate.changed", createdAt: "2026-06-17T09:00:00.000Z" }, // today → runner
  { id: "e2", type: "learning.hypothesis_verified", createdAt: "2026-06-15T09:00:00.000Z" }, // recent → learning
];

describe("Batch 9 — LINE B: semantic category badges on Today/Recent rows", () => {
  it("attaches a classifier category to today/recent lane items (pure)", () => {
    const lanes = buildWorkLanes(buildAssistantInboxProps(), { events: EVENTS, nowMs: NOW });
    const by = Object.fromEntries(lanes.map((l) => [l.id, l]));
    expect(by.today!.items[0]!.category).toBe("runner");
    expect(by.recent!.items[0]!.category).toBe("learning");
    // non-event lanes carry no fabricated category
    expect(by.waiting!.items.every((i) => i.category === undefined)).toBe(true);
  });

  it("renders the category badge on a today row in LIVE", () => {
    render(<AssistantInboxContainer live={{ recentEvents: EVENTS, nowMs: NOW }} />);
    const badge = screen.getByTestId("work-lane-category-today-0");
    expect(badge.getAttribute("data-category")).toBe("runner");
  });
});
