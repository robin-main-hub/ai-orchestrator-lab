// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import { assertNoSideEffectActionControls, assertNoForbiddenActionText } from "./inboxInvariant";

afterEach(() => cleanup());

// Batch 22 — SANDBOX is now an enabled, read-only "proposal only" seat: scenario
// proposal cards, dry-run badges, simulated-outcome labels, a watermark. ZERO
// execution / dispatch / write.

const sandbox = () =>
  render(
    <AssistantInboxContainer
      live={{}}
      command={{ kind: "mode", value: "sandbox", nonce: 1 }}
    />,
  );

describe("Batch 22 — Sandbox Proposal Shell", () => {
  it("the SANDBOX seat is selectable (no longer disabled)", () => {
    render(<AssistantInboxContainer live={{}} />);
    expect((screen.getByTestId("inbox-mode-option-sandbox") as HTMLInputElement).disabled).toBe(
      false,
    );
  });

  it("renders the proposal deck with a 'proposal only' watermark", () => {
    sandbox();
    const deck = screen.getByTestId("sandbox-proposal-deck");
    expect(deck).toBeTruthy();
    const wm = screen.getByTestId("sandbox-watermark").textContent ?? "";
    expect(wm).toContain("PROPOSAL ONLY");
    expect(wm).toContain("실행");
  });

  it("each proposal shows a dry-run badge + a simulated outcome label", () => {
    sandbox();
    expect(screen.getByTestId("sandbox-proposal-sbx-001")).toBeTruthy();
    expect(screen.getByTestId("sandbox-dryrun-sbx-001").textContent).toContain("dry-run");
    const outcome = screen.getByTestId("sandbox-outcome-sbx-002").getAttribute("data-outcome");
    expect(outcome?.startsWith("simulated-")).toBe(true);
  });

  it("the sandbox seat is read-only: no side-effect controls, no action text", () => {
    const { container } = sandbox();
    assertNoSideEffectActionControls(container);
    assertNoForbiddenActionText(screen.getByTestId("sandbox-proposal-deck"));
    // no normal live/preview cards leak into the sandbox body
    expect(screen.queryByTestId("plugin-sources")).toBeNull();
    expect(screen.queryByTestId("patch-candidate-lane")).toBeNull();
  });
});
