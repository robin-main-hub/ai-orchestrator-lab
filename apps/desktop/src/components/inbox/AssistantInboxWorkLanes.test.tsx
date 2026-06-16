// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildWorkLanes } from "./AssistantInbox";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  buildAssistantInboxProps,
  buildAssistantInboxLiveProps,
} from "../../lib/assistantInboxProjection";

afterEach(() => cleanup());

const laneCount = (id: string) =>
  screen.getByTestId(`work-lane-${id}`).getAttribute("data-count");
const radio = (mode: string) =>
  screen.getByTestId(`inbox-mode-option-${mode}`) as HTMLInputElement;

describe("Batch 7 — LINE B: work-queue lanes (pure bucketing)", () => {
  it("buckets the fixture composition into Today/Waiting/Blocked/Learning/Runner", () => {
    const lanes = buildWorkLanes(buildAssistantInboxProps());
    const by = Object.fromEntries(lanes.map((l) => [l.id, l]));
    expect(lanes.map((l) => l.id)).toEqual([
      "today",
      "recent",
      "waiting",
      "blocked",
      "learning",
      "runner",
    ]);
    expect(by.today!.count).toBe(0); // no timed events passed → honest empty
    expect(by.recent!.count).toBe(0);
    expect(by.waiting!.count).toBe(2); // memory candidates
    expect(by.blocked!.count).toBe(3); // runner gate (blocked) + 2 blocked manifest entries
    expect(by.learning!.count).toBe(2);
    expect(by.runner!.count).toBe(1); // runner gate row
  });

  it("LIVE-empty lanes are honest (only the runner gate shows; rest empty)", () => {
    const lanes = buildWorkLanes(buildAssistantInboxLiveProps({}));
    const by = Object.fromEntries(lanes.map((l) => [l.id, l]));
    expect(by.runner!.count).toBe(1);
    expect(by.blocked!.count).toBe(1); // gate is blocked
    expect(by.learning!.count).toBe(0);
    expect(by.waiting!.count).toBe(0);
    expect(by.today!.count).toBe(0);
  });

  it("carries no domain terms (generic OS items only)", () => {
    const blob = JSON.stringify(buildWorkLanes(buildAssistantInboxProps())).toLowerCase();
    for (const banned of ["erp", "gio", "customer", "sales", "example-domain", "서흥"]) {
      expect(blob.includes(banned)).toBe(false);
    }
  });
});

describe("Batch 7 — LINE B: lane rail render", () => {
  it("renders all five lanes read-only, with honest empty lanes in LIVE", () => {
    const { container } = render(<AssistantInboxContainer live={{}} />);
    expect(screen.getByTestId("work-lane-rail")).toBeTruthy();
    expect(laneCount("runner")).toBe("1");
    expect(laneCount("blocked")).toBe("1");
    expect(laneCount("learning")).toBe("0");
    expect(screen.getByTestId("work-lane-empty-learning")).toBeTruthy();
    expect(container.querySelectorAll("button").length).toBe(0);
  });

  it("reflects the preview fixture set when switched to PREVIEW", () => {
    render(<AssistantInboxContainer live={{}} />);
    fireEvent.click(radio("preview"));
    expect(laneCount("learning")).toBe("2");
    expect(laneCount("waiting")).toBe("2");
    expect(laneCount("blocked")).toBe("3");
  });
});
