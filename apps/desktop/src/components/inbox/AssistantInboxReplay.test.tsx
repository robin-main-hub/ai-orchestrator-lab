// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { projectReplayEvents } from "./AssistantInbox";
import { AssistantInboxContainer } from "./AssistantInboxContainer";

afterEach(() => cleanup());

const EVENTS = [
  { id: "e1", type: "session.started", createdAt: "2026-06-14T09:00:00.000Z" },
  { id: "e2", type: "mission.updated", createdAt: "2026-06-16T09:00:00.000Z" }, // newest
  { id: "e3", type: "mission.archived", createdAt: "2026-06-15T09:00:00.000Z" },
];
const radio = (mode: string) => screen.getByTestId(`inbox-mode-option-${mode}`) as HTMLInputElement;

describe("Batch 8 — LINE C: replay projection (pure, read-only)", () => {
  it("sorts newest-first and caps to the limit; never mutates input", () => {
    const input = [...EVENTS];
    const out = projectReplayEvents(input, 2);
    expect(out.map((e) => e.id)).toEqual(["e2", "e3"]); // newest two
    expect(input).toEqual(EVENTS); // input untouched
  });
});

describe("Batch 8 — LINE C: REPLAY mode shell", () => {
  it("REPLAY is selectable and replays recent eventLog read-only (no buttons, no cards)", () => {
    const { container } = render(<AssistantInboxContainer live={{ recentEvents: EVENTS }} />);
    expect(radio("replay").disabled).toBe(false);
    fireEvent.click(radio("replay"));

    const deck = screen.getByTestId("replay-deck");
    expect(deck.getAttribute("data-count")).toBe("3");
    expect(screen.getByTestId("replay-deck-item-0").textContent).toContain("mission.updated"); // newest first
    // replay replaces the card grid; it is a read-only playback
    expect(screen.queryByTestId("assistant-inbox-section-evidence")).toBeNull();
    expect(container.querySelectorAll("button").length).toBe(0);
  });

  it("shows an honest empty replay state when the event log is empty", () => {
    render(<AssistantInboxContainer live={{}} />);
    fireEvent.click(radio("replay"));
    expect(screen.getByTestId("replay-deck").getAttribute("data-count")).toBe("0");
    expect(screen.getByTestId("replay-deck-empty")).toBeTruthy();
  });
});
