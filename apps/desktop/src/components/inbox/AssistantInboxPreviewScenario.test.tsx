// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";

afterEach(() => cleanup());

const verdict = (id: string) =>
  screen.getByTestId(`evidence-verdict-${id}`).getAttribute("data-verdict");

describe("Batch 7 — LINE E: preview scenario deck", () => {
  it("PREVIEW shows the scenario legend; LIVE does not", () => {
    render(<AssistantInboxContainer />); // no live → preview default
    expect(screen.getByTestId("assistant-inbox-preview-scenarios").textContent).toContain(
      "시나리오 덱",
    );
    cleanup(); // fresh mount so the default-mode initializer re-runs
    render(<AssistantInboxContainer live={{}} />); // live default
    expect(screen.queryByTestId("assistant-inbox-preview-scenarios")).toBeNull();
  });

  it("the preview deck covers the full verdict + state matrix", () => {
    render(<AssistantInboxContainer />); // preview default
    // verdicts
    expect(verdict("runner-gate-dgx_disabled")).toBe("blocked");
    expect(verdict("evidence-001")).toBe("pass");
    expect(verdict("evidence-002")).toBe("warning");
    // not observed (honest, never a fake pass)
    expect(
      screen.getByTestId("evidence-card-runner-gate-dgx_disabled").getAttribute("data-observed"),
    ).toBe("false");
    // manifest block reasons
    expect(screen.getByTestId("runtime-manifest-reason-skill-003").getAttribute("data-reason")).toBe(
      "eval_failed",
    );
    expect(screen.getByTestId("runtime-manifest-reason-skill-004").getAttribute("data-reason")).toBe(
      "quarantined",
    );
    // learning loop terminal states
    expect(screen.getByTestId("learning-loop-stage-loop-001").getAttribute("data-stage")).toBe(
      "verified",
    );
    expect(screen.getByTestId("learning-loop-card-loop-002").getAttribute("data-terminal")).toBe(
      "rejected",
    );
  });

  it("switching to LIVE removes the scenario data (no fixture leak)", () => {
    render(<AssistantInboxContainer live={{}} />); // live default
    expect(screen.queryByTestId("evidence-verdict-evidence-001")).toBeNull();
    expect(screen.queryByTestId("runtime-manifest-reason-skill-003")).toBeNull();
  });
});
