// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";

afterEach(() => cleanup());

describe("AssistantInboxContainer (mount + wire)", () => {
  it("mounts the inbox with every card section populated from projections", () => {
    render(<AssistantInboxContainer />);
    const inbox = screen.getByTestId("assistant-inbox");
    expect(inbox).toBeTruthy();
    // total > 0 proves the cards are not dead.
    expect(Number(inbox.getAttribute("data-total"))).toBeGreaterThan(0);
    expect(
      Number(screen.getByTestId("assistant-inbox-section-evidence").getAttribute("data-count")),
    ).toBeGreaterThan(0);
    expect(
      Number(screen.getByTestId("assistant-inbox-section-learning").getAttribute("data-count")),
    ).toBe(2);
    expect(
      Number(screen.getByTestId("assistant-inbox-section-memory").getAttribute("data-count")),
    ).toBe(2);
    expect(
      Number(screen.getByTestId("assistant-inbox-section-manifest").getAttribute("data-count")),
    ).toBe(4);
  });

  it("renders pass / warning / blocked verdicts honestly", () => {
    render(<AssistantInboxContainer />);
    // runner gate (dgx disabled) → blocked, observed false.
    const gate = screen.getByTestId("evidence-verdict-runner-gate-dgx_disabled");
    expect(gate.getAttribute("data-verdict")).toBe("blocked");
    // a committed evidence row is a pass.
    expect(screen.getByTestId("evidence-verdict-evidence-001").getAttribute("data-verdict")).toBe(
      "pass",
    );
    // published evidence surfaces as warning.
    expect(screen.getByTestId("evidence-verdict-evidence-002").getAttribute("data-verdict")).toBe(
      "warning",
    );
    // blocked manifest entries keep their blocking reason.
    expect(screen.getByTestId("runtime-manifest-reason-skill-003").getAttribute("data-reason")).toBe(
      "eval_failed",
    );
    expect(screen.getByTestId("runtime-manifest-reason-skill-004").getAttribute("data-reason")).toBe(
      "quarantined",
    );
  });

  it("is read-only: no button, no enable/approve, no callback on mount", () => {
    const spy = vi.fn();
    const { container } = render(
      <div onClick={spy}>
        <AssistantInboxContainer />
      </div>,
    );
    expect(container.querySelectorAll("button").length).toBe(0);
    const text = (container.textContent ?? "").toLowerCase();
    expect(/approve/.test(text)).toBe(false);
    expect(/enable/.test(text)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("renders observed:false honestly on the disabled runner gate", () => {
    render(<AssistantInboxContainer />);
    const card = screen.getByTestId("evidence-card-runner-gate-dgx_disabled");
    expect(card.getAttribute("data-observed")).toBe("false");
  });
});
