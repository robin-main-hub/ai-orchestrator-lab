// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { assertNoForbiddenActionText, assertNoSideEffectActionControls } from "./inboxInvariant";

afterEach(() => cleanup());

describe("Mission Operations Theater card", () => {
  it("PREVIEW renders a read-only operation map over runner, patch, candidate, evidence, source, and memory signals", () => {
    render(<AssistantInboxContainer />);

    const card = screen.getByTestId("mission-operations-theater-card");
    expect(Number(card.getAttribute("data-total"))).toBeGreaterThan(0);
    expect(Number(card.getAttribute("data-edges"))).toBeGreaterThan(0);
    expect(card.getAttribute("data-source")).toBe("example");

    expect(screen.getByTestId("mission-operations-group-active")).toBeTruthy();
    expect(screen.getByTestId("mission-operations-group-attention")).toBeTruthy();
    expect(screen.getByTestId("mission-operations-group-ready")).toBeTruthy();
    expect(screen.getByTestId("mission-operations-chip-runner-ms-001")).toBeTruthy();
    expect(screen.getByTestId("mission-operations-chip-patch-patch-001")).toBeTruthy();
    expect(screen.getByTestId("mission-operations-chip-candidate-wic-patch-patch-003")).toBeTruthy();
    expect(screen.getByTestId("mission-operations-chip-evidence-source-001")).toBeTruthy();
    expect(screen.getByTestId("mission-operations-chip-memory-learning-memory-console")).toBeTruthy();
  });

  it("LIVE with no mission operation inputs shows an honest empty state and no PREVIEW refs", () => {
    render(<AssistantInboxContainer live={{}} />);

    const card = screen.getByTestId("mission-operations-theater-card");
    expect(card.getAttribute("data-total")).toBe("0");
    expect(card.getAttribute("data-source")).toBe("empty");
    expect(screen.getByTestId("mission-operations-empty")).toBeTruthy();
    expect(screen.queryByTestId("mission-operations-chip-runner-ms-001")).toBeNull();
    expect(screen.queryByTestId("mission-operations-chip-patch-patch-001")).toBeNull();
  });

  it("is display-only: no side-effect controls or forbidden action labels", () => {
    render(<AssistantInboxContainer />);

    const card = screen.getByTestId("mission-operations-theater-card");
    expect(card.querySelectorAll("button").length).toBe(0);
    assertNoSideEffectActionControls(card);
    assertNoForbiddenActionText(card);
  });
});
