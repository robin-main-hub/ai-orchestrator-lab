// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantInboxContainer } from "./AssistantInboxContainer";
import {
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
  collectActionControls,
} from "./inboxInvariant";

afterEach(() => cleanup());

// Batch 17 LINE B/C — clicking a patch candidate opens a local read-only detail
// drawer with grouped sections + a compact diff preview. No apply/commit/dispatch.

describe("Batch 17 LINE B — patch detail drawer", () => {
  it("clicking a candidate opens a read-only patch drawer with grouped sections", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("patch-candidate-patch-001"));
    const drawer = screen.getByTestId("source-detail-drawer");
    expect(drawer.getAttribute("data-kind")).toBe("patch");
    expect(screen.getByTestId("source-detail-section-identity")).toBeTruthy();
    expect(screen.getByTestId("source-detail-section-stats")).toBeTruthy();
    expect(screen.getByTestId("source-detail-section-safety")).toBeTruthy();
    expect(screen.getByTestId("source-detail-section-verification")).toBeTruthy();
    expect(screen.getByTestId("source-detail-field-candidateId").textContent).toContain("patch-001");
    expect(screen.getByTestId("source-detail-field-verificationStatus").textContent).toContain(
      "actual",
    );
  });

  it("the open drawer is read-only: only the local-detail close control, no action words", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("patch-candidate-patch-001"));
    const drawer = screen.getByTestId("source-detail-drawer");
    assertNoSideEffectActionControls(drawer);
    assertNoForbiddenActionText(drawer);
    const controls = collectActionControls(drawer);
    expect(controls.length).toBe(1); // just the close affordance
    expect(controls[0]!.getAttribute("data-action-scope")).toBe("local-detail");
  });

  it("Esc closes the patch drawer", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("patch-candidate-patch-001"));
    expect(screen.getByTestId("source-detail-drawer")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("source-detail-drawer")).toBeNull();
  });

  it("a blocked candidate is still inspectable (drawer opens, shows blockers)", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("patch-candidate-patch-003"));
    expect(screen.getByTestId("source-detail-drawer").getAttribute("data-kind")).toBe("patch");
    expect(screen.getByTestId("source-detail-field-blockers").textContent).toContain("not_observed");
  });
});

describe("Batch 17 LINE C — diff preview shell", () => {
  it("renders compact diff blocks with path / change / risk and the 'diff preview only' label", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("patch-candidate-patch-001"));
    const diff = screen.getByTestId("patch-diff-preview");
    expect(diff.textContent?.toLowerCase()).toContain("diff preview only");
    const file0 = screen.getByTestId("patch-diff-file-0");
    expect(file0.getAttribute("data-change")).toBe("modified");
    expect(file0.textContent).toContain("src/module-a.ts");
    expect(screen.getByTestId("patch-diff-risk-0").getAttribute("data-risk")).toBe("low");
  });

  it("a blocked candidate still shows its diff blocks (inspectable), with no apply/copy control", () => {
    render(<AssistantInboxContainer />);
    fireEvent.click(screen.getByTestId("patch-candidate-patch-003"));
    const diff = screen.getByTestId("patch-diff-preview");
    expect(screen.getByTestId("patch-diff-file-0").textContent).toContain("src/util.ts");
    // no apply/stage/copy controls inside the diff section
    expect(collectActionControls(diff).length).toBe(0);
    assertNoForbiddenActionText(diff);
  });
});
