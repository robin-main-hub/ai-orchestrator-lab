// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";

afterEach(() => cleanup());

const radio = (mode: string) =>
  screen.getByTestId(`inbox-mode-option-${mode}`) as HTMLInputElement;

describe("Batch 7 — LINE A/C: command strip severity + live event summary", () => {
  it("LIVE strip rolls up blocked/warnings and surfaces real event/record counts", () => {
    render(
      <AssistantInboxContainer
        live={{ eventLogCount: 7, projectRecords: [{ missionId: "m-1", title: "p" }] }}
      />,
    );
    const strip = screen.getByTestId("assistant-inbox-status-strip");
    expect(strip.getAttribute("data-blocked")).toBe("1"); // runner gate is blocked
    expect(strip.getAttribute("data-warnings")).toBe("0");
    expect(screen.getByTestId("assistant-inbox-stat-events").textContent).toContain("7 events");
    expect(screen.getByTestId("assistant-inbox-stat-records").textContent).toContain("1 records");
    expect(screen.getByTestId("assistant-inbox-update-source").textContent).toContain("eventLog");
  });

  it("LIVE with an empty event log is honest (no live data source, 0 events)", () => {
    render(<AssistantInboxContainer live={{ eventLogCount: 0 }} />);
    expect(screen.getByTestId("assistant-inbox-stat-events").textContent).toContain("0 events");
    expect(screen.getByTestId("assistant-inbox-update-source").textContent).toContain(
      "no live data",
    );
  });

  it("PREVIEW strip shows fixture severity and marks the source as fixture (no live counts)", () => {
    render(<AssistantInboxContainer live={{}} />);
    fireEvent.click(radio("preview"));
    const strip = screen.getByTestId("assistant-inbox-status-strip");
    expect(strip.getAttribute("data-blocked")).toBe("1"); // gate
    expect(strip.getAttribute("data-warnings")).toBe("1"); // evidence-002 warning
    expect(screen.getByTestId("assistant-inbox-update-source").textContent).toContain("fixture");
    // live-only counts are not fabricated in preview
    expect(screen.queryByTestId("assistant-inbox-stat-events")).toBeNull();
    expect(screen.queryByTestId("assistant-inbox-stat-records")).toBeNull();
  });

  it("the strip adds no buttons", () => {
    const { container } = render(<AssistantInboxContainer live={{ eventLogCount: 3 }} />);
    expect(container.querySelectorAll("button").length).toBe(0);
  });
});
