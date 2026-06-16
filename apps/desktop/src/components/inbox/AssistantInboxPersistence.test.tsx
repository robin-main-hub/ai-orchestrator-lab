// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";

const KEY = "ai-orchestrator.inbox-view-mode.v1";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const viewMode = () => screen.getByTestId("assistant-inbox").getAttribute("data-view-mode");
const radio = (mode: string) =>
  screen.getByTestId(`inbox-mode-option-${mode}`) as HTMLInputElement;

describe("Batch 8 — LINE A: inbox view-mode persistence", () => {
  it("remembers the chosen seat across mounts when persistence is on", () => {
    render(<AssistantInboxContainer live={{}} persistViewMode />);
    expect(viewMode()).toBe("live"); // default with live wired
    fireEvent.click(radio("preview"));
    expect(viewMode()).toBe("preview");

    cleanup(); // fresh mount → initializer re-reads localStorage
    render(<AssistantInboxContainer live={{}} persistViewMode />);
    expect(viewMode()).toBe("preview");
    expect(radio("preview").checked).toBe(true);
  });

  it("falls back to LIVE (live wired) when the stored seat is invalid or disabled", () => {
    localStorage.setItem(KEY, JSON.stringify("replay")); // disabled seat → invalid
    render(<AssistantInboxContainer live={{}} persistViewMode />);
    expect(viewMode()).toBe("live");
    cleanup();
    localStorage.setItem(KEY, JSON.stringify("bogus")); // garbage → invalid
    render(<AssistantInboxContainer live={{}} persistViewMode />);
    expect(viewMode()).toBe("live");
  });

  it("opens LIVE when persistence is on, live is wired, and nothing is stored", () => {
    render(<AssistantInboxContainer live={{}} persistViewMode />);
    expect(viewMode()).toBe("live");
  });

  it("does not touch storage when persistence is off (isolated default behavior)", () => {
    render(<AssistantInboxContainer live={{}} />); // no persistViewMode
    fireEvent.click(radio("preview"));
    expect(viewMode()).toBe("preview");
    expect(localStorage.getItem(KEY)).toBeNull(); // nothing written
    cleanup();
    render(<AssistantInboxContainer live={{}} />); // fresh mount → default again, not remembered
    expect(viewMode()).toBe("live");
  });
});
