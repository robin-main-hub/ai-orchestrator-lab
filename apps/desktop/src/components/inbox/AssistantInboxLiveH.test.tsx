// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { LEARNING_EVENT_FIXTURE } from "../../lib/assistantInboxProjection";

afterEach(() => cleanup());

describe("AssistantInboxContainer — LINE H honest live vs empty vs example", () => {
  it("renders honest EMPTY states with empty live inputs", () => {
    render(<AssistantInboxContainer live={{}} />);
    // learning / memory / manifest have no live data → empty, source "empty".
    for (const id of ["learning", "memory", "manifest"]) {
      const section = screen.getByTestId(`assistant-inbox-section-${id}`);
      expect(section.getAttribute("data-count")).toBe("0");
      expect(section.getAttribute("data-source")).toBe("empty");
      expect(screen.getByTestId(`assistant-inbox-section-empty-${id}`)).toBeTruthy();
      expect(screen.getByTestId(`assistant-inbox-source-${id}`).getAttribute("data-source")).toBe(
        "empty",
      );
    }
    // evidence = runner gate only (live), no example fixture.
    const ev = screen.getByTestId("assistant-inbox-section-evidence");
    expect(ev.getAttribute("data-source")).toBe("live");
    expect(ev.getAttribute("data-count")).toBe("1");
    // no example notice when nothing is example.
    expect(screen.queryByTestId("assistant-inbox-example-notice")).toBeNull();
  });

  it("renders LIVE cards labeled live when real inputs are provided", () => {
    render(
      <AssistantInboxContainer
        live={{
          learningEvents: LEARNING_EVENT_FIXTURE,
          projectRecords: [
            { missionId: "m-1", title: "real project one" },
            { missionId: "m-2", title: "real project two" },
          ],
        }}
      />,
    );
    const learning = screen.getByTestId("assistant-inbox-section-learning");
    expect(learning.getAttribute("data-source")).toBe("live");
    expect(Number(learning.getAttribute("data-count"))).toBe(2);

    const memory = screen.getByTestId("assistant-inbox-section-memory");
    expect(memory.getAttribute("data-source")).toBe("live");
    expect(Number(memory.getAttribute("data-count"))).toBe(2);
    // real project rows are observed:false (no memory writer wired) — honest.
    expect(
      screen.getByTestId("memory-observed-project-m-1").getAttribute("data-observed"),
    ).toBe("false");

    // no example anywhere → no notice.
    expect(screen.queryByTestId("assistant-inbox-example-notice")).toBeNull();
  });

  it("labels fixture/example evidence as 예시(fixture), never live", () => {
    render(<AssistantInboxContainer live={{ includeEvidenceExample: true }} />);
    const ev = screen.getByTestId("assistant-inbox-section-evidence");
    expect(ev.getAttribute("data-source")).toBe("example");
    const badge = screen.getByTestId("assistant-inbox-source-evidence");
    expect(badge.getAttribute("data-source")).toBe("example");
    expect(badge.textContent).toContain("예시");
    // example notice present.
    expect(screen.getByTestId("assistant-inbox-example-notice")).toBeTruthy();
    // example evidence ids are prefixed example- and never presented as live.
    expect(screen.getByTestId("evidence-card-example-evidence-001")).toBeTruthy();
  });

  it("legacy fixture mode (no live prop): every section labeled example", () => {
    render(<AssistantInboxContainer />);
    for (const id of ["evidence", "learning", "memory", "manifest"]) {
      expect(
        screen.getByTestId(`assistant-inbox-section-${id}`).getAttribute("data-source"),
      ).toBe("example");
    }
    expect(screen.getByTestId("assistant-inbox-example-notice")).toBeTruthy();
  });

  it("runner gate observed:false when gate disabled (live mode, honest)", () => {
    render(<AssistantInboxContainer live={{}} />);
    const card = screen.getByTestId("evidence-card-runner-gate-dgx_disabled");
    expect(card.getAttribute("data-observed")).toBe("false");
    expect(
      screen.getByTestId("evidence-verdict-runner-gate-dgx_disabled").getAttribute("data-verdict"),
    ).toBe("blocked");
  });

  it("is read-only in live mode: no button, no enable/approve, no callback on mount", () => {
    const spy = vi.fn();
    const { container } = render(
      <div onClick={spy}>
        <AssistantInboxContainer
          live={{
            learningEvents: LEARNING_EVENT_FIXTURE,
            projectRecords: [{ missionId: "m-1", title: "real project" }],
          }}
        />
      </div>,
    );
    expect(container.querySelectorAll("button").length).toBe(0);
    const text = (container.textContent ?? "").toLowerCase();
    expect(/approve/.test(text)).toBe(false);
    expect(/enable/.test(text)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
