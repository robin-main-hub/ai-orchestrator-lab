// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { assertNoSideEffectActionControls, assertNoForbiddenActionText } from "./inboxInvariant";

afterEach(() => cleanup());

// Engine E3 — Learning & Memory Console: a read-only roll-up of learning loop
// stages, memory candidates (honestly suggested), and memory-eval health.

describe("E3 — Learning & Memory console", () => {
  it("PREVIEW shows learning + eval roll-up with honest attention flags", () => {
    render(<AssistantInboxContainer />); // PREVIEW (fixtures)
    const card = screen.getByTestId("learning-memory-console");
    expect(card.getAttribute("data-has-data")).toBe("true");
    expect(screen.getByTestId("lm-learning-total")).toBeTruthy();
    // fixture eval reports → pass + warn + fail chips present
    expect(screen.getByTestId("lm-eval-pass")).toBeTruthy();
    expect(screen.getByTestId("lm-eval-warning")).toBeTruthy();
    expect(screen.getByTestId("lm-eval-fail")).toBeTruthy();
    // honest flags surfaced (rejected loop + memory eval fail), display-only
    expect(screen.getByTestId("lm-flag-0")).toBeTruthy();
    expect(card.textContent).toMatch(/rejected loop|memory eval fail/);
  });

  it("LIVE rolls up only real inputs (memory candidates from project records, no fixture leak)", () => {
    render(<AssistantInboxContainer live={{ projectRecords: [{ missionId: "m1", title: "real record" }] }} />);
    const card = screen.getByTestId("learning-memory-console");
    expect(card.getAttribute("data-has-data")).toBe("true");
    expect(screen.getByTestId("lm-memory-total").textContent).toContain("1 candidate");
    // no fixture learning loops or eval reports leak into LIVE
    expect(screen.queryByTestId("lm-learning-settled")).toBeNull();
    expect(screen.queryByTestId("lm-eval-pass")).toBeNull();
  });

  it("LIVE with no learning/memory shows an honest empty state", () => {
    render(<AssistantInboxContainer live={{}} />);
    const card = screen.getByTestId("learning-memory-console");
    expect(card.getAttribute("data-has-data")).toBe("false");
    expect(screen.getByTestId("learning-memory-empty")).toBeTruthy();
  });

  it("is read-only: no buttons, no side-effect/domain text", () => {
    render(<AssistantInboxContainer />);
    const card = screen.getByTestId("learning-memory-console");
    expect(card.querySelectorAll("button").length).toBe(0);
    assertNoSideEffectActionControls(card);
    assertNoForbiddenActionText(card);
  });
});
